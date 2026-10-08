import pool from "../config/db.js";
import { BUSINESS_ID } from "../config/business.js";
import { emitToAdmins } from "../config/socket.js";
import { composeQtyDesc, mergeUnitRows } from "../config/units.js";

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const YMD = /^\d{4}-\d{2}-\d{2}$/;

// invoice_numbers is stored as a JSON array snapshot; always hand the client
// a real array.
function parseInvoiceNumbers(bonus) {
  try {
    bonus.invoice_numbers = JSON.parse(bonus.invoice_numbers) || [];
  } catch {
    bonus.invoice_numbers = [];
  }
  return bonus;
}

// Bonuses look at every NON-VOIDED invoice (paid, partial or unpaid; owner's
// call 2026-10-05, the page shows each one's status) created in the period.
// FREE goods lines (is_bonus = 1) are excluded from piece counts and totals so
// an already-given gift can't earn a second reward.
function periodRange(from, to) {
  if (!YMD.test(from || "") || !YMD.test(to || "") || from > to) return null;
  return [`${from} 00:00:00`, `${to} 23:59:59`];
}

// The list/detail period filter is optional: no from/to = all time. Returns
// the SQL condition on `${alias}.created_at` + its params, or null when a
// period was sent but is malformed.
function periodFilter(query, alias = "s") {
  if (!query.from && !query.to) return { sql: "", params: [] };
  const range = periodRange(query.from, query.to);
  if (!range) return null;
  return { sql: ` AND ${alias}.created_at BETWEEN ? AND ?`, params: range };
}

// GET /bonuses/clients?from=&to= — partner clients as cards with their
// invoice totals (voided excluded) in the period (all time when no period is sent)
// + all-time bonus history summary.
export async function listBonusClients(req, res) {
  const inner = periodFilter(req.query, "s2");
  const outer = periodFilter(req.query, "s");
  if (!inner) return res.status(400).json({ message: "Invalid period" });

  const [rows] = await pool.query(
    `SELECT c.id, c.display_number, c.name, c.phone, c.email, c.address,
            COUNT(s.id)                 AS invoice_count,
            COALESCE(SUM(s.total), 0)   AS invoice_total,
            MAX(s.created_at)           AS last_invoice_at,
            -- items = different products bought, never summed quantities
            (SELECT COUNT(DISTINCT COALESCE(si.product_id, CONCAT('n:', si.name_snapshot)))
               FROM sale_items si JOIN sales s2 ON s2.id = si.sale_id
              WHERE s2.client_id = c.id AND s2.status <> 'voided' AND si.is_bonus = 0${inner.sql}) AS qty,
            (SELECT COUNT(*) FROM sales s3
              WHERE s3.client_id = c.id AND s3.status <> 'voided'
                AND s3.bonus_marked_at IS NOT NULL)                   AS marked_count,
            (SELECT MAX(b.created_at) FROM bonuses b WHERE b.client_id = c.id) AS last_bonus_at,
            (SELECT COALESCE(SUM(b.total_amount), 0)
               FROM bonuses b WHERE b.client_id = c.id)               AS bonus_total,
            (SELECT COUNT(*) FROM bonuses b WHERE b.client_id = c.id) AS bonus_count
     FROM clients c
     LEFT JOIN sales s ON s.client_id = c.id AND s.status <> 'voided'${outer.sql}
     WHERE c.business_id = ? AND c.client_type = 'partner'
     GROUP BY c.id
     ORDER BY invoice_total DESC, c.display_number DESC`,
    [...inner.params, ...outer.params, BUSINESS_ID]
  );
  res.json(rows);
}

