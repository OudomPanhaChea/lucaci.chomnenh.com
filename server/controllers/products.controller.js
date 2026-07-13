import pool from "../config/db.js";
import { BUSINESS_ID } from "../config/business.js";
import { emitToAdmins } from "../config/socket.js";
import { deleteUploadedFile, storeUploadedImage } from "../middleware/upload.js";

const num = (v, d = 0) => (v === undefined || v === null || v === "" ? d : Number(v));

// Bulk units come as a JSON string field in the multipart body:
// [{ name, factor, sell_price, barcode? }]. Returns { units } or { error }.
function parseUnits(raw) {
  if (raw === undefined || raw === null || raw === "") return { units: [] };
  let arr;
  try {
    arr = JSON.parse(raw);
  } catch {
    return { error: "Invalid units payload" };
  }
  if (!Array.isArray(arr)) return { error: "Invalid units payload" };
  const units = [];
  for (const u of arr) {
    const name = String(u?.name ?? "").trim();
    const factor = Number(u?.factor);
    const sellPrice = Number(u?.sell_price);
    if (!name || name.length > 60) return { error: "Each unit needs a name (max 60 chars)" };
    if (!Number.isInteger(factor) || factor < 1) {
      return { error: `Unit "${name}": pieces per unit must be a whole number of 1 or more` };
    }
    if (Number.isNaN(sellPrice) || sellPrice < 0) {
      return { error: `Unit "${name}": price must be 0 or more` };
    }
    const barcode = String(u?.barcode ?? "").trim() || null;
    units.push({ name, factor, sell_price: sellPrice, barcode });
  }
  return { units };
}

async function attachUnits(rows) {
  if (rows.length === 0) return rows;
  const [units] = await pool.query(
    "SELECT * FROM product_units WHERE business_id = ? AND product_id IN (?) ORDER BY factor",
    [BUSINESS_ID, rows.map((r) => r.id)]
  );
  const byProduct = new Map();
  for (const u of units) {
    if (!byProduct.has(u.product_id)) byProduct.set(u.product_id, []);
    byProduct.get(u.product_id).push(u);
  }
  for (const r of rows) r.units = byProduct.get(r.id) ?? [];
  return rows;
}

async function replaceUnits(conn, productId, units) {
  await conn.query(
    "DELETE FROM product_units WHERE product_id = ? AND business_id = ?", [productId, BUSINESS_ID]
  );
  if (units.length === 0) return;
  await conn.query(
    "INSERT INTO product_units (business_id, product_id, name, factor, sell_price, barcode) VALUES ?",
    [units.map((u) => [BUSINESS_ID, productId, u.name, u.factor, u.sell_price, u.barcode])]
  );
}

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
  // NULL stock_qty = not tracked, never "low"
  if (low_stock === "1") where.push("p.stock_qty IS NOT NULL AND p.stock_qty <= p.low_stock_alert");

  const [rows] = await pool.query(
    `SELECT p.*, c.name AS category_name
     FROM products p LEFT JOIN categories c ON c.id = p.category_id
     WHERE ${where.join(" AND ")}
     ORDER BY p.display_number DESC`,
    params
  );
  res.json(await attachUnits(rows));
}

// POS barcode scan: exact-match lookup, active products only. Checks the
// product's own barcode first, then carton (unit) barcodes; a unit hit sets
// matched_unit_id so the POS adds that bulk unit instead of a piece.
export async function getByBarcode(req, res) {
  const [rows] = await pool.query(
    `SELECT p.*, c.name AS category_name
     FROM products p LEFT JOIN categories c ON c.id = p.category_id
     WHERE p.barcode = ? AND p.business_id = ? AND p.is_deleted = 0 AND p.is_active = 1`,
    [req.params.barcode, BUSINESS_ID]
  );
  let product = rows[0] ?? null;
  let matchedUnitId = null;
  if (!product) {
    const [unitRows] = await pool.query(
      `SELECT p.*, c.name AS category_name, u.id AS matched_unit_id
       FROM product_units u
       JOIN products p ON p.id = u.product_id
       LEFT JOIN categories c ON c.id = p.category_id
       WHERE u.barcode = ? AND u.business_id = ? AND p.is_deleted = 0 AND p.is_active = 1`,
      [req.params.barcode, BUSINESS_ID]
    );
    if (unitRows[0]) {
      ({ matched_unit_id: matchedUnitId, ...product } = unitRows[0]);
    }
  }
  if (!product) return res.status(404).json({ message: "No product found for this barcode" });
  await attachUnits([product]);
  res.json({ ...product, matched_unit_id: matchedUnitId });
}

