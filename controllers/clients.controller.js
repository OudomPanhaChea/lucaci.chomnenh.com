import pool from "../config/db.js";
import { BUSINESS_ID } from "../config/business.js";
import { emitToAdmins } from "../config/socket.js";

export async function listClients(req, res) {
  const { search } = req.query;
  const where = ["c.business_id = ?"];
  const params = [BUSINESS_ID];
  if (search) {
    where.push("(c.name LIKE ? OR c.phone LIKE ? OR c.email LIKE ? OR c.id_card LIKE ?)");
    params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
  }
  const [rows] = await pool.query(
    `SELECT c.*,
            COUNT(CASE WHEN s.status <> 'voided' THEN s.id END)      AS purchase_count,
            COALESCE(SUM(CASE WHEN s.status <> 'voided' THEN s.total END), 0) AS total_spent,
            COALESCE(SUM(CASE WHEN s.status <> 'voided' THEN s.total - s.amount_paid END), 0) AS outstanding,
            MAX(s.created_at)                                        AS last_purchase_at
     FROM clients c
     LEFT JOIN sales s ON s.client_id = c.id
     WHERE ${where.join(" AND ")}
     GROUP BY c.id
     ORDER BY c.display_number DESC`,
    params
  );
  res.json(rows);
}

export async function createClient(req, res) {
  const b = req.body || {};
  if (!b.name?.trim()) return res.status(400).json({ message: "Client name is required" });
  const [[{ next }]] = await pool.query(
    "SELECT COALESCE(MAX(display_number), 0) + 1 AS next FROM clients WHERE business_id = ?",
    [BUSINESS_ID]
  );
  const [result] = await pool.query(
    `INSERT INTO clients (business_id, display_number, name, phone, email, sex, id_card, address, note)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [BUSINESS_ID, next, b.name.trim(), b.phone || null, b.email || null, b.sex || null,
     b.id_card || null, b.address || null, b.note || null]
  );
  emitToAdmins("client:changed", { type: "create", id: result.insertId });
  res.status(201).json({ id: result.insertId, display_number: next });
}

export async function updateClient(req, res) {
  const b = req.body || {};
  if (!b.name?.trim()) return res.status(400).json({ message: "Client name is required" });
  await pool.query(
    `UPDATE clients SET name=?, phone=?, email=?, sex=?, id_card=?, address=?, note=?
     WHERE id = ? AND business_id = ?`,
    [b.name.trim(), b.phone || null, b.email || null, b.sex || null,
     b.id_card || null, b.address || null, b.note || null, req.params.id, BUSINESS_ID]
  );
  emitToAdmins("client:changed", { type: "update", id: Number(req.params.id) });
  res.json({ message: "Client updated" });
}

export async function deleteClient(req, res) {
  // sales.client_id is ON DELETE SET NULL; client_name snapshot keeps history readable
  await pool.query("DELETE FROM clients WHERE id = ? AND business_id = ?", [req.params.id, BUSINESS_ID]);
  emitToAdmins("client:changed", { type: "delete", id: Number(req.params.id) });
  res.json({ message: "Client deleted" });
}

// Full account view for the client drawer: purchases and ledger entries in a
// date range, period totals, and the all-time owing / prepaid position.
export async function clientStatement(req, res) {
  const { from, to } = req.query;
  const id = req.params.id;
  const [[client]] = await pool.query(
    "SELECT * FROM clients WHERE id = ? AND business_id = ?", [id, BUSINESS_ID]
  );
  if (!client) return res.status(404).json({ message: "Client not found" });

  const range = [];
  const rangeParams = [];
  if (from) { range.push("created_at >= ?"); rangeParams.push(`${from} 00:00:00`); }
  if (to)   { range.push("created_at <= ?"); rangeParams.push(`${to} 23:59:59`); }
  const rangeSql = range.length ? ` AND ${range.join(" AND ")}` : "";

  const [sales] = await pool.query(
    `SELECT id, invoice_number, total, amount_paid, payment_method, status, created_at,
            (SELECT SUM(quantity) FROM sale_items si WHERE si.sale_id = sales.id) AS item_count
     FROM sales WHERE client_id = ? AND business_id = ?${rangeSql}
     ORDER BY id DESC LIMIT 200`,
    [id, BUSINESS_ID, ...rangeParams]
  );
  const [payments] = await pool.query(
    `SELECT p.id, p.sale_id, p.type, p.method, p.amount, p.received_by, p.note, p.created_at,
            s.invoice_number
     FROM payments p LEFT JOIN sales s ON s.id = p.sale_id
     WHERE p.client_id = ? AND p.business_id = ?${rangeSql.replaceAll("created_at", "p.created_at")}
     ORDER BY p.id DESC LIMIT 200`,
    [id, BUSINESS_ID, ...rangeParams]
  );

  const [[period]] = await pool.query(
    `SELECT COUNT(CASE WHEN status <> 'voided' THEN 1 END) AS invoice_count,
            COALESCE(SUM(CASE WHEN status <> 'voided' THEN total END), 0)       AS purchased,
            COALESCE(SUM(CASE WHEN status <> 'voided' THEN amount_paid END), 0) AS paid
     FROM sales WHERE client_id = ? AND business_id = ?${rangeSql}`,
    [id, BUSINESS_ID, ...rangeParams]
  );
  const [[overall]] = await pool.query(
    `SELECT COALESCE(SUM(CASE WHEN status <> 'voided' THEN total - amount_paid END), 0) AS outstanding
     FROM sales WHERE client_id = ? AND business_id = ?`,
    [id, BUSINESS_ID]
  );

  res.json({
    client, sales, payments,
    period: { ...period, outstanding: Number(period.purchased) - Number(period.paid) },
    overall: { outstanding: Number(overall.outstanding), credit_balance: Number(client.credit_balance) },
  });
}

// Prepaid top-up: money in now, spent at checkout later.
export async function addDeposit(req, res) {
  const { amount, method = "cash", note = null } = req.body || {};
  const amt = Math.round((Number(amount) + Number.EPSILON) * 100) / 100;
  if (!(amt > 0)) return res.status(400).json({ message: "Deposit amount must be greater than zero" });
  if (!["cash", "khqr", "card", "bank", "other"].includes(method)) {
    return res.status(400).json({ message: "Invalid payment method" });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[client]] = await conn.query(
      "SELECT id FROM clients WHERE id = ? AND business_id = ? FOR UPDATE", [req.params.id, BUSINESS_ID]
    );
    if (!client) {
      await conn.rollback();
      return res.status(404).json({ message: "Client not found" });
    }
    await conn.query(
      "UPDATE clients SET credit_balance = credit_balance + ? WHERE id = ?", [amt, client.id]
    );
    await conn.query(
      `INSERT INTO payments (business_id, client_id, sale_id, type, method, amount, user_id, received_by, note)
       VALUES (?, ?, NULL, 'deposit', ?, ?, ?, ?, ?)`,
      [BUSINESS_ID, client.id, method, amt, req.user.id, req.user.name, note]
    );
    const [[{ credit_balance }]] = await conn.query(
      "SELECT credit_balance FROM clients WHERE id = ?", [client.id]
    );
    await conn.commit();
    emitToAdmins("client:changed", { type: "update", id: client.id });
    res.status(201).json({ message: "Deposit recorded", credit_balance });
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}
