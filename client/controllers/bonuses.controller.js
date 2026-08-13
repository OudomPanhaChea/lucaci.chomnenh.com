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

// Bonuses only ever look at FULLY PAID invoices (status = 'paid') created in
// the period; partial/unpaid money hasn't been earned yet and voided is gone.
// FREE goods lines (is_bonus = 1) are excluded from piece counts and totals so
// an already-given gift can't earn a second reward.
function periodRange(from, to) {
  if (!YMD.test(from || "") || !YMD.test(to || "") || from > to) return null;
  return [`${from} 00:00:00`, `${to} 23:59:59`];
}

// GET /bonuses/clients?from=&to= — partner clients as cards with their
// fully-paid purchase totals in the period + all-time bonus history summary.
export async function listBonusClients(req, res) {
  const range = periodRange(req.query.from, req.query.to);
  if (!range) return res.status(400).json({ message: "A valid from/to period is required" });

  const [rows] = await pool.query(
    `SELECT c.id, c.display_number, c.name, c.phone, c.email, c.address,
            COUNT(s.id)                 AS paid_invoices,
            COALESCE(SUM(s.total), 0)   AS paid_total,
            MAX(s.created_at)           AS last_paid_at,
            (SELECT COALESCE(SUM(si.quantity), 0)
               FROM sale_items si JOIN sales s2 ON s2.id = si.sale_id
              WHERE s2.client_id = c.id AND s2.status = 'paid' AND si.is_bonus = 0
                AND s2.created_at BETWEEN ? AND ?)                    AS qty,
            (SELECT MAX(b.created_at) FROM bonuses b WHERE b.client_id = c.id) AS last_bonus_at,
            (SELECT COALESCE(SUM(b.total_amount), 0)
               FROM bonuses b WHERE b.client_id = c.id)               AS bonus_total,
            (SELECT COUNT(*) FROM bonuses b WHERE b.client_id = c.id) AS bonus_count
     FROM clients c
     LEFT JOIN sales s ON s.client_id = c.id AND s.status = 'paid'
                      AND s.created_at BETWEEN ? AND ?
     WHERE c.business_id = ? AND c.client_type = 'partner'
     GROUP BY c.id
     ORDER BY paid_total DESC, c.display_number DESC`,
    [...range, ...range, BUSINESS_ID]
  );
  res.json(rows);
}