// GET /bonuses/clients/:id?from=&to= — everything the bonus detail page needs:
// the period's (or all-time) non-voided invoices, their per-product item lines
// (aggregated per invoice), and this client's past bonus awards.
export async function clientBonusDetail(req, res) {
  const period = periodFilter(req.query, "s");
  if (!period) return res.status(400).json({ message: "Invalid period" });
  const id = req.params.id;

  const [[client]] = await pool.query(
    "SELECT * FROM clients WHERE id = ? AND business_id = ?", [id, BUSINESS_ID]
  );
  if (!client) return res.status(404).json({ message: "Client not found" });

  const [invoices] = await pool.query(
    `SELECT s.id, s.invoice_number, s.total, s.amount_paid, s.status, s.created_at,
            s.bonus_marked_at, s.bonus_marked_by,
            (SELECT COUNT(DISTINCT COALESCE(si.product_id, CONCAT('n:', si.name_snapshot)))
               FROM sale_items si WHERE si.sale_id = s.id AND si.is_bonus = 0) AS qty
     FROM sales s
     WHERE s.client_id = ? AND s.business_id = ? AND s.status <> 'voided'${period.sql}
     ORDER BY s.id DESC`,
    [id, BUSINESS_ID, ...period.params]
  );

  // A product can appear on several lines of one invoice (loose + box), so
  // aggregate per invoice + product + unit first, then merge units into one
  // line per product with a real-unit qty_desc ("10 × Box of 8 + 5 tubes").
  const [unitRows] = await pool.query(
    `SELECT si.sale_id, s.invoice_number, s.created_at,
            si.product_id, si.name_snapshot AS product_name, si.unit_name,
            COALESCE(MAX(p.base_unit), 'pcs') AS base_unit,
            SUM(si.quantity)                  AS qty,
            SUM(si.quantity * si.unit_factor) AS pieces,
            SUM(si.line_total)                AS line_total
     FROM sale_items si
     JOIN sales s ON s.id = si.sale_id
     LEFT JOIN products p ON p.id = si.product_id
     WHERE s.client_id = ? AND s.business_id = ? AND s.status <> 'voided'
       AND si.is_bonus = 0${period.sql}
     GROUP BY si.sale_id, s.invoice_number, s.created_at, si.product_id, si.name_snapshot, si.unit_name
     ORDER BY s.id DESC, (si.unit_name IS NULL), line_total DESC`,
    [id, BUSINESS_ID, ...period.params]
  );
  const items = mergeUnitRows(
    unitRows,
    (r) => `${r.sale_id}|${r.product_id ?? "x"}|${r.product_name}`,
    ["pieces", "line_total"]
  ).map((l) => ({ ...l, line_total: round2(l.line_total) }));

  const [history] = await pool.query(
    `SELECT * FROM bonuses WHERE client_id = ? AND business_id = ?
     ORDER BY id DESC LIMIT 50`,
    [id, BUSINESS_ID]
  );
  if (history.length) {
    const [historyItems] = await pool.query(
      "SELECT * FROM bonus_items WHERE bonus_id IN (?) ORDER BY id",
      [history.map((b) => b.id)]
    );
    const byBonus = new Map(history.map((b) => [b.id, (b.items = [])]));
    for (const it of historyItems) byBonus.get(it.bonus_id)?.push(it);
  }
  history.forEach(parseInvoiceNumbers);

  const invoice_total = round2(invoices.reduce((s, i) => s + Number(i.total), 0));
  // Different products across the whole period (one product bought on five
  // invoices is still one item)
  const [[{ qty }]] = await pool.query(
    `SELECT COUNT(DISTINCT COALESCE(si.product_id, CONCAT('n:', si.name_snapshot))) AS qty
     FROM sale_items si JOIN sales s ON s.id = si.sale_id
     WHERE s.client_id = ? AND s.business_id = ? AND s.status <> 'voided'
       AND si.is_bonus = 0${period.sql}`,
    [id, BUSINESS_ID, ...period.params]
  );
  res.json({
    client, invoices, items, history,
    period: { invoice_count: invoices.length, invoice_total, qty },
  });
}

// One reward value on a basis amount: a percentage of the basis or a fixed
// amount. Returns { pct, amount } or { error }.
function rewardValue(type, pctIn, amountIn, basis, label) {
  if (type === "fixed") {
    const amount = round2(amountIn);
    return amount > 0 ? { pct: null, amount } : { error: `${label}: the fixed amount must be greater than zero` };
  }
  const pct = Number(pctIn);
  if (!(pct > 0) || pct > 100) return { error: `${label}: the percentage must be between 0 and 100` };
  if (!(Number(basis) > 0)) return { error: `${label}: there is no amount to take a percentage of` };
  return { pct, amount: round2((Number(basis) * pct) / 100) };
}

