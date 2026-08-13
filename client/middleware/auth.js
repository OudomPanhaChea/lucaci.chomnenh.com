import jwt from "jsonwebtoken";
import { BUSINESS_ID } from "../config/business.js";

export const COOKIE_NAME = "chamnenh_token";

export function verifyToken(req, res, next) {
  const token =
    req.cookies?.[COOKIE_NAME] ||
    (req.headers.authorization || "").replace(/^Bearer\s+/i, "") ||
    null;
  if (!token) return res.status(401).json({ message: "Not authenticated" });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    // A token issued by another business's backend must not work here.
    // Tokens from before the tenancy change carry no business_id: let them
    // pass (this deployment was the only issuer) until they expire.
    if (req.user.business_id !== undefined && req.user.business_id !== BUSINESS_ID) {
      return res.status(401).json({ message: "Session expired, please log in again" });
    }
    next();
  } catch {
    return res.status(401).json({ message: "Session expired, please log in again" });
  }
}

// requireRole("owner", "admin") — cashiers blocked from destructive routes
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: "You don't have permission for this action" });
    }
    next();
  };
}
