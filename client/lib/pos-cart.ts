import type { CartLine, Product } from "./types";

const KEY = "chomnenh:pos-cart:v1";
// One shift. A cart older than this is not an interrupted sale, it is residue:
// the customer left hours ago and restoring it would let yesterday's lines be
// charged to today's customer.
const MAX_AGE_MS = 12 * 60 * 60 * 1000;

// Lines are stored as ids, never as product snapshots: a restored cart must
// reprice against current products, not against whatever they cost when saved.
type SavedLine = {
  product_id: number;
  unit_id: number | null;
  quantity: number;
  price: number | null;
  is_bonus: boolean;
};

export type SavedCart = {
  saved_at: number;
  lines: SavedLine[];
  client_id: number | null;
  discount_pct: number;
};

// Storage can throw (Safari private mode, quota). Persistence is a safety net,
// so every failure here is swallowed: it must never break a sale in progress.
export function clearSavedCart() {
  try {
    localStorage.removeItem(KEY);
  } catch {}
}

export function saveCart(
  cart: CartLine[],
  clientId: number | null,
  discountPct: number,
) {
  if (cart.length === 0) {
    clearSavedCart();
    return;
  }
  const payload: SavedCart = {
    saved_at: Date.now(),
    lines: cart.map((l) => ({
      product_id: l.product.id,
      unit_id: l.unit?.id ?? null,
      quantity: l.quantity,
      price: l.price,
      is_bonus: l.is_bonus,
    })),
    client_id: clientId,
    discount_pct: discountPct,
  };
  try {
    localStorage.setItem(KEY, JSON.stringify(payload));
  } catch {}
}

export function readSavedCart(): SavedCart | null {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as SavedCart;
    if (!p || !Array.isArray(p.lines) || typeof p.saved_at !== "number") {
      clearSavedCart();
      return null;
    }
    if (Date.now() - p.saved_at > MAX_AGE_MS) {
      clearSavedCart();
      return null;
    }
    return p;
  } catch {
    clearSavedCart(); // corrupt payload, e.g. a half-written entry
    return null;
  }
}

// Rebuild cart lines against freshly loaded products. Anything that moved on
// while the cart sat (product deleted, unit removed, stock sold) is dropped or
// clamped here rather than failing at checkout.
export function rehydrateCart(saved: SavedCart, products: Product[]): CartLine[] {
  const byId = new Map(products.map((p) => [p.id, p]));
  const out: CartLine[] = [];
  for (const l of saved.lines) {
    const product = byId.get(l.product_id);
    if (!product) continue; // deleted or deactivated since the cart was saved
    const unit = l.unit_id
      ? ((product.units ?? []).find((u) => u.id === l.unit_id) ?? null)
      : null;
    if (l.unit_id && !unit) continue; // that bulk unit no longer exists
    const factor = unit?.factor ?? 1;
    let quantity = l.quantity;
    if (product.stock_qty !== null) {
      const used = out.reduce(
        (n, o) =>
          o.product.id === product.id ? n + o.quantity * (o.unit?.factor ?? 1) : n,
        0,
      );
      const avail = product.stock_qty - used;
      quantity = Math.min(quantity, Math.max(Math.floor(avail / factor), 0));
    }
    if (quantity <= 0) continue;
    out.push({ product, unit, quantity, price: l.price, is_bonus: l.is_bonus });
  }
  return out;
}
