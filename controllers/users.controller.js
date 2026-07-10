import bcrypt from "bcryptjs";
import pool from "../config/db.js";
import { BUSINESS_ID } from "../config/business.js";

export async function listUsers(_req, res) {
  const [rows] = await pool.query(
    `SELECT id, name, email, role, phone, is_active, last_login_at, created_at
     FROM users WHERE business_id = ? ORDER BY id`,
    [BUSINESS_ID]
  );
  res.json(rows);
}

export async function createUser(req, res) {
  const b = req.body || {};
  if (!b.name?.trim() || !b.email?.trim() || !b.password || b.password.length < 8) {
    return res.status(400).json({ message: "Name, email and a password of at least 8 characters are required" });
  }
  const role = ["admin", "cashier"].includes(b.role) ? b.role : "cashier";
  const hash = await bcrypt.hash(b.password, 10);
  try {
    const [result] = await pool.query(
      "INSERT INTO users (business_id, name, email, password_hash, role, phone) VALUES (?, ?, ?, ?, ?, ?)",
      [BUSINESS_ID, b.name.trim(), b.email.trim().toLowerCase(), hash, role, b.phone || null]
    );
    res.status(201).json({ id: result.insertId });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ message: "An account with this email already exists" });
    }
    throw err;
  }
}

export async function updateUser(req, res) {
  const b = req.body || {};
  const id = Number(req.params.id);
  const [[target]] = await pool.query(
    "SELECT id, role FROM users WHERE id = ? AND business_id = ?", [id, BUSINESS_ID]
  );
  if (!target) return res.status(404).json({ message: "User not found" });
  if (target.role === "owner" && req.user.id !== id) {
    return res.status(403).json({ message: "Only the owner can edit the owner account" });
  }

  const fields = ["name = ?", "phone = ?", "is_active = ?"];
  const params = [b.name?.trim() || null, b.phone || null, b.is_active === false ? 0 : 1];
  if (target.role !== "owner" && ["admin", "cashier"].includes(b.role)) {
    fields.push("role = ?");
    params.push(b.role);
  }
  if (b.password) {
    if (b.password.length < 8) return res.status(400).json({ message: "Password must be at least 8 characters" });
    fields.push("password_hash = ?");
    params.push(await bcrypt.hash(b.password, 10));
  }
  params.push(id, BUSINESS_ID);
  await pool.query(`UPDATE users SET ${fields.join(", ")} WHERE id = ? AND business_id = ?`, params);
  res.json({ message: "User updated" });
}

export async function deleteUser(req, res) {
  const id = Number(req.params.id);
  if (id === req.user.id) return res.status(400).json({ message: "You cannot delete your own account" });
  const [[target]] = await pool.query(
    "SELECT role FROM users WHERE id = ? AND business_id = ?", [id, BUSINESS_ID]
  );
  if (!target) return res.status(404).json({ message: "User not found" });
  if (target.role === "owner") return res.status(403).json({ message: "The owner account cannot be deleted" });
  await pool.query("DELETE FROM users WHERE id = ? AND business_id = ?", [id, BUSINESS_ID]);
  res.json({ message: "User deleted" });
}
