import pool from "../config/db.js";
import { BUSINESS_ID } from "../config/business.js";
import { emitToAdmins } from "../config/socket.js";

export async function listCategories(_req, res) {
  const [rows] = await pool.query(
    `SELECT c.*, COUNT(p.id) AS product_count
     FROM categories c
     LEFT JOIN products p ON p.category_id = c.id AND p.is_deleted = 0
     WHERE c.business_id = ?
     GROUP BY c.id
     ORDER BY c.display_number, c.name`,
    [BUSINESS_ID]
  );
  res.json(rows);
}

export async function createCategory(req, res) {
  const name = (req.body?.name || "").trim();
  if (!name) return res.status(400).json({ message: "Category name is required" });
  const [[{ next }]] = await pool.query(
    "SELECT COALESCE(MAX(display_number), 0) + 1 AS next FROM categories WHERE business_id = ?",
    [BUSINESS_ID]
  );
  try {
    const [result] = await pool.query(
      "INSERT INTO categories (business_id, name, display_number) VALUES (?, ?, ?)",
      [BUSINESS_ID, name, next]
    );
    emitToAdmins("product:changed", { type: "category" });
    res.status(201).json({ id: result.insertId, name, display_number: next });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ message: "A category with this name already exists" });
    }
    throw err;
  }
}

export async function updateCategory(req, res) {
  const name = (req.body?.name || "").trim();
  if (!name) return res.status(400).json({ message: "Category name is required" });
  await pool.query(
    "UPDATE categories SET name = ? WHERE id = ? AND business_id = ?",
    [name, req.params.id, BUSINESS_ID]
  );
  emitToAdmins("product:changed", { type: "category" });
  res.json({ message: "Category updated" });
}

export async function deleteCategory(req, res) {
  await pool.query(
    "DELETE FROM categories WHERE id = ? AND business_id = ?",
    [req.params.id, BUSINESS_ID]
  );
  emitToAdmins("product:changed", { type: "category" });
  res.json({ message: "Category deleted" });
}
