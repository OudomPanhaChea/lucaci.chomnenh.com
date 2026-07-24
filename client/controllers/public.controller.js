import pool from "../config/db.js";
import { BUSINESS_ID } from "../config/business.js";

// Unauthenticated, read-only menu for lucaci.chomnenh.com/menu.
// Prices only — no stock counts, no cost, no ordering.
export async function publicMenu(_req, res) {
  const [[settings]] = await pool.query(
    `SELECT business_name, logo_url, banner_urls, phone, address, currency, exchange_rate, menu_public
     FROM settings WHERE business_id = ?`,
    [BUSINESS_ID]
  );
  if (!settings?.menu_public) {
    return res.status(404).json({ message: "Menu is not available" });
  }
  const [categories] = await pool.query(
    "SELECT id, name FROM categories WHERE business_id = ? ORDER BY display_number, name",
    [BUSINESS_ID]
  );
  const [products] = await pool.query(
    `SELECT id, name, category_id, sell_price, discount_pct, image_url, description
     FROM products
     WHERE business_id = ? AND is_deleted = 0 AND is_active = 1 AND show_in_menu = 1
     ORDER BY display_number DESC`,
    [BUSINESS_ID]
  );
  let banners = [];
  try { banners = JSON.parse(settings.banner_urls || "[]"); } catch { /* ignore */ }
  res.json({
    business: {
      name: settings.business_name,
      logo_url: settings.logo_url,
      banners: Array.isArray(banners) ? banners : [],
      phone: settings.phone,
      address: settings.address,
      currency: settings.currency,
      exchange_rate: settings.exchange_rate,
    },
    categories,
    products,
  });
}
