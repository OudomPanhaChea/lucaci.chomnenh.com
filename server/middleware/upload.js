import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { v4 as uuidv4 } from "uuid";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Images live on the server disk under /uploads and are served statically by
// index.js. Back this folder up along with the database. Swap this file for a
// Cloudinary storage engine later if object storage is preferred.
export const UPLOADS_DIR = path.join(__dirname, "..", "uploads");
const PRODUCTS_DIR = path.join(UPLOADS_DIR, "products");
const AVATARS_DIR = path.join(UPLOADS_DIR, "avatars");
const BRANDING_DIR = path.join(UPLOADS_DIR, "branding");
fs.mkdirSync(PRODUCTS_DIR, { recursive: true });
fs.mkdirSync(AVATARS_DIR, { recursive: true });
fs.mkdirSync(BRANDING_DIR, { recursive: true });

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // one limit for every image upload

const imageFilter = (_req, file, cb) => {
  if (/^image\/(jpe?g|png|webp|gif|avif)$/.test(file.mimetype)) cb(null, true);
  else cb(new Error("Only image files are allowed"));
};

const diskStorage = (dir) =>
  multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, dir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || ".jpg";
      cb(null, `${uuidv4()}${ext}`);
    },
  });

export const uploadProductImage = multer({
  storage: diskStorage(PRODUCTS_DIR),
  limits: { fileSize: MAX_IMAGE_BYTES },
  fileFilter: imageFilter,
}).single("image");

export const uploadAvatar = multer({
  storage: diskStorage(AVATARS_DIR),
  limits: { fileSize: MAX_IMAGE_BYTES },
  fileFilter: imageFilter,
}).single("avatar");

// Business logo and public-menu banners
export const uploadBranding = multer({
  storage: diskStorage(BRANDING_DIR),
  limits: { fileSize: MAX_IMAGE_BYTES },
  fileFilter: imageFilter,
}).single("image");

export function deleteUploadedFile(imageUrl) {
  if (!imageUrl || !imageUrl.startsWith("/uploads/")) return;
  const filePath = path.join(UPLOADS_DIR, imageUrl.replace("/uploads/", ""));
  fs.unlink(filePath, () => {});
}