// GET /bonuses/clients/:id?from=&to= — everything the bonus detail page needs:
// the period's fully paid invoices, their per-product item lines (aggregated
// per invoice, in base pieces), and this client's past bonus awards.
export async function clientBonusDetail(req, res) {
  const range = periodRange(req.query.from, req.query.to);
  if (!range) return res.status(400).json({ message: "A valid from/to period is required" });
  const id = req.params.id;

  const [[client]] = await pool.query(
    "SELECT * FROM clients WHERE id = ? AND business_id = ?", [id, BUSINESS_ID]
  );
  if (!client) return res.status(404).json({ message: "Client not found" });

  const [invoices] = await pool.query(
    `SELECT s.id, s.invoice_number, s.total, s.created_at,
            (SELECT COALESCE(SUM(si.quantity), 0)
               FROM sale_items si WHERE si.sale_id = s.id AND si.is_bonus = 0) AS qty
     FROM sales s
     WHERE s.client_id = ? AND s.business_id = ? AND s.status = 'paid'
       AND s.created_at BETWEEN ? AND ?
     ORDER BY s.id DESC`,
    [id, BUSINESS_ID, ...range]
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
     WHERE s.client_id = ? AND s.business_id = ? AND s.status = 'paid'
       AND si.is_bonus = 0 AND s.created_at BETWEEN ? AND ?
     GROUP BY si.sale_id, s.invoice_number, s.created_at, si.product_id, si.name_snapshot, si.unit_name
     ORDER BY s.id DESC, (si.unit_name IS NULL), line_total DESC`,
    [id, BUSINESS_ID, ...range]
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

  const paid_total = round2(invoices.reduce((s, i) => s + Number(i.total), 0));
  const qty = invoices.reduce((s, i) => s + Number(i.qty), 0);
  res.json({
    client, invoices, items, history,
    period: { invoice_count: invoices.length, paid_total, qty },
  });
}

// POST /bonuses — save an award. Amounts are recomputed server-side from the
// DB (never trusted from the client): the invoice-total level from the
// SELECTED invoices' sum, item lines from their sale_items rows.
// Body: { client_id, from, to, invoice_ids: [..], note?,
//         level1: { type: percent|fixed, pct?, amount? } | null,
//         items: [{ sale_id, product_id, product_name, bonus_type, pct?, amount? }] }
export async function createBonus(req, res) {
  const { client_id, from, to, invoice_ids, level1 = null, note = null, items = [] } = req.body || {};
  const range = periodRange(from, to);
  if (!range) return res.status(400).json({ message: "A valid from/to period is required" });
  if (!Array.isArray(items)) return res.status(400).json({ message: "Invalid bonus items" });
  const invoiceIds = [...new Set((Array.isArray(invoice_ids) ? invoice_ids : []).map(Number))];
  if (invoiceIds.length === 0 || invoiceIds.some((n) => !Number.isInteger(n) || n < 1)) {
    return res.status(400).json({ message: "Select at least one invoice" });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[client]] = await conn.query(
      "SELECT * FROM clients WHERE id = ? AND business_id = ? FOR UPDATE", [client_id, BUSINESS_ID]
    );
    if (!client) {
      await conn.rollback();
      return res.status(404).json({ message: "Client not found" });
    }

    // Every selected invoice must be a fully paid invoice of this client in
    // the period; the award's totals come from this selection only.
    const [invRows] = await conn.query(
      `SELECT id, invoice_number, total FROM sales
       WHERE id IN (?) AND client_id = ? AND business_id = ? AND status = 'paid'
         AND created_at BETWEEN ? AND ?
       ORDER BY id`,
      [invoiceIds, client.id, BUSINESS_ID, ...range]
    );
    if (invRows.length !== invoiceIds.length) {
      await conn.rollback();
      return res.status(400).json({ message: "A selected invoice is not a fully paid invoice in this period" });
    }
    const invoiceTotal = round2(invRows.reduce((s, r) => s + Number(r.total), 0));
    const invoiceNumbers = invRows.map((r) => r.invoice_number);

    // Invoice-total level (optional): pct of the selected sum, or a fixed amount
    let l1Type = null;
    let l1Pct = null;
    let l1Amount = 0;
    if (level1) {
      l1Type = level1.type === "fixed" ? "fixed" : "percent";
      if (l1Type === "fixed") {
        l1Amount = round2(level1.amount);
        if (!(l1Amount > 0)) {
          await conn.rollback();
          return res.status(400).json({ message: "The invoice bonus amount must be greater than zero" });
        }
      } else {
        l1Pct = Number(level1.pct);
        if (!(l1Pct > 0) || l1Pct > 100) {
          await conn.rollback();
          return res.status(400).json({ message: "The invoice bonus percentage must be between 0 and 100" });
        }
        if (!(invoiceTotal > 0)) {
          await conn.rollback();
          return res.status(400).json({ message: "The selected invoices have no total to reward" });
        }
        l1Amount = round2((invoiceTotal * l1Pct) / 100);
      }
    }

    // Item level: each line must come from a SELECTED invoice and is re-read
    // from sale_items (product_id may be NULL after a product hard-delete, so
    // the name snapshot disambiguates)
    const itemRows = [];
    let itemsAmount = 0;
    for (const it of items) {
      if (!invoiceIds.includes(Number(it.sale_id))) {
        await conn.rollback();
        return res.status(400).json({ message: "An item line belongs to an unselected invoice" });
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
           AND si.is_bonus = 0 AND s.client_id = ? AND s.business_id = ?
           AND s.status = 'paid' AND s.created_at BETWEEN ? AND ?
         GROUP BY s.invoice_number, si.unit_name
         ORDER BY (si.unit_name IS NULL), line_total DESC`,
        [it.sale_id, it.product_id ?? null, String(it.product_name || ""),
         client.id, BUSINESS_ID, ...range]
      );
      if (lineUnits.length === 0) {
        await conn.rollback();
        return res.status(400).json({ message: "A selected item is not in this period's paid invoices" });
      }
      const line = {
        invoice_number: lineUnits[0].invoice_number,
        pieces: lineUnits.reduce((s, r) => s + Number(r.pieces), 0),
        line_total: round2(lineUnits.reduce((s, r) => s + Number(r.line_total), 0)),
        qty_desc: composeQtyDesc(lineUnits, lineUnits[0].base_unit),
      };
      let amount;
      let pct = null;
      if (it.bonus_type === "fixed") {
        amount = round2(it.amount);
        if (!(amount > 0)) {
          await conn.rollback();
          return res.status(400).json({ message: "Fixed bonus amounts must be greater than zero" });
        }
      } else {
        pct = Number(it.pct);
        if (!(pct > 0) || pct > 100) {
          await conn.rollback();
          return res.status(400).json({ message: "Item percentages must be between 0 and 100" });
        }
        amount = round2((Number(line.line_total) * pct) / 100);
      }
      itemsAmount = round2(itemsAmount + amount);
      itemRows.push([
        BUSINESS_ID, it.sale_id, line.invoice_number, it.product_id ?? null,
        String(it.product_name || ""), Number(line.pieces), line.qty_desc, round2(line.line_total),
        it.bonus_type === "fixed" ? "fixed" : "percent", pct, amount,
      ]);
    }

    const totalAmount = round2(l1Amount + itemsAmount);
    if (!(totalAmount > 0)) {
      await conn.rollback();
      return res.status(400).json({ message: "Select at least one bonus to award" });
    }

    const [result] = await conn.query(
      `INSERT INTO bonuses (business_id, client_id, client_name, period_from, period_to,
                            invoice_count, invoice_total, invoice_numbers, level1_type,
                            level1_pct, level1_amount, items_amount, total_amount,
                            note, user_id, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [BUSINESS_ID, client.id, client.name, from, to, invRows.length, invoiceTotal,
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
