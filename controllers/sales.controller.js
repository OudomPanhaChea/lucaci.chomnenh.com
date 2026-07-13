import pool from "../config/db.js";
import { BUSINESS_ID } from "../config/business.js";
import { emitToAdmins } from "../config/socket.js";

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

const PAYMENT_METHODS = ["cash", "khqr", "card", "bank", "other"];
const saleStatus = (paid, total) => (paid >= total ? "paid" : paid > 0 ? "partial" : "unpaid");

// Totals are always recomputed server-side from DB prices — the client's
// displayed totals are never trusted. A sale may be paid in full, partially,
// or not at all (on account); anything less than full requires a client, and
// `use_credit` spends the client's prepaid balance first.
// Cart items may carry `unit_id` (a product_units row: sell N pieces as one
// "Box of 12" line), `price` (negotiated override for the line's unit price),
// and `is_bonus` (FREE goods given with a bulk deal — price forced to 0,
// stock and cost still tracked).
export async function createSale(req, res) {
  const { items, client_id, discount_pct = 0, payment_method = "cash",
          amount_received = null, note = null,
          amount_paid = null, use_credit = false } = req.body || {};

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ message: "Cart is empty" });
  }
  for (const it of items) {
    if (!Number.isInteger(it?.quantity) || it.quantity < 1 || !it.product_id) {
      return res.status(400).json({ message: "Invalid cart item" });
    }
    if (it.price !== undefined && it.price !== null &&
        (Number.isNaN(Number(it.price)) || Number(it.price) < 0)) {
      return res.status(400).json({ message: "Invalid line price" });
    }
  }
  if (amount_paid !== null && (Number.isNaN(Number(amount_paid)) || Number(amount_paid) < 0)) {
    return res.status(400).json({ message: "Invalid paid amount" });
  }
  const saleDiscountPct = Math.min(Math.max(Number(discount_pct) || 0, 0), 100);

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [[settings]] = await conn.query(
      "SELECT * FROM settings WHERE business_id = ?", [BUSINESS_ID]
    );

    // Lock product rows so concurrent sales can't oversell
    const ids = items.map((i) => i.product_id);
    const [products] = await conn.query(
      "SELECT * FROM products WHERE id IN (?) AND business_id = ? AND is_deleted = 0 AND is_active = 1 FOR UPDATE",
      [ids, BUSINESS_ID]
    );
    const byId = new Map(products.map((p) => [p.id, p]));

    // Bulk units of the products in the cart; a line's unit must belong to
    // its own product. Stock is always counted in base pieces (qty × factor).
    const [unitDefs] = await conn.query(
      "SELECT * FROM product_units WHERE business_id = ? AND product_id IN (?)",
      [BUSINESS_ID, ids]
    );
    const unitById = new Map(unitDefs.map((u) => [u.id, u]));

    let subtotal = 0;
    let totalCost = 0;
    const lineRows = [];
    const stockOut = []; // [{ product_id, pieces }] per line, tracked products only
    // Running stock left per product: the same product can appear on several
    // lines (piece + box + bonus), so checks must accumulate. NULL = untracked.
    const remaining = new Map(products.map((p) => [p.id, p.stock_qty]));
    for (const it of items) {
      const p = byId.get(it.product_id);
      if (!p) {
        await conn.rollback();
        return res.status(400).json({ message: `Product #${it.product_id} is not available` });
      }
      let unit = null;
      if (it.unit_id) {
        unit = unitById.get(Number(it.unit_id));
        if (!unit || unit.product_id !== p.id) {
          await conn.rollback();
          return res.status(400).json({ message: `Invalid unit for "${p.name}"` });
        }
      }
      const factor = unit ? unit.factor : 1;
      const pieces = it.quantity * factor;
      if (remaining.get(p.id) !== null) {
        if (remaining.get(p.id) < pieces) {
          await conn.rollback();
          return res.status(409).json({
            message: `Not enough stock for "${p.name}" (${remaining.get(p.id)} pcs left, needs ${pieces})`,
          });
        }
        remaining.set(p.id, remaining.get(p.id) - pieces);
        stockOut.push({ product_id: p.id, pieces });
      }
      const isBonus = !!it.is_bonus;
      const listPrice = unit
        ? round2(unit.sell_price)
        : round2(p.sell_price * (1 - p.discount_pct / 100));
      const fullPrice = unit ? round2(unit.sell_price) : round2(p.sell_price);
      const price = isBonus
        ? 0
        : it.price !== undefined && it.price !== null ? round2(it.price) : listPrice;
      const lineTotal = round2(price * it.quantity);
      subtotal = round2(subtotal + lineTotal);
      totalCost = round2(totalCost + p.cost_price * pieces);
      lineRows.push([
        p.id, p.name, unit ? unit.name : null, factor, price, fullPrice,
        p.cost_price, unit ? 0 : p.discount_pct, it.quantity, lineTotal, isBonus ? 1 : 0,
      ]);
    }

    const discountAmount = round2(subtotal * (saleDiscountPct / 100));
    const taxRate = Number(settings.tax_rate) || 0;
    const taxAmount = round2((subtotal - discountAmount) * (taxRate / 100));
    const total = round2(subtotal - discountAmount + taxAmount);

    // Lock the client row too when the sale touches their account (credit
    // spend or an unpaid balance) so concurrent sales can't double-spend.
    let clientName = null;
    let clientCredit = 0;
    if (client_id) {
      const [[client]] = await conn.query(
        "SELECT name, credit_balance FROM clients WHERE id = ? AND business_id = ? FOR UPDATE",
        [client_id, BUSINESS_ID]
      );
      if (!client) {
        await conn.rollback();
        return res.status(400).json({ message: "Selected client no longer exists" });
      }
      clientName = client.name;
      clientCredit = Number(client.credit_balance);
    }

    const creditApplied = use_credit && client_id ? Math.min(round2(clientCredit), total) : 0;
    const paidNow = amount_paid === null
      ? round2(total - creditApplied)
      : Math.min(round2(amount_paid), round2(total - creditApplied));
    const totalPaid = round2(creditApplied + paidNow);
    const status = saleStatus(totalPaid, total);

    if (totalPaid < total && !client_id) {
      await conn.rollback();
      return res.status(400).json({ message: "Select a client to sell with an unpaid balance" });
    }

    // Per-day invoice number: INV-YYYYMMDD-NNNN. The sales table is locked
    // enough by the unique key — retry once on a rare duplicate.
    const [[{ ymd }]] = await conn.query("SELECT DATE_FORMAT(NOW(), '%Y%m%d') AS ymd");
    const [[{ cnt }]] = await conn.query(
      "SELECT COUNT(*) AS cnt FROM sales WHERE invoice_number LIKE ? AND business_id = ?",
      [`INV-${ymd}-%`, BUSINESS_ID]
    );
    let saleId = null;
    let invoiceNumber = null;
    for (let attempt = 0; attempt < 3 && saleId === null; attempt++) {
      invoiceNumber = `INV-${ymd}-${String(cnt + 1 + attempt).padStart(4, "0")}`;
      try {
        const [result] = await conn.query(
          `INSERT INTO sales
             (business_id, invoice_number, client_id, client_name, user_id, cashier_name, subtotal,
              discount_pct, discount_amount, tax_rate, tax_amount, total, total_cost,
              payment_method, amount_received, change_due, amount_paid, exchange_rate, status, note)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            BUSINESS_ID, invoiceNumber, client_id || null, clientName, req.user.id, req.user.name,
            subtotal, saleDiscountPct, discountAmount, taxRate, taxAmount, total, totalCost,
            payment_method,
            amount_received !== null ? round2(amount_received) : null,
            amount_received !== null ? round2(amount_received - paidNow) : null,
            totalPaid, settings.exchange_rate, status, note,
          ]
        );
        saleId = result.insertId;
      } catch (err) {
        if (err.code !== "ER_DUP_ENTRY") throw err;
      }
    }
    if (saleId === null) throw new Error("Could not allocate invoice number");

    await conn.query(
      `INSERT INTO sale_items
         (business_id, sale_id, product_id, name_snapshot, unit_name, unit_factor, price, full_price, cost_price, discount_pct, quantity, line_total, is_bonus)
       VALUES ?`,
      [lineRows.map((r) => [BUSINESS_ID, saleId, ...r])]
    );
    for (const out of stockOut) {
      await conn.query("UPDATE products SET stock_qty = stock_qty - ? WHERE id = ?", [out.pieces, out.product_id]);
      await conn.query(
        "INSERT INTO stock_movements (business_id, product_id, change_qty, reason, sale_id, user_id) VALUES (?, ?, ?, 'sale', ?, ?)",
        [BUSINESS_ID, out.product_id, -out.pieces, saleId, req.user.id]
      );
    }

    // Ledger rows: prepaid credit spent first, then money handed over now.
    if (creditApplied > 0) {
      await conn.query(
        "UPDATE clients SET credit_balance = credit_balance - ? WHERE id = ?", [creditApplied, client_id]
      );
      await conn.query(
        `INSERT INTO payments (business_id, client_id, sale_id, type, method, amount, user_id, received_by)
         VALUES (?, ?, ?, 'sale', 'credit', ?, ?, ?)`,
        [BUSINESS_ID, client_id, saleId, creditApplied, req.user.id, req.user.name]
      );
    }
    if (paidNow > 0) {
      await conn.query(
        `INSERT INTO payments (business_id, client_id, sale_id, type, method, amount, user_id, received_by)
         VALUES (?, ?, ?, 'sale', ?, ?, ?, ?)`,
        [BUSINESS_ID, client_id || null, saleId, payment_method, paidNow, req.user.id, req.user.name]
      );
    }

    await conn.commit();

    const sale = await getSaleWithItems(saleId);
    emitToAdmins("sale:created", sale);
    if (creditApplied > 0) emitToAdmins("client:changed", { type: "update", id: client_id });
    res.status(201).json(sale);
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export async function listSales(req, res) {
  const { from, to, search, status, payment_method, client_id,
          page = 1, page_size = 20 } = req.query;
  const where = ["s.business_id = ?"];
  const params = [BUSINESS_ID];
  if (from) { where.push("s.created_at >= ?"); params.push(`${from} 00:00:00`); }
  if (to)   { where.push("s.created_at <= ?"); params.push(`${to} 23:59:59`); }
  if (status) { where.push("s.status = ?"); params.push(status); }
  if (payment_method) { where.push("s.payment_method = ?"); params.push(payment_method); }
  if (client_id) { where.push("s.client_id = ?"); params.push(client_id); }
  if (search) {
    where.push("(s.invoice_number LIKE ? OR s.client_name LIKE ?)");
    params.push(`%${search}%`, `%${search}%`);
  }

  const limit = Math.min(Number(page_size) || 20, 100);
  const offset = (Math.max(Number(page) || 1, 1) - 1) * limit;

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total FROM sales s WHERE ${where.join(" AND ")}`, params
  );
  const [rows] = await pool.query(
    `SELECT s.*, (SELECT SUM(quantity * unit_factor) FROM sale_items si WHERE si.sale_id = s.id) AS item_count
     FROM sales s WHERE ${where.join(" AND ")}
     ORDER BY s.id DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  res.json({ rows, total, page: Number(page), page_size: limit });
}

export async function getSale(req, res) {
  const sale = await getSaleWithItems(req.params.id);
  if (!sale) return res.status(404).json({ message: "Invoice not found" });
  res.json(sale);
}

// Void restores stock and keeps the invoice for the audit trail. Payments the
// sale already received are mirrored as negative refund rows so the ledger
// nets to zero, and prepaid credit that was spent goes back to the client.
export async function voidSale(req, res) {
  const id = req.params.id;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [result] = await conn.query(
      "UPDATE sales SET status = 'voided', voided_at = NOW(), voided_by = ? WHERE id = ? AND business_id = ? AND status <> 'voided'",
      [req.user.name, id, BUSINESS_ID]
    );
    if (result.affectedRows === 0) {
      await conn.rollback();
      return res.status(400).json({ message: "Invoice is already voided or does not exist" });
    }
    // Restore exactly what the sale's movements took out (already in pieces;
    // untracked products wrote no movement, so nothing comes back for them).
    const [taken] = await conn.query(
      "SELECT product_id, SUM(-change_qty) AS pieces FROM stock_movements WHERE sale_id = ? AND reason = 'sale' GROUP BY product_id",
      [id]
    );
    for (const it of taken) {
      await conn.query(
        "UPDATE products SET stock_qty = stock_qty + ? WHERE id = ? AND stock_qty IS NOT NULL",
        [it.pieces, it.product_id]
      );
      await conn.query(
        "INSERT INTO stock_movements (business_id, product_id, change_qty, reason, sale_id, user_id) VALUES (?, ?, ?, 'void', ?, ?)",
        [BUSINESS_ID, it.product_id, it.pieces, id, req.user.id]
      );
    }

    const [paymentsRows] = await conn.query(
      "SELECT client_id, method, amount FROM payments WHERE sale_id = ? AND type = 'sale' AND amount > 0", [id]
    );
    let creditBack = 0;
    let refundClientId = null;
    for (const p of paymentsRows) {
      await conn.query(
        `INSERT INTO payments (business_id, client_id, sale_id, type, method, amount, user_id, received_by, note)
         VALUES (?, ?, ?, 'refund', ?, ?, ?, ?, 'Invoice voided')`,
        [BUSINESS_ID, p.client_id, id, p.method, -p.amount, req.user.id, req.user.name]
      );
      if (p.method === "credit" && p.client_id) {
        creditBack = round2(creditBack + Number(p.amount));
        refundClientId = p.client_id;
      }
    }
    if (creditBack > 0) {
      await conn.query(
        "UPDATE clients SET credit_balance = credit_balance + ? WHERE id = ?", [creditBack, refundClientId]
      );
    }

    await conn.commit();
    const sale = await getSaleWithItems(id);
    emitToAdmins("sale:voided", sale);
    if (sale.client_id) emitToAdmins("client:changed", { type: "update", id: sale.client_id });
    res.json(sale);
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// Take money against an invoice that still has a balance. method 'credit'
// spends the client's prepaid balance instead of new money.
export async function receivePayment(req, res) {
  const id = req.params.id;
  const { amount, method = "cash", note = null } = req.body || {};
  const amt = round2(amount);
  if (!(amt > 0)) return res.status(400).json({ message: "Payment amount must be greater than zero" });
  if (![...PAYMENT_METHODS, "credit"].includes(method)) {
    return res.status(400).json({ message: "Invalid payment method" });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[sale]] = await conn.query(
      "SELECT * FROM sales WHERE id = ? AND business_id = ? FOR UPDATE", [id, BUSINESS_ID]
    );
    if (!sale) {
      await conn.rollback();
      return res.status(404).json({ message: "Invoice not found" });
    }
    if (sale.status === "voided") {
      await conn.rollback();
      return res.status(400).json({ message: "Cannot take payment on a voided invoice" });
    }
    const balance = round2(sale.total - sale.amount_paid);
    if (balance <= 0) {
      await conn.rollback();
      return res.status(400).json({ message: "Invoice is already fully paid" });
    }
    if (amt > balance) {
      await conn.rollback();
      return res.status(400).json({ message: `Amount is more than the remaining balance ($${balance.toFixed(2)})` });
    }
    if (method === "credit") {
      if (!sale.client_id) {
        await conn.rollback();
        return res.status(400).json({ message: "This invoice has no client, so prepaid balance cannot be used" });
      }
      const [[client]] = await conn.query(
        "SELECT credit_balance FROM clients WHERE id = ? AND business_id = ? FOR UPDATE",
        [sale.client_id, BUSINESS_ID]
      );
      if (!client || Number(client.credit_balance) < amt) {
        await conn.rollback();
        return res.status(400).json({ message: "Client's prepaid balance is not enough" });
      }
      await conn.query(
        "UPDATE clients SET credit_balance = credit_balance - ? WHERE id = ?", [amt, sale.client_id]
      );
    }

    const newPaid = round2(Number(sale.amount_paid) + amt);
    await conn.query(
      "UPDATE sales SET amount_paid = ?, status = ? WHERE id = ?",
      [newPaid, saleStatus(newPaid, Number(sale.total)), id]
    );
    await conn.query(
      `INSERT INTO payments (business_id, client_id, sale_id, type, method, amount, user_id, received_by, note)
       VALUES (?, ?, ?, 'sale', ?, ?, ?, ?, ?)`,
      [BUSINESS_ID, sale.client_id, id, method, amt, req.user.id, req.user.name, note]
    );
    await conn.commit();

    const updated = await getSaleWithItems(id);
    emitToAdmins("sale:updated", updated);
    if (sale.client_id) emitToAdmins("client:changed", { type: "update", id: sale.client_id });
    res.json(updated);
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function getSaleWithItems(id) {
  const [[sale]] = await pool.query(
    "SELECT * FROM sales WHERE id = ? AND business_id = ?", [id, BUSINESS_ID]
  );
  if (!sale) return null;
  const [items] = await pool.query("SELECT * FROM sale_items WHERE sale_id = ?", [id]);
  const [payments] = await pool.query(
    "SELECT id, type, method, amount, received_by, note, created_at FROM payments WHERE sale_id = ? ORDER BY id",
    [id]
  );
  return { ...sale, items, payments };
}
