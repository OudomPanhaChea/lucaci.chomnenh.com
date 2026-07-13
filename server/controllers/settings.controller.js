import pool from "../config/db.js";
import { BUSINESS_ID } from "../config/business.js";
import { emitToAdmins } from "../config/socket.js";
import { deleteUploadedFile, storeUploadedImage } from "../middleware/upload.js";

export const MAX_BANNERS = 4;

// banner_urls is a JSON array column; always hand the client a `banners` array
async function loadSettings() {
  const [[row]] = await pool.query("SELECT * FROM settings WHERE business_id = ?", [BUSINESS_ID]);
  if (!row) return null;
  let banners = [];
  try { banners = JSON.parse(row.banner_urls || "[]"); } catch { /* corrupted column: reset */ }
  return { ...row, banners: Array.isArray(banners) ? banners : [] };
}

async function respondAndBroadcast(res, status = 200) {
  const settings = await loadSettings();
  emitToAdmins("settings:changed", settings);
  res.status(status).json(settings);
}

export async function getSettings(_req, res) {
  res.json(await loadSettings());
}

export async function updateSettings(req, res) {
  const b = req.body || {};
  // logo_url and banner_urls are managed by the upload endpoints below only
  await pool.query(
    `UPDATE settings SET business_name=?, phone=?, address=?, currency=?,
       exchange_rate=?, tax_rate=?, receipt_footer=?, menu_public=? WHERE business_id = ?`,
    [
      b.business_name?.trim() || "Chomnenh", b.phone || null,
      b.address || null, b.currency || "USD",
      Number(b.exchange_rate) || 4100, Number(b.tax_rate) || 0,
      b.receipt_footer || null, b.menu_public ? 1 : 0,
      BUSINESS_ID,
    ]
  );
  await respondAndBroadcast(res);
}

export async function uploadLogo(req, res) {
  if (!req.file) return res.status(400).json({ message: "No image uploaded" });
  const current = await loadSettings();
  const logoUrl = await storeUploadedImage(req.file);
  await pool.query("UPDATE settings SET logo_url = ? WHERE business_id = ?", [logoUrl, BUSINESS_ID]);
  deleteUploadedFile(current?.logo_url);
  await respondAndBroadcast(res);
}

export async function removeLogo(_req, res) {
  const current = await loadSettings();
  await pool.query("UPDATE settings SET logo_url = NULL WHERE business_id = ?", [BUSINESS_ID]);
  deleteUploadedFile(current?.logo_url);
  await respondAndBroadcast(res);
}

export async function addBanner(req, res) {
  if (!req.file) return res.status(400).json({ message: "No image uploaded" });
  const current = await loadSettings();
  const bannerUrl = await storeUploadedImage(req.file);
  if (current.banners.length >= MAX_BANNERS) {
    deleteUploadedFile(bannerUrl);
    return res.status(400).json({ message: `Maximum ${MAX_BANNERS} banner images` });
  }
  const banners = [...current.banners, bannerUrl];
  await pool.query("UPDATE settings SET banner_urls = ? WHERE business_id = ?", [
    JSON.stringify(banners), BUSINESS_ID,
  ]);
  await respondAndBroadcast(res, 201);
}

// DELETE /settings/banners?url=/uploads/branding/xxx.jpg
export async function removeBanner(req, res) {
  const url = req.query.url;
  const current = await loadSettings();
  if (!url || !current.banners.includes(url)) {
    return res.status(404).json({ message: "Banner not found" });
  }
  const banners = current.banners.filter((b) => b !== url);
  await pool.query("UPDATE settings SET banner_urls = ? WHERE business_id = ?", [
    JSON.stringify(banners), BUSINESS_ID,
  ]);
  deleteUploadedFile(url);
  await respondAndBroadcast(res);
}
