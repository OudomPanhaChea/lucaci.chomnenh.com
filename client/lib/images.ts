"use client";
import { toast } from "react-toastify";
import { t } from "@/lib/i18n";

// Server-side multer enforces the same limit (see server/middleware/upload.js)
export const MAX_IMAGE_MB = 5;

export function validateImageFile(file: File): boolean {
  if (!file.type.startsWith("image/")) {
    toast.error(t("Images only"));
    return false;
  }
  if (file.size > MAX_IMAGE_MB * 1024 * 1024) {
    toast.error(t("Image must be under {mb}MB", { mb: MAX_IMAGE_MB }));
    return false;
  }
  return true;
}
