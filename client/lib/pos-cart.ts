import type { CartLine, Product, Sale } from "./types";

// Two carts, never one. The sale being rung up lives in "cart"; correcting an
// existing invoice loads into "edit", so a cashier sent to fix an invoice
// mid-sale finds their half-built cart exactly where they left it afterwards.
// A third slot, "pick", holds items chosen for a BONUS (bonus page → POS →
// back): nothing is sold, it is only the list a bonus is calculated on.
export type CartSlot = "cart" | "edit" | "pick";
const KEYS: Record<CartSlot, string> = {
  cart: "chomnenh:pos-cart:v1",
  edit: "chomnenh:pos-edit:v1",
  pick: "chomnenh:pos-pick:v1",
};
// One shift. A cart older than this is not an interrupted sale, it is residue:
// the customer left hours ago and restoring it would let yesterday's lines be
// charged to today's customer.
const MAX_AGE_MS = 12 * 60 * 60 * 1000;

// Lines are stored as ids, never as product snapshots: a restored cart must
// reprice against current products, not against whatever they cost when saved.
type SavedLine = {
  product_id: number;
  unit_id: number | null;
  // A sale's items snapshot the unit's NAME, not its id, so an invoice loaded
  // for correction resolves its bulk unit by name instead.
  unit_name?: string | null;
  quantity: number;
  price: number | null;
  is_bonus: boolean;
};

// The invoice a cart is correcting. Its presence is what puts the POS in edit
// mode: saving rewrites this invoice rather than issuing a new one.
export type InvoiceEdit = {
  sale_id: number;
  invoice_number: string;
  // Where the user came from, so saving or cancelling returns them there.
  return_to: string;
  // What the invoice said before, so the POS can show the difference to
  // collect or give back.
  total: number;
  paid: number;
  // Base pieces this invoice already holds, per product. The POS adds them
  // back to available stock while the correction is open: an invoice must not
  // be uncorrectable because its own stock is out.
  held: [number, number][];
};

// Items being picked for a client's bonus. Its presence puts the POS in pick
// mode: no stock checks, no payment, Confirm hands the lines back.
export type BonusPick = {
  client_id: number;
  client_name: string;
  return_to: string;
};

export type SavedCart = {
  saved_at: number;
  lines: SavedLine[];
  client_id: number | null;
  discount_pct: number;
  edit?: InvoiceEdit;
  pick?: BonusPick;
};

// Storage can throw (Safari private mode, quota). Persistence is a safety net,
// so every failure here is swallowed: it must never break a sale in progress.
export function clearSavedCart(slot: CartSlot = "cart") {
  try {
    localStorage.removeItem(KEYS[slot]);
  } catch {}
}

export function saveCart(
  cart: CartLine[],
  clientId: number | null,
  discountPct: number,
  edit?: InvoiceEdit,
  pick?: BonusPick,
) {
  const slot: CartSlot = pick ? "pick" : edit ? "edit" : "cart";
  // An emptied cart is nothing worth keeping, EXCEPT while an invoice is being
  // corrected or items picked: clearing the lines must not forget the mode.
  if (cart.length === 0 && !edit && !pick) {
    clearSavedCart(slot);
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
    edit,
    pick,
  };
  try {
    localStorage.setItem(KEYS[slot], JSON.stringify(payload));
  } catch {}
}

export function readSavedCart(slot: CartSlot = "cart"): SavedCart | null {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEYS[slot]);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as SavedCart;
    if (!p || !Array.isArray(p.lines) || typeof p.saved_at !== "number") {
      clearSavedCart(slot);
      return null;
    }
    if (Date.now() - p.saved_at > MAX_AGE_MS) {
      clearSavedCart(slot);
      return null;
    }
    return p;
  } catch {
    clearSavedCart(slot); // corrupt payload, e.g. a half-written entry
    return null;
  }
}

