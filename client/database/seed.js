// Creates the owner account from .env (ADMIN_NAME / ADMIN_EMAIL / ADMIN_PASSWORD).
// Run once after importing schema.sql:  npm run seed
import bcrypt from "bcryptjs";
import pool from "../config/db.js";
import { BUSINESS_ID } from "../config/business.js";

const name = process.env.ADMIN_NAME || "Owner";
const email = (process.env.ADMIN_EMAIL || "admin@chamnenh.com").toLowerCase();
const password = process.env.ADMIN_PASSWORD || "admin12345";
const businessName = process.env.BUSINESS_NAME || "Chomnenh";

// The tenant row and its settings row must exist before anything else
await pool.query("INSERT IGNORE INTO businesses (id, name) VALUES (?, ?)", [BUSINESS_ID, businessName]);
await pool.query(
  "INSERT IGNORE INTO settings (business_id, business_name) VALUES (?, ?)",
  [BUSINESS_ID, businessName]
);

const [existing] = await pool.query(
  "SELECT id FROM users WHERE email = ? AND business_id = ?", [email, BUSINESS_ID]
);
if (existing.length) {
  console.log(`User ${email} already exists (id ${existing[0].id}) — nothing to do.`);
} else {
  const hash = await bcrypt.hash(password, 10);
  const [result] = await pool.query(
    "INSERT INTO users (business_id, name, email, password_hash, role) VALUES (?, ?, ?, ?, 'owner')",
    [BUSINESS_ID, name, email, hash]
  );
  console.log(`Owner account created: ${email} (id ${result.insertId})`);
}
await pool.end();