// POST /bonuses — save an award. Two optional reward levels, any mix:
//   level1  % of the SELECTED invoices' sum, or a fixed amount
//   items   product lines of selected invoices, re-read from sale_items
// Amounts are recomputed from the DB, never trusted. The stored period is the
// span of the selected invoices (no period filter is sent; the list may be
// all time), so the paper prints what was actually counted.
// Body: { client_id, invoice_ids: [..], note?, level1?: { type, pct?, amount? } | null,
//         items?: [{ sale_id, product_id, product_name, bonus_type, pct?, amount? }] }
export async function createBonus(req, res) {
  if (Array.isArray(req.body?.lines)) return createPickedBonus(req, res);
  const { client_id, invoice_ids, level1 = null, note = null, items = [] } = req.body || {};
  if (!Array.isArray(items)) return res.status(400).json({ message: "Invalid bonus items" });
  const invoiceIds = [...new Set((Array.isArray(invoice_ids) ? invoice_ids : []).map(Number))];
  if (invoiceIds.length === 0 || invoiceIds.some((n) => !Number.isInteger(n) || n < 1)) {
    return res.status(400).json({ message: "Select at least one invoice" });
  }

  const conn = await pool.getConnection();
  const fail = async (status, message) => {
    await conn.rollback();
    return res.status(status).json({ message });
  };
  try {
    await conn.beginTransaction();
    const [[client]] = await conn.query(
      "SELECT * FROM clients WHERE id = ? AND business_id = ? FOR UPDATE", [client_id, BUSINESS_ID]
    );
    if (!client) return await fail(404, "Client not found");

    // Every selected invoice must be a non-voided invoice of this client
    const [invRows] = await conn.query(
      `SELECT id, invoice_number, total, DATE_FORMAT(created_at, '%Y-%m-%d') AS day FROM sales
       WHERE id IN (?) AND client_id = ? AND business_id = ? AND status <> 'voided'
       ORDER BY id`,
      [invoiceIds, client.id, BUSINESS_ID]
    );
    if (invRows.length !== invoiceIds.length) {
      return await fail(400, "A selected invoice is voided or belongs to another client");
    }
    const days = invRows.map((r) => r.day).sort();
    const periodFrom = days[0];
    const periodTo = days[days.length - 1];
    const invoiceTotal = round2(invRows.reduce((s, r) => s + Number(r.total), 0));
    const invoiceNumbers = invRows.map((r) => r.invoice_number);

    // Invoice-total level (optional)
    let l1Type = null;
    let l1Pct = null;
    let l1Amount = 0;
    if (level1) {
      l1Type = level1.type === "fixed" ? "fixed" : "percent";
      const v = rewardValue(l1Type, level1.pct, level1.amount, invoiceTotal, "Invoice total bonus");
      if (v.error) return await fail(400, v.error);
      l1Pct = v.pct;
      l1Amount = v.amount;
    }

    // Item level: each line must come from a SELECTED invoice and is re-read
    // from sale_items (product_id may be NULL after a product hard-delete, so
    // the name snapshot disambiguates)
    const itemRows = [];
    let itemsAmount = 0;
    for (const it of items) {
      if (!invoiceIds.includes(Number(it.sale_id))) {
        return await fail(400, "An item line belongs to an unselected invoice");
      }
      const [lineUnits] = await conn.query(
        `SELECT s.invoice_number, si.unit_name,
                COALESCE(MAX(p.base_unit), 'pcs') AS base_unit,
                SUM(si.quantity)                  AS qty,
                SUM(si.quantity * si.unit_factor) AS pieces,
                SUM(si.line_total)                AS line_total
         FROM sale_items si
         JOIN sales s ON s.id = si.sale_id
         LEFT JOIN products p ON p.id = si.product_id
         WHERE si.sale_id = ? AND (si.product_id <=> ?) AND si.name_snapshot = ?
           AND si.is_bonus = 0 AND s.client_id = ? AND s.business_id = ? AND s.status <> 'voided'
         GROUP BY s.invoice_number, si.unit_name
         ORDER BY (si.unit_name IS NULL), line_total DESC`,
        [it.sale_id, it.product_id ?? null, String(it.product_name || ""), client.id, BUSINESS_ID]
      );
      if (lineUnits.length === 0) return await fail(400, "A selected item is not on a selected invoice");
      const line = {
        invoice_number: lineUnits[0].invoice_number,
        pieces: lineUnits.reduce((s, r) => s + Number(r.pieces), 0),
        line_total: round2(lineUnits.reduce((s, r) => s + Number(r.line_total), 0)),
        qty_desc: composeQtyDesc(lineUnits, lineUnits[0].base_unit),
      };
      const type = it.bonus_type === "fixed" ? "fixed" : "percent";
      const v = rewardValue(type, it.pct, it.amount, line.line_total, String(it.product_name || "Item"));
      if (v.error) return await fail(400, v.error);
      itemsAmount = round2(itemsAmount + v.amount);
      itemRows.push([
        BUSINESS_ID, it.sale_id, line.invoice_number, it.product_id ?? null,
        String(it.product_name || ""), Number(line.pieces), line.qty_desc, line.line_total,
        type, v.pct, v.amount,
      ]);
    }

    const totalAmount = round2(l1Amount + itemsAmount);
    if (!(totalAmount > 0)) return await fail(400, "Add at least one reward");

    const [result] = await conn.query(
      `INSERT INTO bonuses (business_id, client_id, client_name, period_from, period_to,
                            invoice_count, invoice_total, invoice_numbers, level1_type,
                            level1_pct, level1_amount, items_amount, total_amount,
                            note, user_id, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [BUSINESS_ID, client.id, client.name, periodFrom, periodTo, invRows.length, invoiceTotal,
       JSON.stringify(invoiceNumbers), l1Type, l1Pct, l1Amount, itemsAmount, totalAmount,
       note || null, req.user.id, req.user.name]
    );
    if (itemRows.length) {
      await conn.query(
        `INSERT INTO bonus_items (bonus_id, business_id, sale_id, invoice_number, product_id,
                                  product_name, pieces, qty_desc, line_total, bonus_type, pct, amount)
         VALUES ${itemRows.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").join(", ")}`,
        itemRows.flatMap((row) => [result.insertId, ...row])
      );
    }

    // The awarded invoices got their bonus, so their "marked for bonus" flag
    // has done its job.
    await conn.query(
      "UPDATE sales SET bonus_marked_at = NULL, bonus_marked_by = NULL WHERE id IN (?) AND business_id = ?",
      [invRows.map((r) => r.id), BUSINESS_ID]
    );

    const [[bonus]] = await conn.query("SELECT * FROM bonuses WHERE id = ?", [result.insertId]);
    const [bonusItems] = await conn.query(
      "SELECT * FROM bonus_items WHERE bonus_id = ? ORDER BY id", [result.insertId]
    );
    await conn.commit();
    emitToAdmins("bonus:changed", { type: "create", id: bonus.id, client_id: client.id });
    res.status(201).json({ ...parseInvoiceNumbers(bonus), items: bonusItems });
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// POST /bonuses with `lines` — an award on items picked in the POS, NOT on
// invoices (owner 2026-10-05): the lines are only the basis to reward (what the
// client is buying), so nothing is sold, no stock moves and no money is
// recorded. ONE reward kind (owner 2026-10-08): a dollar rate per unit on each
// product + unit line, bonus = quantity x rate ("50 Box x $0.50 = $25.00"). A
// product picked in two units is two lines with their own rate.
// Stored with invoice_count 0 and invoice_numbers [] (that is what marks a
// picked-items award), period = today, one bonus_items row per rewarded
// product + unit (sale_id NULL, invoice_number '', bonus_type 'fixed',
// unit_rate = the rate).
// Body: { client_id, lines: [{ product_id, unit_id?, quantity, price }], note?,
//         items: [{ product_id, unit_id?, rate }] }
async function createPickedBonus(req, res) {
  const { client_id, lines, note = null, items = [] } = req.body;
  if (!Array.isArray(items)) return res.status(400).json({ message: "Invalid bonus items" });
  if (lines.length === 0) return res.status(400).json({ message: "Add at least one item" });
  for (const l of lines) {
    if (!(Number(l.quantity) > 0) || !(Number(l.price) >= 0) || !Number.isInteger(Number(l.product_id))) {
      return res.status(400).json({ message: "Invalid item line" });
    }
  }

  const conn = await pool.getConnection();
  const fail = async (status, message) => {
    await conn.rollback();
    return res.status(status).json({ message });
  };
  try {
    await conn.beginTransaction();
    const [[client]] = await conn.query(
      "SELECT * FROM clients WHERE id = ? AND business_id = ? FOR UPDATE", [client_id, BUSINESS_ID]
    );
    if (!client) return await fail(404, "Client not found");

    const productIds = [...new Set(lines.map((l) => Number(l.product_id)))];
    const [products] = await conn.query(
      "SELECT id, name, base_unit FROM products WHERE id IN (?) AND business_id = ? AND is_deleted = 0",
      [productIds, BUSINESS_ID]
    );
    const [units] = await conn.query(
      "SELECT id, product_id, name, factor FROM product_units WHERE product_id IN (?)", [productIds]
    );
    const productById = new Map(products.map((p) => [p.id, p]));

    // One line per product + unit, names and units resolved here
    const keyOf = (productId, unitId) => `${Number(productId)}:${unitId ? Number(unitId) : 0}`;
    const byUnit = new Map();
    for (const l of lines) {
      const product = productById.get(Number(l.product_id));
      if (!product) return await fail(400, `Product #${Number(l.product_id)} is not available`);
      const unit = l.unit_id ? units.find((u) => u.id === Number(l.unit_id) && u.product_id === product.id) : null;
      if (l.unit_id && !unit) return await fail(400, `Invalid unit for "${product.name}"`);
      const key = keyOf(product.id, unit?.id);
      let line = byUnit.get(key);
      if (!line) {
        line = { product, unit_name: unit?.name ?? null, factor: unit ? Number(unit.factor) : 1, qty: 0, line_total: 0 };
        byUnit.set(key, line);
      }
      const qty = Number(l.quantity);
      line.qty += qty;
      line.line_total = round2(line.line_total + qty * Number(l.price));
    }
    const basisTotal = round2([...byUnit.values()].reduce((s, l) => s + l.line_total, 0));

    const itemRows = [];
    const seen = new Set();
    let itemsAmount = 0;
    for (const it of items) {
      const key = keyOf(it.product_id, it.unit_id);
      const line = byUnit.get(key);
      if (!line) return await fail(400, "A rewarded product is not in the items");
      if (seen.has(key)) continue;
      seen.add(key);
      const rate = round2(it.rate);
      if (!(rate > 0)) return await fail(400, `${line.product.name}: the bonus per unit must be greater than zero`);
      const amount = round2(line.qty * rate);
      itemsAmount = round2(itemsAmount + amount);
      itemRows.push([
        BUSINESS_ID, null, "", line.product.id, line.product.name, Math.round(line.qty * line.factor),
        composeQtyDesc([{ qty: line.qty, unit_name: line.unit_name }], line.product.base_unit),
        line.line_total, "fixed", null, rate, amount,
      ]);
    }

    if (!(itemsAmount > 0)) return await fail(400, "Add at least one reward");

    const [result] = await conn.query(
      `INSERT INTO bonuses (business_id, client_id, client_name, period_from, period_to,
                            invoice_count, invoice_total, invoice_numbers, level1_type,
                            level1_pct, level1_amount, items_amount, total_amount,
                            note, user_id, created_by)
       VALUES (?, ?, ?, CURDATE(), CURDATE(), 0, ?, '[]', NULL, NULL, 0, ?, ?, ?, ?, ?)`,
      [BUSINESS_ID, client.id, client.name, basisTotal, itemsAmount, itemsAmount,
       note || null, req.user.id, req.user.name]
    );
    await conn.query(
      `INSERT INTO bonus_items (bonus_id, business_id, sale_id, invoice_number, product_id, product_name,
                                pieces, qty_desc, line_total, bonus_type, pct, unit_rate, amount)
       VALUES ${itemRows.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").join(", ")}`,
      itemRows.flatMap((row) => [result.insertId, ...row])
    );

    const [[bonus]] = await conn.query("SELECT * FROM bonuses WHERE id = ?", [result.insertId]);
    const [bonusItems] = await conn.query(
      "SELECT * FROM bonus_items WHERE bonus_id = ? ORDER BY id", [result.insertId]
    );
    await conn.commit();
    emitToAdmins("bonus:changed", { type: "create", id: bonus.id, client_id: client.id });
    res.status(201).json({ ...parseInvoiceNumbers(bonus), items: bonusItems });
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// DELETE /bonuses/:id — hard delete (items cascade), like everything but products
export async function deleteBonus(req, res) {
  const [[bonus]] = await pool.query(
    "SELECT id, client_id FROM bonuses WHERE id = ? AND business_id = ?",
    [req.params.id, BUSINESS_ID]
  );
  if (!bonus) return res.status(404).json({ message: "Bonus not found" });
  await pool.query("DELETE FROM bonuses WHERE id = ?", [bonus.id]);
  emitToAdmins("bonus:changed", { type: "delete", id: bonus.id, client_id: bonus.client_id });
  res.json({ message: "Bonus deleted" });
}
