import pool from "../config/db.js";
import { BUSINESS_ID } from "../config/business.js";
import { emitToAdmins } from "../config/socket.js";

// Freeform invoice templates. `elements` is a JSON array of layout blocks; we
// store it as text and parse on the way out so the client always gets an array.
function parseTemplate(row) {
  let elements = [];
  try { elements = JSON.parse(row.elements || "[]"); } catch { /* corrupted: reset */ }
  return { ...row, elements: Array.isArray(elements) ? elements : [] };
}

export async function listTemplates(_req, res) {
  const [rows] = await pool.query(
    "SELECT * FROM invoice_templates WHERE business_id = ? ORDER BY is_default DESC, name",
    [BUSINESS_ID]
  );
  res.json(rows.map(parseTemplate));
}

export async function getTemplate(req, res) {
  const [[row]] = await pool.query(
    "SELECT * FROM invoice_templates WHERE id = ? AND business_id = ?",
    [req.params.id, BUSINESS_ID]
  );
  if (!row) return res.status(404).json({ message: "Template not found" });
  res.json(parseTemplate(row));
}

function readBody(body) {
  const name = (body?.name || "").trim() || "Template";
  const elements = Array.isArray(body?.elements) ? body.elements : [];
  return { name, elements: JSON.stringify(elements) };
}

export async function createTemplate(req, res) {
  const { name, elements } = readBody(req.body);
  const makeDefault = !!req.body?.is_default;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    // First template for a business is default automatically
    const [[{ count }]] = await conn.query(
      "SELECT COUNT(*) AS count FROM invoice_templates WHERE business_id = ?", [BUSINESS_ID]
    );
    const isDefault = makeDefault || count === 0 ? 1 : 0;
    if (isDefault) {
      await conn.query("UPDATE invoice_templates SET is_default = 0 WHERE business_id = ?", [BUSINESS_ID]);
    }
    const [result] = await conn.query(
      "INSERT INTO invoice_templates (business_id, name, is_default, elements, created_by) VALUES (?, ?, ?, ?, ?)",
      [BUSINESS_ID, name, isDefault, elements, req.user.id]
    );
    await conn.commit();
    emitToAdmins("template:changed", { type: "create", id: result.insertId });
    res.status(201).json({ id: result.insertId });
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export async function updateTemplate(req, res) {
  const { name, elements } = readBody(req.body);
  const [result] = await pool.query(
    "UPDATE invoice_templates SET name = ?, elements = ? WHERE id = ? AND business_id = ?",
    [name, elements, req.params.id, BUSINESS_ID]
  );
  if (!result.affectedRows) return res.status(404).json({ message: "Template not found" });
  emitToAdmins("template:changed", { type: "update", id: Number(req.params.id) });
  res.json({ message: "Template saved" });
}

export async function setDefaultTemplate(req, res) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[row]] = await conn.query(
      "SELECT id FROM invoice_templates WHERE id = ? AND business_id = ?", [req.params.id, BUSINESS_ID]
    );
    if (!row) { await conn.rollback(); return res.status(404).json({ message: "Template not found" }); }
    await conn.query("UPDATE invoice_templates SET is_default = 0 WHERE business_id = ?", [BUSINESS_ID]);
    await conn.query("UPDATE invoice_templates SET is_default = 1 WHERE id = ? AND business_id = ?",
      [req.params.id, BUSINESS_ID]);
    await conn.commit();
    emitToAdmins("template:changed", { type: "default", id: Number(req.params.id) });
    res.json({ message: "Default template set" });
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export async function deleteTemplate(req, res) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[row]] = await conn.query(
      "SELECT is_default FROM invoice_templates WHERE id = ? AND business_id = ?", [req.params.id, BUSINESS_ID]
    );
    if (!row) { await conn.rollback(); return res.status(404).json({ message: "Template not found" }); }
    await conn.query("DELETE FROM invoice_templates WHERE id = ? AND business_id = ?",
      [req.params.id, BUSINESS_ID]);
    // If we removed the default, promote the next remaining template
    if (row.is_default) {
      const [[next]] = await conn.query(
        "SELECT id FROM invoice_templates WHERE business_id = ? ORDER BY id LIMIT 1", [BUSINESS_ID]
      );
      if (next) {
        await conn.query("UPDATE invoice_templates SET is_default = 1 WHERE id = ?", [next.id]);
      }
    }
    await conn.commit();
    emitToAdmins("template:changed", { type: "delete", id: Number(req.params.id) });
    res.json({ message: "Template deleted" });
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}
