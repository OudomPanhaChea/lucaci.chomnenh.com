import mysql from "mysql2/promise";

// Session timezone pinned to Phnom Penh so per-day invoice numbers and
// daily reports don't drift when the host OS timezone differs.
const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "chamnenh_pos",
  waitForConnections: true,
  connectionLimit: 10,
  timezone: "+07:00",
  dateStrings: false,
  decimalNumbers: true,
});

export default pool;