export async function createProduct(req, res) {
  const b = req.body || {};
  if (!b.name?.trim()) return res.status(400).json({ message: "Product name is required" });
  const { units, error } = parseUnits(b.units);
  if (error) return res.status(400).json({ message: error });
  // track_stock "0" = product has no stock counting (services, made-to-order)
  const stockQty = b.track_stock === "0" ? null : num(b.stock_qty);

  const [[{ next }]] = await pool.query(
    "SELECT COALESCE(MAX(display_number), 0) + 1 AS next FROM products WHERE business_id = ?",
    [BUSINESS_ID]
  );
  const image_url = req.file ? await storeUploadedImage(req.file) : null;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [result] = await conn.query(
      `INSERT INTO products
         (business_id, display_number, name, barcode, sku, category_id, cost_price, sell_price,
          discount_pct, stock_qty, low_stock_alert, image_url, description, show_in_menu, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        BUSINESS_ID, next, b.name.trim(), b.barcode?.trim() || null, b.sku?.trim() || null,
        b.category_id || null, num(b.cost_price), num(b.sell_price),
        num(b.discount_pct), stockQty, num(b.low_stock_alert, 5),
        image_url, b.description || null,
        b.show_in_menu === "0" || b.show_in_menu === false ? 0 : 1,
        b.is_active === "0" || b.is_active === false ? 0 : 1,
      ]
    );
    if (stockQty !== null && stockQty > 0) {
      await conn.query(
        "INSERT INTO stock_movements (business_id, product_id, change_qty, reason, user_id) VALUES (?, ?, ?, 'initial', ?)",
        [BUSINESS_ID, result.insertId, stockQty, req.user.id]
      );
    }
    await replaceUnits(conn, result.insertId, units);
    await conn.commit();
    emitToAdmins("product:changed", { type: "create", id: result.insertId });
    res.status(201).json({ id: result.insertId, image_url });
  } catch (err) {
    await conn.rollback();
    if (req.file) deleteUploadedFile(image_url);
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ message: "A product or unit with this barcode already exists" });
    }
    throw err;
  } finally {
    conn.release();
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
    image_url = await storeUploadedImage(req.file);
  } else if (b.remove_image === "1") {
    deleteUploadedFile(existing.image_url);
    image_url = null;
  }

  const { units, error } = parseUnits(b.units);
  if (error) return res.status(400).json({ message: error });

  // Stock tracking transitions: turning it off nulls the count; turning it
  // back on starts from the submitted quantity (logged as a movement).
  let stockQty = existing.stock_qty;
  if (b.track_stock === "0") stockQty = null;
  else if (b.track_stock === "1" && existing.stock_qty === null) stockQty = num(b.stock_qty);

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(
      `UPDATE products SET name=?, barcode=?, sku=?, category_id=?, cost_price=?, sell_price=?,
        discount_pct=?, stock_qty=?, low_stock_alert=?, image_url=?, description=?, show_in_menu=?, is_active=?
       WHERE id = ? AND business_id = ?`,
      [
        (b.name ?? existing.name).trim(), b.barcode?.trim() || null, b.sku?.trim() || null,
        b.category_id || null, num(b.cost_price, existing.cost_price),
        num(b.sell_price, existing.sell_price), num(b.discount_pct, existing.discount_pct),
        stockQty, num(b.low_stock_alert, existing.low_stock_alert), image_url, b.description || null,
        b.show_in_menu === "0" || b.show_in_menu === false ? 0 : 1,
        b.is_active === "0" || b.is_active === false ? 0 : 1,
        id, BUSINESS_ID,
      ]
    );
    if (existing.stock_qty === null && stockQty !== null && stockQty > 0) {
      await conn.query(
        "INSERT INTO stock_movements (business_id, product_id, change_qty, reason, user_id, note) VALUES (?, ?, ?, 'initial', ?, 'Stock tracking enabled')",
        [BUSINESS_ID, id, stockQty, req.user.id]
      );
    }
    if (b.units !== undefined) await replaceUnits(conn, id, units);
    await conn.commit();
    emitToAdmins("product:changed", { type: "update", id: Number(id) });
    res.json({ message: "Product updated", image_url });
  } catch (err) {
    await conn.rollback();
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ message: "A product or unit with this barcode already exists" });
    }
    throw err;
  } finally {
    conn.release();
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
    // NULL stock_qty never matches `stock_qty + ? >= 0`, so untracked
    // products fall through here — check first for a clearer message.
    const [[prod]] = await conn.query(
      "SELECT stock_qty FROM products WHERE id = ? AND business_id = ? AND is_deleted = 0", [id, BUSINESS_ID]
    );
    if (prod && prod.stock_qty === null) {
      await conn.rollback();
      return res.status(400).json({ message: "This product does not track stock" });
    }
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
