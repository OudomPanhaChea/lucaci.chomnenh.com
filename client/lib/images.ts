"use client";
import { toast } from "react-toastify";

// Server-side multer enforces the same limit (see server/middleware/upload.js)
export const MAX_IMAGE_MB = 5;

export function validateImageFile(file: File): boolean {
  if (!file.type.startsWith("image/")) {
    toast.error("Only image files are allowed");
    return false;
  }
  if (file.size > MAX_IMAGE_MB * 1024 * 1024) {
    toast.error(`Image must be under ${MAX_IMAGE_MB}MB`);
    return false;
  }
  return true;
}