// Hand an existing invoice to the POS for correction. Nothing is written to
// the database here: the invoice stays exactly as it is until the corrected
// cart is saved back over it. Prices are carried across AS CHARGED, not as
// they stand today, so reopening an invoice never silently reprices it.
export function startInvoiceEdit(sale: Sale, returnTo: string) {
  const held = new Map<number, number>();
  const lines: SavedLine[] = [];
  for (const it of sale.items ?? []) {
    if (!it.product_id) continue; // product is gone entirely
    const factor = Number(it.unit_factor) || 1;
    held.set(it.product_id, (held.get(it.product_id) ?? 0) + it.quantity * factor);
    lines.push({
      product_id: it.product_id,
      unit_id: null,
      unit_name: it.unit_name,
      quantity: it.quantity,
      price: it.is_bonus ? null : Number(it.price),
      is_bonus: !!it.is_bonus,
    });
  }
  const payload: SavedCart = {
    saved_at: Date.now(),
    lines,
    client_id: sale.client_id ?? null,
    discount_pct: Number(sale.discount_pct) || 0,
    edit: {
      sale_id: sale.id,
      invoice_number: sale.invoice_number,
      return_to: returnTo,
      total: Number(sale.total) || 0,
      paid: Number(sale.amount_paid) || 0,
      held: [...held.entries()],
    },
  };
  try {
    localStorage.setItem(KEYS.edit, JSON.stringify(payload));
    return true;
  } catch {
    return false; // storage unavailable: the caller must not navigate away
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
    const units = product.units ?? [];
    // A saved cart knows its unit by id; an invoice loaded for correction by
    // name. A unit that no longer exists drops the line rather than silently
    // re-reading its quantity as base units.
    const unit = l.unit_id
      ? (units.find((u) => u.id === l.unit_id) ?? null)
      : l.unit_name
        ? (units.find((u) => u.name === l.unit_name) ?? null)
        : null;
    if ((l.unit_id || l.unit_name) && !unit) continue;
    const factor = unit?.factor ?? 1;
    let quantity = l.quantity;
    // Picked bonus items are not sold, so stock does not limit them
    if (product.stock_qty !== null && !saved.pick) {
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

// ── Bonus picks ──────────────────────────────────────────────────────────────
// The bonus page keeps its confirmed list per client; the POS works on a draft
// copy in the "pick" slot. Confirm copies the draft back, Cancel drops it, so
// leaving the POS without confirming never changes the bonus page.
export type PickedLine = {
  product_id: number;
  unit_id: number | null;
  product_name: string;
  unit_name: string; // the unit as picked (base unit word for loose items)
  quantity: number;
  price: number; // agreed price per unit
};
const pickedKey = (clientId: number) => `chomnenh:bonus-pick:v1:${clientId}`;

export function readPicked(clientId: number): PickedLine[] {
  try {
    const raw = localStorage.getItem(pickedKey(clientId));
    const lines = raw ? (JSON.parse(raw) as PickedLine[]) : [];
    return Array.isArray(lines) ? lines : [];
  } catch {
    return [];
  }
}

export function writePicked(clientId: number, lines: PickedLine[]) {
  try {
    if (lines.length === 0) localStorage.removeItem(pickedKey(clientId));
    else localStorage.setItem(pickedKey(clientId), JSON.stringify(lines));
  } catch {}
}

// Open the POS on the client's current list (empty the first time).
export function startBonusPick(pick: BonusPick, lines: PickedLine[]) {
  const payload: SavedCart = {
    saved_at: Date.now(),
    lines: lines.map((l) => ({
      product_id: l.product_id,
      unit_id: l.unit_id,
      quantity: l.quantity,
      price: l.price,
      is_bonus: false,
    })),
    client_id: pick.client_id,
    discount_pct: 0,
    pick,
  };
  try {
    localStorage.setItem(KEYS.pick, JSON.stringify(payload));
    return true;
  } catch {
    return false; // storage unavailable: the caller must not navigate away
  }
}
