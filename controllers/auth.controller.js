import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import pool from "../config/db.js";
import { BUSINESS_ID } from "../config/business.js";
import { COOKIE_NAME } from "../middleware/auth.js";
import { deleteUploadedFile } from "../middleware/upload.js";

const ME_FIELDS =
  "id, name, email, role, phone, avatar_url, created_at, last_login_at";

const cookieOptions = () => ({
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  maxAge: 7 * 24 * 60 * 60 * 1000,
  path: "/",
});

export async function login(req, res) {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required" });
  }
  const [rows] = await pool.query(
    "SELECT * FROM users WHERE email = ? AND is_active = 1 AND business_id = ?",
    [email.trim().toLowerCase(), BUSINESS_ID]
  );
  const user = rows[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ message: "Incorrect email or password" });
  }

  const token = jwt.sign(
    { id: user.id, name: user.name, email: user.email, role: user.role, business_id: BUSINESS_ID },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES || "7d" }
  );
  await pool.query("UPDATE users SET last_login_at = NOW() WHERE id = ?", [user.id]);

  res.cookie(COOKIE_NAME, token, cookieOptions());
  res.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      avatar_url: user.avatar_url,
    },
    token, // socket.io handshake auth
  });
}

export async function me(req, res) {
  const [rows] = await pool.query(
    `SELECT ${ME_FIELDS} FROM users WHERE id = ? AND is_active = 1 AND business_id = ?`,
    [req.user.id, BUSINESS_ID]
  );
  if (!rows[0]) return res.status(401).json({ message: "Account no longer active" });
  const token =
    req.cookies?.[COOKIE_NAME] ||
    (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  res.json({ user: rows[0], token });
}

export function logout(_req, res) {
  res.clearCookie(COOKIE_NAME, { path: "/" });
  res.json({ message: "Logged out" });
}

export async function updateProfile(req, res) {
  const { name, email, phone } = req.body || {};
  const cleanName = (name || "").trim();
  const cleanEmail = (email || "").trim().toLowerCase();
  if (!cleanName || !/^\S+@\S+\.\S+$/.test(cleanEmail)) {
    return res.status(400).json({ message: "Name and a valid email are required" });
  }
  const [dupes] = await pool.query(
    "SELECT id FROM users WHERE email = ? AND id <> ? AND business_id = ?",
    [cleanEmail, req.user.id, BUSINESS_ID]
  );
  if (dupes.length) {
    return res.status(409).json({ message: "That email is already in use" });
  }
  await pool.query("UPDATE users SET name = ?, email = ?, phone = ? WHERE id = ?", [
    cleanName,
    cleanEmail,
    (phone || "").trim() || null,
    req.user.id,
  ]);

  const [rows] = await pool.query(`SELECT ${ME_FIELDS} FROM users WHERE id = ?`, [req.user.id]);
  const user = rows[0];
  // The JWT embeds name/email, so re-issue it after a profile change
  const token = jwt.sign(
    { id: user.id, name: user.name, email: user.email, role: user.role, business_id: BUSINESS_ID },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES || "7d" }
  );
  res.cookie(COOKIE_NAME, token, cookieOptions());
  res.json({ user, token });
}

export async function updateAvatar(req, res) {
  if (!req.file) return res.status(400).json({ message: "No image uploaded" });
  const [rows] = await pool.query("SELECT avatar_url FROM users WHERE id = ?", [req.user.id]);
  const avatarUrl = `/uploads/avatars/${req.file.filename}`;
  await pool.query("UPDATE users SET avatar_url = ? WHERE id = ?", [avatarUrl, req.user.id]);
  if (rows[0]?.avatar_url) deleteUploadedFile(rows[0].avatar_url);

  const [users] = await pool.query(`SELECT ${ME_FIELDS} FROM users WHERE id = ?`, [req.user.id]);
  res.json({ user: users[0] });
}

export async function removeAvatar(req, res) {
  const [rows] = await pool.query("SELECT avatar_url FROM users WHERE id = ?", [req.user.id]);
  await pool.query("UPDATE users SET avatar_url = NULL WHERE id = ?", [req.user.id]);
  if (rows[0]?.avatar_url) deleteUploadedFile(rows[0].avatar_url);

  const [users] = await pool.query(`SELECT ${ME_FIELDS} FROM users WHERE id = ?`, [req.user.id]);
  res.json({ user: users[0] });
}

export async function changePassword(req, res) {
  const { current_password, new_password } = req.body || {};
  if (!current_password || !new_password || new_password.length < 8) {
    return res.status(400).json({ message: "New password must be at least 8 characters" });
  }
  const [rows] = await pool.query("SELECT password_hash FROM users WHERE id = ?", [req.user.id]);
  if (!rows[0] || !(await bcrypt.compare(current_password, rows[0].password_hash))) {
    return res.status(400).json({ message: "Current password is incorrect" });
  }
  const hash = await bcrypt.hash(new_password, 10);
  await pool.query("UPDATE users SET password_hash = ? WHERE id = ?", [hash, req.user.id]);
  res.json({ message: "Password updated" });
}
