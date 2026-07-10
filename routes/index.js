import { Router } from "express";
import rateLimit from "express-rate-limit";
import { verifyToken, requireRole } from "../middleware/auth.js";
import { uploadProductImage, uploadAvatar, uploadBranding } from "../middleware/upload.js";
import * as auth from "../controllers/auth.controller.js";
import * as users from "../controllers/users.controller.js";
import * as categories from "../controllers/categories.controller.js";
import * as products from "../controllers/products.controller.js";
import * as clients from "../controllers/clients.controller.js";
import * as sales from "../controllers/sales.controller.js";
import * as reports from "../controllers/reports.controller.js";
import * as settings from "../controllers/settings.controller.js";
import * as pub from "../controllers/public.controller.js";

const router = Router();
const manager = requireRole("owner", "admin");

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

// ── Public ──────────────────────────────────────────────────────────────────
router.post("/auth/login", loginLimiter, auth.login);
router.get("/public/menu", pub.publicMenu);

// ── Authenticated ───────────────────────────────────────────────────────────
router.use(verifyToken);

router.get("/auth/me", auth.me);
router.post("/auth/logout", auth.logout);
router.put("/auth/profile", auth.updateProfile);
router.post("/auth/avatar", uploadAvatar, auth.updateAvatar);
router.delete("/auth/avatar", auth.removeAvatar);
router.post("/auth/change-password", auth.changePassword);

router.get("/categories", categories.listCategories);
router.post("/categories", manager, categories.createCategory);
router.put("/categories/:id", manager, categories.updateCategory);
router.delete("/categories/:id", manager, categories.deleteCategory);

router.get("/products", products.listProducts);
router.get("/products/barcode/:barcode", products.getByBarcode);
router.get("/products/:id/stock-history", products.stockHistory);
router.post("/products", manager, uploadProductImage, products.createProduct);
router.put("/products/:id", manager, uploadProductImage, products.updateProduct);
router.post("/products/:id/adjust-stock", manager, products.adjustStock);
router.delete("/products/:id", manager, products.deleteProduct);

router.get("/clients", clients.listClients);
router.get("/clients/:id/purchases", clients.clientPurchases);
router.post("/clients", clients.createClient);
router.put("/clients/:id", clients.updateClient);
router.delete("/clients/:id", manager, clients.deleteClient);

router.post("/sales", sales.createSale);
router.get("/sales", sales.listSales);
router.get("/sales/:id", sales.getSale);
router.post("/sales/:id/void", manager, sales.voidSale);

router.get("/reports/summary", manager, reports.summary);
router.get("/reports/dashboard", reports.dashboard);

router.get("/settings", settings.getSettings);
router.put("/settings", requireRole("owner"), settings.updateSettings);
router.post("/settings/logo", requireRole("owner"), uploadBranding, settings.uploadLogo);
router.delete("/settings/logo", requireRole("owner"), settings.removeLogo);
router.post("/settings/banners", requireRole("owner"), uploadBranding, settings.addBanner);
router.delete("/settings/banners", requireRole("owner"), settings.removeBanner);

router.get("/users", manager, users.listUsers);
router.post("/users", requireRole("owner"), users.createUser);
router.put("/users/:id", requireRole("owner"), users.updateUser);
router.delete("/users/:id", requireRole("owner"), users.deleteUser);

export default router;
