import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import pool from "../config/db.js";
import { BUSINESS_ID } from "../config/business.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Images live in the `images` DB table (managed hosts wipe the app folder on
// redeploy, so the disk can't be trusted; one mysqldump backs up data AND
// images). Uploads buffer in memory (max 5MB), controllers persist them with
// storeUploadedImage() and store the returned /uploads/img/:id URL; index.js
// serves that route via serveStoredImage(). The disk folder below only serves
// files uploaded before this change.
export const UPLOADS_DIR = path.join(__dirname, "..", "uploads");

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // one limit for every image upload

const imageFilter = (_req, file, cb) => {
  if (/^image\/(jpe?g|png|webp|gif|avif)$/.test(file.mimetype)) cb(null, true);
  else cb(new Error("Only image files are allowed"));
};

const memoryUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES },
  fileFilter: imageFilter,
});

export const uploadProductImage = memoryUpload.single("image");
export const uploadAvatar = memoryUpload.single("avatar");
export const uploadBranding = memoryUpload.single("image"); // business logo + menu banners

// Persist an accepted upload; the returned URL goes in the *_url columns.
export async function storeUploadedImage(file) {
  const [result] = await pool.query(
    "INSERT INTO images (business_id, mime, bytes) VALUES (?, ?, ?)",
    [BUSINESS_ID, file.mimetype, file.buffer]
  );
  return `/uploads/img/${result.insertId}`;
}

// GET /uploads/img/:id — image ids are never reused, so cache hard.
export async function serveStoredImage(req, res) {
  const [[img]] = await pool.query(
    "SELECT mime, bytes FROM images WHERE id = ? AND business_id = ?",
    [req.params.id, BUSINESS_ID]
  );
  if (!img) return res.status(404).end();
  res.set("Content-Type", img.mime);
  res.set("Cache-Control", "public, max-age=2592000, immutable");
  res.send(img.bytes);
}

// Fire-and-forget cleanup of a replaced/removed image. Handles both DB-stored
// URLs and legacy on-disk /uploads/<kind>/<file> URLs.
export function deleteUploadedFile(imageUrl) {
  if (!imageUrl) return;
  const stored = imageUrl.match(/^\/uploads\/img\/(\d+)$/);
  if (stored) {
    pool
      .query("DELETE FROM images WHERE id = ? AND business_id = ?", [stored[1], BUSINESS_ID])
      .catch(() => {});
    return;
  }
  if (imageUrl.startsWith("/uploads/")) {
    const filePath = path.join(UPLOADS_DIR, imageUrl.replace("/uploads/", ""));
    fs.unlink(filePath, () => {});
  }
}
