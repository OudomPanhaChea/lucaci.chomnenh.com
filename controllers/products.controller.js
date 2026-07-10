import pool from "../config/db.js";
import { BUSINESS_ID } from "../config/business.js";
import { emitToAdmins } from "../config/socket.js";
import { deleteUploadedFile } from "../middleware/upload.js";

const num = (v, d = 0) => (v === undefined || v === null || v === "" ? d : Number(v));

export async function listProducts(req, res) {
  const { search, category_id, active, low_stock } = req.query;
  const where = ["p.business_id = ?", "p.is_deleted = 0"];
  const params = [BUSINESS_ID];
  if (search) {
    where.push("(p.name LIKE ? OR p.barcode LIKE ? OR p.sku LIKE ?)");
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  if (category_id) {
    where.push("p.category_id = ?");
    params.push(category_id);
  }
  if (active === "1") where.push("p.is_active = 1");
  if (low_stock === "1") where.push("p.stock_qty <= p.low_stock_alert");

  const [rows] = await pool.query(
    `SELECT p.*, c.name AS category_name
     FROM products p LEFT JOIN categories c ON c.id = p.category_id
     WHERE ${where.join(" AND ")}
     ORDER BY p.display_number DESC`,
    params
  );
  res.json(rows);
}

// POS barcode scan: exact-match lookup, active products only
export async function getByBarcode(req, res) {
  const [rows] = await pool.query(
    `SELECT p.*, c.name AS category_name
     FROM products p LEFT JOIN categories c ON c.id = p.category_id
     WHERE p.barcode = ? AND p.business_id = ? AND p.is_deleted = 0 AND p.is_active = 1`,
    [req.params.barcode, BUSINESS_ID]
  );
  if (!rows[0]) return res.status(404).json({ message: "No product found for this barcode" });
  res.json(rows[0]);
}

export async function createProduct(req, res) {
  const b = req.body || {};
  if (!b.name?.trim()) return res.status(400).json({ message: "Product name is required" });

  const [[{ next }]] = await pool.query(
    "SELECT COALESCE(MAX(display_number), 0) + 1 AS next FROM products WHERE business_id = ?",
    [BUSINESS_ID]
  );
  const image_url = req.file ? `/uploads/products/${req.file.filename}` : null;
  try {
    const [result] = await pool.query(
      `INSERT INTO products
         (business_id, display_number, name, barcode, sku, category_id, cost_price, sell_price,
          discount_pct, stock_qty, low_stock_alert, image_url, description, show_in_menu, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        BUSINESS_ID, next, b.name.trim(), b.barcode?.trim() || null, b.sku?.trim() || null,
        b.category_id || null, num(b.cost_price), num(b.sell_price),
        num(b.discount_pct), num(b.stock_qty), num(b.low_stock_alert, 5),
        image_url, b.description || null,
        b.show_in_menu === "0" || b.show_in_menu === false ? 0 : 1,
        b.is_active === "0" || b.is_active === false ? 0 : 1,
      ]
    );
    if (num(b.stock_qty) > 0) {
      await pool.query(
        "INSERT INTO stock_movements (business_id, product_id, change_qty, reason, user_id) VALUES (?, ?, ?, 'initial', ?)",
        [BUSINESS_ID, result.insertId, num(b.stock_qty), req.user.id]
      );
    }
    emitToAdmins("product:changed", { type: "create", id: result.insertId });
    res.status(201).json({ id: result.insertId, image_url });
  } catch (err) {
    if (req.file) deleteUploadedFile(image_url);
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ message: "A product with this barcode already exists" });
    }
    throw err;
  }
}

export async function updateProduct(req, res) {
  const b = req.body || {};
  const id = req.params.id;
  const [rows] = await pool.query(
    "SELECT * FROM products WHERE id = ? AND business_id = ? AND is_deleted = 0", [id, BUSINESS_ID]
  );
  const existing = rows[0];
  if (!existing) return res.status(404).json({ message: "Product not found" });

  let image_url = existing.image_url;
  if (req.file) {
    deleteUploadedFile(existing.image_url);
    image_url = `/uploads/products/${req.file.filename}`;
  } else if (b.remove_image === "1") {
    deleteUploadedFile(existing.image_url);
    image_url = null;
  }

  try {
    await pool.query(
      `UPDATE products SET name=?, barcode=?, sku=?, category_id=?, cost_price=?, sell_price=?,
        discount_pct=?, low_stock_alert=?, image_url=?, description=?, show_in_menu=?, is_active=?
       WHERE id = ? AND business_id = ?`,
      [
        (b.name ?? existing.name).trim(), b.barcode?.trim() || null, b.sku?.trim() || null,
        b.category_id || null, num(b.cost_price, existing.cost_price),
        num(b.sell_price, existing.sell_price), num(b.discount_pct, existing.discount_pct),
        num(b.low_stock_alert, existing.low_stock_alert), image_url, b.description || null,
        b.show_in_menu === "0" || b.show_in_menu === false ? 0 : 1,
        b.is_active === "0" || b.is_active === false ? 0 : 1,
        id, BUSINESS_ID,
      ]
    );
    emitToAdmins("product:changed", { type: "update", id: Number(id) });
    res.json({ message: "Product updated", image_url });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ message: "A product with this barcode already exists" });
    }
    throw err;
  }
}

// Restock / manual correction — stock changes from sales go through sales.controller
export async function adjustStock(req, res) {
  const id = req.params.id;
  const change = Number(req.body?.change_qty);
  const note = req.body?.note || null;
  if (!Number.isInteger(change) || change === 0) {
    return res.status(400).json({ message: "change_qty must be a non-zero integer" });
  }
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [result] = await conn.query(
      "UPDATE products SET stock_qty = stock_qty + ? WHERE id = ? AND business_id = ? AND is_deleted = 0 AND stock_qty + ? >= 0",
      [change, id, BUSINESS_ID, change]
    );
    if (result.affectedRows === 0) {
      await conn.rollback();
      return res.status(400).json({ message: "Adjustment would make stock negative" });
    }
    await conn.query(
      "INSERT INTO stock_movements (business_id, product_id, change_qty, reason, user_id, note) VALUES (?, ?, ?, ?, ?, ?)",
      [BUSINESS_ID, id, change, change > 0 ? "restock" : "adjustment", req.user.id, note]
    );
    await conn.commit();
    emitToAdmins("product:changed", { type: "stock", id: Number(id) });
    res.json({ message: "Stock updated" });
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export async function deleteProduct(req, res) {
  await pool.query(
    "UPDATE products SET is_deleted = 1, is_active = 0 WHERE id = ? AND business_id = ?",
    [req.params.id, BUSINESS_ID]
  );
  emitToAdmins("product:changed", { type: "delete", id: Number(req.params.id) });
  res.json({ message: "Product deleted" });
}

export async function stockHistory(req, res) {
  const [rows] = await pool.query(
    `SELECT sm.*, u.name AS user_name, s.invoice_number
     FROM stock_movements sm
     LEFT JOIN users u ON u.id = sm.user_id
     LEFT JOIN sales s ON s.id = sm.sale_id
     WHERE sm.product_id = ? AND sm.business_id = ?
     ORDER BY sm.id DESC LIMIT 100`,
    [req.params.id, BUSINESS_ID]
  );
  res.json(rows);
}
