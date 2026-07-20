import type { Product } from "@/lib/types";
import { unitPrice } from "@/lib/format";

// Product grid/table ordering, picked in the sort menu and remembered per page
// so the POS and inventory always come back the way the user left them.
export type ProductSortKey =
  | "newest"
  | "name_asc"
  | "name_desc"
  | "price_asc"
  | "price_desc"
  | "stock_asc";

export const PRODUCT_SORTS: { key: ProductSortKey; label: string }[] = [
  { key: "name_asc", label: "Name A to Z" },
  { key: "name_desc", label: "Name Z to A" },
  { key: "price_asc", label: "Price low to high" },
  { key: "price_desc", label: "Price high to low" },
  { key: "stock_asc", label: "Stock low to high" },
  { key: "newest", label: "Newest first" },
];

const keys = new Set(PRODUCT_SORTS.map((s) => s.key));
const storageKey = (page: string) => `chomnenh:sort:${page}`;

// Price as the cashier sees it on the card (discount applied).
const effectivePrice = (p: Product) => unitPrice(p.sell_price, p.discount_pct);

export function sortProducts(list: Product[], key: ProductSortKey): Product[] {
  const s = [...list];
  switch (key) {
    case "name_asc":
      return s.sort((a, b) => a.name.localeCompare(b.name));
    case "name_desc":
      return s.sort((a, b) => b.name.localeCompare(a.name));
    case "price_asc":
      return s.sort((a, b) => effectivePrice(a) - effectivePrice(b));
    case "price_desc":
      return s.sort((a, b) => effectivePrice(b) - effectivePrice(a));
    case "stock_asc":
      // untracked stock sorts last, it is never "low"
      return s.sort(
        (a, b) =>
          (a.stock_qty ?? Number.MAX_SAFE_INTEGER) -
          (b.stock_qty ?? Number.MAX_SAFE_INTEGER),
      );
    case "newest":
      return s.sort((a, b) => b.display_number - a.display_number);
  }
}

// Storage is a convenience, never a requirement: private mode or a full quota
// must not break the page, so both calls swallow failures.
export function readStoredSort(
  page: string,
  fallback: ProductSortKey,
): ProductSortKey {
  try {
    const v = localStorage.getItem(storageKey(page));
    if (v && keys.has(v as ProductSortKey)) return v as ProductSortKey;
  } catch {}
  return fallback;
}

export function storeSort(page: string, key: ProductSortKey) {
  try {
    localStorage.setItem(storageKey(page), key);
  } catch {}
}
