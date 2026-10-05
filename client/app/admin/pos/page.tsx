"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Input, Modal, Popconfirm, Select, Segmented, Form, Switch } from "antd";
import { Button } from "@/components/ui/button";
import { InputNumber } from "@/components/ui/input-number";
import { toast } from "react-toastify";
import {
  ScanBarcode,
  Search,
  Minus,
  Plus,
  Trash2,
  ShoppingCart,
  Printer,
  PackageOpen,
  UserPlus,
  Gift,
  Handshake,
  UserRound,
  Banknote,
  QrCode,
  CreditCard,
  Landmark,
  FilePen,
  X,
  Check,
} from "lucide-react";
import api, { apiError } from "@/services/api";
import { playScanBeep, playScanError } from "@/lib/sound";
import {
  saveCart,
  readSavedCart,
  clearSavedCart,
  rehydrateCart,
  writePicked,
  type InvoiceEdit,
  type BonusPick,
} from "@/lib/pos-cart";
import { useRealtime } from "@/hooks/useRealtime";
import BarcodeScanner from "@/components/barcode-scanner";
import ProductSortMenu from "@/components/product-sort-menu";
import {
  sortProducts,
  readStoredSort,
  storeSort,
  type ProductSortKey,
} from "@/lib/product-sort";
import Receipt from "@/components/receipt";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { useT, t as tNow } from "@/lib/i18n";
import { money, khr, num, unitPrice } from "@/lib/format";
import type {
  Product,
  ProductUnit,
  Category,
  Client,
  CartLine,
  Sale,
  Settings,
  PaymentMethod,
} from "@/lib/types";

// A cart line is product + unit (+ bonus flag): the same product can sit in the
// cart as pieces, as a "Box of 12", and as a FREE bonus line at the same time.
const lineKey = (l: CartLine) =>
  `${l.product.id}:${l.unit?.id ?? 0}:${l.is_bonus ? 1 : 0}`;
const lineFactor = (l: CartLine) => l.unit?.factor ?? 1;
const lineListPrice = (l: CartLine) =>
  l.unit
    ? Number(l.unit.sell_price)
    : unitPrice(l.product.sell_price, l.product.discount_pct);
const linePrice = (l: CartLine) =>
  l.is_bonus ? 0 : (l.price ?? lineListPrice(l));
// Stock is counted in base pieces across every line of the product
const piecesOf = (lines: CartLine[], productId: number, exceptKey?: string) =>
  lines.reduce(
    (n, l) =>
      l.product.id === productId && lineKey(l) !== exceptKey
        ? n + l.quantity * lineFactor(l)
        : n,
    0,
  );
// "Items" = different products in the cart (a, b and c = 3), never summed
// quantities: 10 pcs + 10 boxes of one product is one item.
const countItems = (lines: { product: { id: number } }[]) =>
  new Set(lines.map((l) => l.product.id)).size;

// What a line change had to give up, so the caller can explain it. Quantities
// are in the line's OWN unit (boxes stay boxes): never show base conversions.
type Clamp = {
  product_id: number;
  name: string;
  unit: string;
  granted: number;
} | null;

// Change one line, then re-merge (unit/bonus changes can land on an existing
// line's key) and re-cap the quantity against stock in pieces. Pure and
// side-effect free on purpose: React may replay this, so the toast is the
// caller's job, not ours.
const applyLineChange = (
  lines: CartLine[],
  key: string,
  mutate: (l: CartLine) => CartLine,
  ignoreStock = false,
): { lines: CartLine[]; clamped: Clamp } => {
  const idx = lines.findIndex((l) => lineKey(l) === key);
  if (idx < 0) return { lines, clamped: null };
  let next = mutate(lines[idx]);
  const rest = lines.filter((_, i) => i !== idx);
  const dupIdx = rest.findIndex((l) => lineKey(l) === lineKey(next));
  if (dupIdx >= 0) {
    next = { ...next, quantity: next.quantity + rest[dupIdx].quantity };
    rest.splice(dupIdx, 1);
  }
  let clamped: Clamp = null;
  if (next.product.stock_qty !== null && !ignoreStock) {
    const avail = next.product.stock_qty - piecesOf(rest, next.product.id);
    const max = Math.max(Math.floor(avail / lineFactor(next)), 0);
    // Only a REQUEST above the cap is a clamp. Reaching 0 by pressing minus or
    // remove is deliberate and must stay silent.
    if (next.quantity > max) {
      clamped = {
        product_id: next.product.id,
        name: next.product.name,
        unit: next.unit?.name ?? next.product.base_unit ?? "pcs",
        granted: max,
      };
      next = { ...next, quantity: max };
    }
  }
  if (next.quantity <= 0) return { lines: rest, clamped };
  const out = [...rest];
  out.splice(Math.min(idx, out.length), 0, next);
  return { lines: out, clamped };
};

// Small pill buttons used for quick amounts in the payment modal
const chipCls = (active: boolean) =>
  `cursor-pointer rounded-md border px-2.5 py-1 text-xs transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-40 ${
    active
      ? "border-brand bg-brand-soft font-medium text-brand-soft-foreground"
      : "border-line text-fg-muted hover:border-line-strong hover:text-fg"
  }`;

export default function PosPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [sort, setSort] = useState<ProductSortKey>("name_asc");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [clientId, setClientId] = useState<number | null>(null);
  const [discountPct, setDiscountPct] = useState(0);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [paying, setPaying] = useState(false);
  const [method, setMethod] = useState<PaymentMethod>("cash");
  // Concrete dollars in the "Paying now" box; null = the box is empty. openPay
  // seeds it with the amount due. Never a "full pay" sentinel: a sentinel made
  // the input snap between Full and Pay later while the cashier was typing.
  const [payAmount, setPayAmount] = useState<number | null>(null);
  const [useCredit, setUseCredit] = useState(false);
  const [lastSale, setLastSale] = useState<Sale | null>(null);
  const [quickClientOpen, setQuickClientOpen] = useState(false);
  const [clientsLoaded, setClientsLoaded] = useState(false);
  // Set when this screen was opened to CORRECT an existing invoice rather than
  // ring up a new one. Everything behaves the same; only where the cart is
  // persisted, and what the button at the bottom does, changes.
  const [editing, setEditing] = useState<InvoiceEdit | null>(null);
  const editRef = useRef<InvoiceEdit | null>(null);
  // Set when the bonus page sent the user here to pick items for a bonus.
  // Nothing is sold: no stock limit, no payment, Confirm hands the list back.
  const [picking, setPicking] = useState<BonusPick | null>(null);
  const pickRef = useRef<BonusPick | null>(null);
  // Base pieces the invoice being corrected already holds, per product. Added
  // back onto the loaded products so every stock check counts the invoice's
  // own stock as available to it.
  const allowanceRef = useRef<Map<number, number>>(new Map());
  // Set the moment we navigate away, so the persist effect cannot write the
  // finished edit cart back into storage on the way out.
  const leavingRef = useRef(false);
  const router = useRouter();
  const { t } = useT();
  const searchRef = useRef<HTMLInputElement>(null);
  const restoreDone = useRef(false);
  // Latest cart for event handlers. Reading state inside a setCart updater is
  // fine; SIDE EFFECTS in one are not (React may replay it), so the stock toast
  // below reads this instead.
  const cartRef = useRef<CartLine[]>([]);
  useEffect(() => {
    cartRef.current = cart;
  }, [cart]);

  // One live toast per product: repeat refusals must not stack, but a plain
  // toastId SUPPRESSES the new message and leaves the old one on screen, which
  // goes stale the moment the cap changes (switch the line to boxes and "Only
  // 10 pcs" is a lie). Update the live one instead, and restart its timer.
  const stockToast = useCallback((productId: number, msg: string) => {
    const id = `stock-${productId}`;
    if (toast.isActive(id))
      toast.update(id, { render: msg, type: "warning", autoClose: 5000 });
    else toast.warn(msg, { toastId: id });
  }, []);

  const loadProducts = useCallback(() => {
    // While correcting an invoice the list is NOT filtered to active products:
    // a line already on the invoice must survive its product being retired.
    // `sellable` below is what the grid and scanner use, so a retired product
    // still cannot be ADDED.
    const params = editRef.current ? {} : { active: 1 };
    api
      .get("/products", { params })
      .then(({ data }) => {
        const allowance = allowanceRef.current;
        setProducts(
          allowance.size === 0
            ? data
            : (data as Product[]).map((p) =>
                p.stock_qty !== null && allowance.has(p.id)
                  ? { ...p, stock_qty: p.stock_qty + allowance.get(p.id)! }
                  : p,
              ),
        );
      })
      .catch(() => {});
  }, []);
  const loadClients = useCallback(() => {
    api
      .get("/clients")
      .then(({ data }) => setClients(data))
      .catch(() => {})
      .finally(() => setClientsLoaded(true));
  }, []);

  // Read the invoice being corrected BEFORE anything loads: the products
  // request has to know whether to include retired ones, and the allowance has
  // to be in place before the response lands.
  useEffect(() => {
    const pick = readSavedCart("pick")?.pick;
    if (pick) {
      pickRef.current = pick;
      setPicking(pick);
      return;
    }
    const saved = readSavedCart("edit");
    if (!saved?.edit) return;
    editRef.current = saved.edit;
    allowanceRef.current = new Map(saved.edit.held ?? []);
    setEditing(saved.edit);
  }, []);

  useEffect(() => {
    loadProducts();
    loadClients();
    api
      .get("/categories")
      .then(({ data }) => setCategories(data))
      .catch(() => {});
    api
      .get("/settings")
      .then(({ data }) => setSettings(data))
      .catch(() => {});
  }, [loadProducts, loadClients]);

  useRealtime(["product:changed"], loadProducts);
  useRealtime(["client:changed"], loadClients);
  useRealtime(["settings:changed"], (_e, payload) =>
    setSettings(payload as Settings),
  );

  // Restore an interrupted sale. Waits for products AND clients: lines reprice
  // against current products, and restoring a partner's cart without their row
  // loaded would silently reprice the sale at retail.
  useEffect(() => {
    if (restoreDone.current || products.length === 0 || !clientsLoaded) return;
    restoreDone.current = true;
    const edit = editRef.current;
    const pick = pickRef.current;
    const saved = readSavedCart(pick ? "pick" : edit ? "edit" : "cart");
    if (!saved) return;
    const lines = rehydrateCart(saved, products);
    if (pick) {
      setCart(lines);
      setClientId(pick.client_id);
      return; // the banner says what this is
    }
    if (lines.length === 0 && !edit) {
      clearSavedCart(); // every line went away; nothing left to restore
      return;
    }
    setCart(lines);
    setClientId(
      saved.client_id && clients.some((c) => c.id === saved.client_id)
        ? saved.client_id
        : null,
    );
    setDiscountPct(saved.discount_pct);
    if (edit) {
      // The invoice keeps its client; the client list is only for display.
      setClientId(saved.client_id);
      // A line the cart could not rebuild (its bulk unit was deleted since)
      // would otherwise vanish from the invoice on save without a word.
      const lost = saved.lines.length - lines.length;
      if (lost > 0) {
        toast.warn(tNow("Some lines could not be loaded. Check before saving."), {
          toastId: "edit-lines-lost",
          autoClose: false,
        });
      }
      return; // the banner names the invoice; a toast on top would be noise
    }
    // A pre-filled cart the cashier did not just build needs SOME notice, or a
    // leftover gets charged to the next customer. restoreDone already makes
    // this fire once; the id is belt and braces.
    const count = countItems(lines);
    toast.info(tNow("Cart restored ({n})", { n: num(count) }), {
      toastId: "cart-restored",
    });
  }, [products, clients, clientsLoaded]);

  // Persist the sale in progress so a reload, a crash, or iOS evicting the tab
  // mid-rush doesn't cost the cashier a scanned cart. Guarded on restoreDone or
  // the first render's empty cart would wipe the entry before it is read back.
  // A correction is parked in its own slot, so the sale the cashier had in
  // progress is still waiting for them afterwards.
  useEffect(() => {
    if (!restoreDone.current || leavingRef.current) return;
    saveCart(cart, clientId, discountPct, editing ?? undefined, picking ?? undefined);
  }, [cart, clientId, discountPct, editing, picking]);

  const discardCart = () => {
    setCart([]);
    setClientId(null);
    setDiscountPct(0);
  };

  // Leave a correction without writing anything. The invoice is rewritten only
  // when Save is pressed, so this simply forgets the draft and goes back. The
  // sale that was in progress before is still parked in the other slot.
  const leaveEdit = () => {
    leavingRef.current = true;
    clearSavedCart("edit");
    const to = editing?.return_to || "/admin/invoices";
    editRef.current = null;
    setEditing(null);
    router.push(to);
  };

  // Leave pick mode. Cancel drops the draft; confirmPick saves it first.
  const leavePick = () => {
    leavingRef.current = true;
    clearSavedCart("pick");
    const to = picking?.return_to || "/admin/bonus";
    pickRef.current = null;
    setPicking(null);
    router.push(to);
  };
  const confirmPick = () => {
    if (!picking) return;
    writePicked(
      picking.client_id,
      cartRef.current.map((l) => ({
        product_id: l.product.id,
        unit_id: l.unit?.id ?? null,
        product_name: l.product.name,
        unit_name: l.unit?.name ?? l.product.base_unit ?? "pcs",
        quantity: l.quantity,
        price: linePrice(l),
      })),
    );
    leavePick();
  };

  // The chosen sort is remembered per page: read it back once on mount (not in
  // the initializer, localStorage does not exist during server render).
  useEffect(() => {
    setSort(readStoredSort("pos", "name_asc"));
  }, []);
  const changeSort = useCallback((k: ProductSortKey) => {
    setSort(k);
    storeSort("pos", k);
  }, []);

  // What can be SOLD right now. While an invoice is being corrected `products`
  // also carries retired ones, so its existing lines can be rebuilt; those
  // must never become addable as NEW lines.
  const sellable = useMemo(
    () => products.filter((p) => p.is_active !== 0),
    [products],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sortProducts(
      sellable.filter(
        (p) =>
          (!categoryId || p.category_id === categoryId) &&
          (!q ||
            p.name.toLowerCase().includes(q) ||
            p.barcode?.includes(q) ||
            p.sku?.toLowerCase().includes(q)),
      ),
      sort,
    );
  }, [sellable, search, categoryId, sort]);

  // What of each product is already in the cart, per unit as entered, so the
  // card can show the add registered. Never summed across units: 10 pcs and
  // 10 boxes are not "20".
  const inCart = useMemo(() => {
    const m = new Map<number, { qty: number; units: Set<string>; desc: string[] }>();
    for (const l of cart) {
      const e = m.get(l.product.id) ?? { qty: 0, units: new Set(), desc: [] };
      const unit = l.unit?.name ?? l.product.base_unit ?? "pcs";
      e.qty += l.quantity;
      e.units.add(unit);
      e.desc.push(`${num(l.quantity)} ${unit}${l.is_bonus ? " free" : ""}`);
      m.set(l.product.id, e);
    }
    return m;
  }, [cart]);

  // Adding is silent by design: the cart itself is the feedback, and scans
  // already beep. Only a REFUSED add says anything, because that is the case
  // the cashier cannot see.
  const addToCart = useCallback(
    (product: Product, opts: { unit?: ProductUnit | null } = {}) => {
      const unit = opts.unit ?? null;
      // Stock check in pieces across every line of this product; NULL = untracked.
      // Items picked for a bonus are not sold, so stock does not apply.
      if (product.stock_qty !== null && !pickRef.current) {
        const used = piecesOf(cartRef.current, product.id);
        if (used + (unit?.factor ?? 1) > product.stock_qty) {
          playScanError();
          // Scanning a maxed-out product five times is one problem, not five
          // toasts.
          stockToast(
            product.id,
            tNow("Only {n} {unit} left: {name}", {
              n: num(product.stock_qty),
              unit: product.base_unit || "pcs",
              name: product.name,
            }),
          );
          return;
        }
      }
      setCart((prev) => {
        const key = `${product.id}:${unit?.id ?? 0}:0`;
        const line = prev.find((l) => lineKey(l) === key);
        return line
          ? prev.map((l) =>
              lineKey(l) === key ? { ...l, quantity: l.quantity + 1 } : l,
            )
          : [
              ...prev,
              { product, unit, quantity: 1, price: null, is_bonus: false },
            ];
      });
    },
    [],
  );

  // Barcode entry point for camera scans. Sound is the only feedback:
  // the scanner already beeped on the read, a buzz means "no such product".
  // A carton (unit) barcode adds the whole bulk unit, not a piece.
  const handleBarcode = useCallback(
    async (code: string) => {
      const local = sellable.find((p) => p.barcode === code);
      if (local) {
        addToCart(local);
        return;
      }
      const byUnit = sellable.find((p) =>
        p.units?.some((u) => u.barcode === code),
      );
      if (byUnit) {
        addToCart(byUnit, {
          unit: byUnit.units!.find((u) => u.barcode === code),
        });
        return;
      }
      try {
        const { data } = await api.get(
          `/products/barcode/${encodeURIComponent(code)}`,
        );
        const unit = data.matched_unit_id
          ? ((data.units ?? []).find(
              (u: ProductUnit) => u.id === data.matched_unit_id,
            ) ?? null)
          : null;
        addToCart(data, { unit });
      } catch {
        playScanError();
      }
    },
    [sellable, addToCart],
  );

  // USB scanners "type" the code then send Enter. Beep on hit, buzz on an
  // unknown code — no toasts, the cashier hears the result without looking.
  const onSearchEnter = () => {
    const code = search.trim();
    if (!code) return;
    const exact = sellable.find((p) => p.barcode === code);
    const byUnit = exact
      ? null
      : sellable.find((p) => p.units?.some((u) => u.barcode === code));
    if (exact) {
      playScanBeep();
      addToCart(exact);
      setSearch("");
    } else if (byUnit) {
      playScanBeep();
      addToCart(byUnit, {
        unit: byUnit.units!.find((u) => u.barcode === code),
      });
      setSearch("");
    } else if (filtered.length === 1) {
      playScanBeep();
      addToCart(filtered[0]);
      setSearch("");
    } else if (filtered.length === 0) {
      playScanError();
    }
  };

  // Silently capping a typed quantity reads as a broken input (type 999, get
  // 12), so a clamp says why. No buzz here, unlike a scan: the cashier is
  // already looking at the field they just typed into.
  const mutateLine = (key: string, mutate: (l: CartLine) => CartLine) => {
    const { lines, clamped } = applyLineChange(
      cartRef.current,
      key,
      mutate,
      !!pickRef.current,
    );
    setCart(lines);
    cartRef.current = lines; // keep rapid keystrokes off a stale read
    if (clamped) {
      // Typing "999" fires onChange per keystroke: one problem, one toast
      stockToast(
        clamped.product_id,
        clamped.granted === 0
          ? tNow("Out of stock: {name}", { name: clamped.name })
          : tNow("Only {n} {unit} left: {name}", {
              n: num(clamped.granted),
              unit: clamped.unit,
              name: clamped.name,
            }),
      );
    }
  };
  const setQty = (key: string, qty: number) =>
    mutateLine(key, (l) => ({ ...l, quantity: qty }));
  const changeUnit = (key: string, unitId: number) =>
    mutateLine(key, (l) => ({
      ...l,
      unit: unitId
        ? ((l.product.units ?? []).find((u) => u.id === unitId) ?? null)
        : null,
      price: null,
    }));
  const toggleBonus = (key: string) =>
    mutateLine(key, (l) => ({ ...l, is_bonus: !l.is_bonus, price: null }));
  const setLinePrice = (key: string, price: number | null) =>
    mutateLine(key, (l) => ({ ...l, price }));

  const subtotal = cart.reduce((sum, l) => sum + linePrice(l) * l.quantity, 0);
  const discountAmount = subtotal * (discountPct / 100);
  // A bonus pick is a plain list of items at agreed prices: no tax
  const taxRate = picking ? 0 : Number(settings?.tax_rate) || 0;
  const taxAmount = (subtotal - discountAmount) * (taxRate / 100);
  const total = Math.round((subtotal - discountAmount + taxAmount) * 100) / 100;

  // Payment split: prepaid credit first (if toggled on), then money handed
  // over now; whatever remains is recorded as owing on the client's account.
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const selectedClient = clients.find((c) => c.id === clientId) ?? null;
  // Partner mode recolors the cart so the cashier always knows which kind of
  // sale is open, even mid-rush with a full cart.
  const isPartner = selectedClient?.client_type === "partner";
  const clientCredit = round2(Number(selectedClient?.credit_balance) || 0);
  const creditApplied =
    useCredit && selectedClient ? Math.min(clientCredit, total) : 0;
  const dueAfterCredit = round2(total - creditApplied);
  // An empty box counts as $0 (pay later needs a client anyway); an amount
  // above what is due settles the invoice, never overpays it.
  const payingNow =
    payAmount === null ? 0 : Math.min(round2(payAmount), dueAfterCredit);
  const owing = round2(dueAfterCredit - payingNow);

  const openPay = () => {
    setPayAmount(total);
    setUseCredit(false);
    setMethod("cash");
    setPayOpen(true);
  };

  const checkout = async () => {
    setPaying(true);
    try {
      const { data } = await api.post("/sales", {
        items: cart.map((l) => ({
          product_id: l.product.id,
          quantity: l.quantity,
          unit_id: l.unit?.id,
          // only send a price when the cashier actually overrode it
          price: l.is_bonus ? undefined : (l.price ?? undefined),
          is_bonus: l.is_bonus || undefined,
        })),
        client_id: clientId,
        discount_pct: discountPct,
        payment_method: method,
        amount_received: null,
        amount_paid: payingNow,
        use_credit: useCredit,
      });
      setLastSale(data);
      discardCart(); // also drops the persisted copy via the save effect
      setPayAmount(null);
      setUseCredit(false);
      setMethod("cash");
      setPayOpen(false);
      if (owing > 0) {
        toast.info(t("Sold {invoice}, {amount} owing", { invoice: data.invoice_number, amount: money(owing) }));
      } else {
        toast.success(t("Sold {invoice}", { invoice: data.invoice_number }));
      }
      loadClients();
    } catch (err) {
      toast.error(apiError(err, t("Sale failed")));
      loadProducts();
    } finally {
      setPaying(false);
    }
  };

  // What a correction does to the money: a settled invoice has to be settled
  // again at the new total, so the difference is collected or handed back.
  const editWasSettled = !!editing && editing.paid >= editing.total;
  const editDiff = editing ? round2(total - editing.total) : 0;

  // Save a correction back over the invoice it came from. It keeps its number;
  // items, totals, stock and ledger are rewritten server-side.
  const saveInvoice = async () => {
    const edit = editing;
    if (!edit || cart.length === 0 || paying) return;
    setPaying(true);
    try {
      await api.put(`/sales/${edit.sale_id}`, {
        items: cart.map((l) => ({
          product_id: l.product.id,
          quantity: l.quantity,
          unit_id: l.unit?.id,
          price: l.is_bonus ? undefined : (l.price ?? undefined),
          is_bonus: l.is_bonus || undefined,
        })),
        discount_pct: discountPct,
      });
      toast.success(t("Invoice saved"));
      leaveEdit();
    } catch (err) {
      toast.error(apiError(err, t("Could not save")));
      loadProducts();
    } finally {
      setPaying(false);
    }
  };

  const quickCreateClient = async (values: {
    name: string;
    phone?: string;
    client_type?: "normal" | "partner";
  }) => {
    try {
      const { data } = await api.post("/clients", values);
      await loadClients();
      setClientId(data.id);
      setQuickClientOpen(false);
      toast.success(t("Client added"));
    } catch (err) {
      toast.error(apiError(err));
    }
  };

  return (
    <div className="flex flex-col gap-4 xl:h-[calc(100dvh-6.5rem)] xl:flex-row">
      {/* ── Product picker ── */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* The mode, stated before anything else. It sits in this column and
            not in the cart because the cart is BELOW the products on a phone,
            and nobody should start tapping products without knowing they are
            editing an invoice rather than starting a sale. */}
        {picking && (
          <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-brand/40 bg-brand-soft px-3.5 py-2.5">
            <Gift
              className="h-5 w-5 shrink-0 text-brand-soft-foreground"
              aria-hidden
            />
            <p className="min-w-[12rem] flex-1 text-sm font-semibold text-brand-soft-foreground">
              {t("Bonus items for {name}", { name: picking.client_name })}
            </p>
            <Popconfirm
              title={t("Leave without saving?")}
              okText={t("Yes")}
              cancelText={t("No")}
              okButtonProps={{ danger: true }}
              onConfirm={leavePick}
            >
              <Button icon={<X className="h-4 w-4" aria-hidden />}>{t("Cancel")}</Button>
            </Popconfirm>
          </div>
        )}
        {editing && (
          <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-brand/40 bg-brand-soft px-3.5 py-2.5">
            <FilePen
              className="h-5 w-5 shrink-0 text-brand-soft-foreground"
              aria-hidden
            />
            <p className="min-w-[12rem] flex-1 text-sm font-semibold text-brand-soft-foreground">
              {t("Editing {invoice}", { invoice: editing.invoice_number })}
            </p>
            <Popconfirm
              title={t("Stop editing without saving?")}
              okText={t("Yes")}
              cancelText={t("No")}
              okButtonProps={{ danger: true }}
              onConfirm={leaveEdit}
            >
              <Button icon={<X className="h-4 w-4" aria-hidden />}>{t("Cancel")}</Button>
            </Popconfirm>
          </div>
        )}
        <div className="mb-3 flex gap-2">
          <Input
            ref={searchRef as never}
            size="large"
            allowClear
            prefix={<Search className="h-4 w-4 text-fg-subtle" />}
            placeholder={t("Search or scan")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onPressEnter={onSearchEnter}
          />
          <Button
            size="large"
            icon={<ScanBarcode className="h-4.5 w-4.5" />}
            onClick={() => setScannerOpen(true)}
          >
            <span className="hidden sm:inline">{t("Scan")}</span>
          </Button>
          <ProductSortMenu size="large" value={sort} onChange={changeSort} />
        </div>

        <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1">
          {[{ id: null, name: t("All") }, ...categories].map((c) => (
            <button
              key={c.id ?? "all"}
              type="button"
              onClick={() => setCategoryId(c.id)}
              className={`shrink-0 cursor-pointer rounded-full border px-3 py-1.5 text-sm transition-colors duration-200 ${
                categoryId === c.id
                  ? "border-brand bg-brand text-brand-foreground"
                  : "border-line bg-surface-raised text-fg-muted hover:border-line-strong hover:text-fg"
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <EmptyState
              icon={PackageOpen}
              title={t("No products found")}
            />
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
              {filtered.map((p) => {
                const price = unitPrice(p.sell_price, p.discount_pct);
                const out =
                  !picking && p.stock_qty !== null && p.stock_qty <= 0;
                const entry = inCart.get(p.id);
                const carted = entry?.qty ?? 0;
                // In partner mode, surface the largest bulk unit's price on the card
                const bulk =
                  isPartner && p.units?.length
                    ? p.units[p.units.length - 1]
                    : null;
                return (
                  <button
                    key={p.id}
                    type="button"
                    disabled={out}
                    onClick={() => addToCart(p)}
                    // flex-col keeps content top-aligned when the grid row
                    // stretches this card (a bare <button> centers it, which
                    // made images drift down on shorter cards)
                    className={`group flex flex-col overflow-hidden rounded-xl border bg-surface-raised text-left shadow-card transition-colors duration-200 ${
                      carted > 0 ? "border-brand/60" : "border-line"
                    } ${out ? "opacity-50" : "cursor-pointer hover:border-brand"}`}
                  >
                    <div className="relative aspect-square w-full shrink-0 bg-surface-sunken">
                      {p.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={p.image_url}
                          alt={p.name}
                          loading="lazy"
                          className="absolute inset-0 h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center">
                          <PackageOpen className="h-7 w-7 text-fg-subtle" />
                        </div>
                      )}
                      {p.discount_pct > 0 && (
                        <span className="absolute left-2 top-2 rounded-full bg-brand px-2 py-0.5 text-xs font-medium text-white">
                          -{p.discount_pct}%
                        </span>
                      )}
                      {out && (
                        <span className="absolute inset-x-0 bottom-0 bg-black/60 py-1 text-center text-xs text-white">
                          {t("Out of stock")}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-1 flex-col p-2.5">
                      <div className="flex items-center justify-between gap-1.5">
                        <p className="min-w-0 truncate! text-nowrap text-sm font-medium text-fg">
                          {p.name}
                        </p>
                        {entry && (
                          // key remounts the pill on every quantity change so
                          // the pop replays: the cashier sees the add land.
                          // Several units of one product (pcs + boxes) cannot
                          // be added up, so they show a tick instead of a sum.
                          <span
                            key={entry.desc.join("+")}
                            title={entry.desc.join(" + ")}
                            aria-label={t("In cart: {items}", { items: entry.desc.join(" + ") })}
                            className="badge-pop tabular flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-brand px-1 text-center text-xs font-semibold leading-none text-brand-foreground"
                          >
                            {entry.units.size === 1 ? (
                              num(carted)
                            ) : (
                              <Check className="h-3 w-3" aria-hidden />
                            )}
                          </span>
                        )}
                      </div>
                      {bulk && (
                        <p className="tabular truncate text-[11px] font-medium text-brand-600 dark:text-brand-400">
                          {bulk.name}: {money(bulk.sell_price)}
                        </p>
                      )}
                      <div className="mt-auto flex items-baseline justify-between pt-1">
                        <span className="tabular text-sm font-semibold text-brand dark:text-brand-soft-foreground">
                          {money(price)}
                        </span>
                        {p.stock_qty !== null && (
                          <span className="tabular text-xs text-fg-subtle">
                            {t("{n} left", { n: num(p.stock_qty) })}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Cart ── */}
      <div
        className={`flex w-full flex-col overflow-hidden rounded-xl border bg-surface-raised shadow-card xl:h-full xl:w-96 2xl:w-[26rem] ${
          isPartner ? "border-brand/50 dark:border-brand-500/50" : "border-line"
        }`}
      >
        <div className="flex items-center justify-between border-b border-line p-3">
          <h2 className="flex min-w-0 items-center gap-2 font-medium text-fg">
            {picking ? (
              <>
                <Gift className="h-4.5 w-4.5 shrink-0" aria-hidden />{" "}
                {t("Bonus items")}
              </>
            ) : editing ? (
              <>
                <FilePen className="h-4.5 w-4.5 shrink-0" aria-hidden />
                <span className="truncate font-mono text-sm">
                  {editing.invoice_number}
                </span>
              </>
            ) : (
              <>
                <ShoppingCart className="h-4.5 w-4.5 shrink-0" aria-hidden />{" "}
                {t("Cart")}
              </>
            )}
            <span className="tabular text-sm font-normal text-fg-subtle">
              {num(countItems(cart))}
            </span>
          </h2>
          {cart.length > 0 && (
            <button
              type="button"
              // While correcting an invoice this empties the LINES only: which
              // invoice it is, and whose, stay put.
              onClick={editing || picking ? () => setCart([]) : discardCart}
              className="cursor-pointer rounded-md px-1.5 py-0.5 text-sm text-fg-muted transition-colors duration-200 hover:bg-surface-sunken hover:text-fg"
            >
              {t("Clear")}
            </button>
          )}
        </div>

        {/* Who this sale is for; the handshake marks a partner (wholesale) sale */}
        {selectedClient && (
          <div
            className={`flex items-center gap-2 border-b px-3 py-2 text-sm border-line bg-brand-soft text-brand-soft-foreground`}
          >
            {isPartner ? (
              <Handshake className="h-4 w-4 shrink-0" />
            ) : (
              <UserRound className="h-4 w-4 shrink-0" />
            )}
            <span className="min-w-0 flex-1 truncate font-medium">
              {isPartner ? `${t("Partner")}: ` : ""}
              {selectedClient.name}
            </span>
          </div>
        )}

        <div className="max-h-72 min-h-24 flex-1 overflow-y-auto xl:max-h-none">
          {cart.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-fg-muted">
              {editing || picking
                ? t("No items. Add at least one.")
                : t("Tap a product or scan to start.")}
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {cart.map((l) => {
                const key = lineKey(l);
                const price = linePrice(l);
                const listPrice = lineListPrice(l);
                const negotiated =
                  !l.is_bonus && l.price !== null && l.price !== listPrice;
                const hasUnits = (l.product.units?.length ?? 0) > 0;
                return (
                  <li key={key} className="space-y-1.5 px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <p className="min-w-0 flex-1 truncate text-sm font-medium text-fg">
                        {l.product.name}
                        {l.is_bonus && (
                          <span className="ml-1.5 text-xs font-normal text-fg-subtle">
                            ({t("Free")})
                          </span>
                        )}
                      </p>
                      {!picking && (
                      <button
                        type="button"
                        title={l.is_bonus ? t("Charge") : t("Free")}
                        aria-label={l.is_bonus ? t("Charge") : t("Free")}
                        aria-pressed={l.is_bonus}
                        onClick={() => toggleBonus(key)}
                        className={`flex h-7 w-7 cursor-pointer items-center justify-center rounded-md transition-colors duration-200 ${
                          l.is_bonus
                            ? "bg-brand text-brand-soft dark:bg-brand-500 dark:text-brand-700"
                            : "text-fg-subtle hover:bg-surface-sunken hover:text-fg"
                        }`}
                      >
                        <Gift className="h-3.5 w-3.5" />
                      </button>
                      )}
                      <button
                        type="button"
                        aria-label={t("Remove")}
                        onClick={() => setQty(key, 0)}
                        className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-fg-subtle transition-colors duration-200 hover:bg-surface-sunken hover:text-fg"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {hasUnits && (
                        <Select
                          size="small"
                          className="!w-28 shrink-0"
                          value={l.unit?.id ?? 0}
                          onChange={(v) => changeUnit(key, v)}
                          options={[
                            { value: 0, label: l.product.base_unit || "pcs" },
                            ...(l.product.units ?? []).map((u) => ({
                              value: u.id,
                              label: u.name,
                            })),
                          ]}
                        />
                      )}
                      {l.is_bonus ? (
                        <span className="flex-1 text-xs text-fg-subtle">
                          {t("Free")}
                        </span>
                      ) : (
                        <InputNumber
                          size="small"
                          min={0}
                          step={0.25}
                          prefix="$"
                          className="!w-24"
                          aria-label={t("Price")}
                          // status={negotiated ? "warning" : undefined}
                          value={price}
                          onChange={(v) =>
                            setLinePrice(key, v === null ? null : Number(v))
                          }
                        />
                      )}
                      <div className="ml-auto flex items-center gap-1">
                        <button
                          type="button"
                          aria-label={t("Less")}
                          onClick={() => setQty(key, l.quantity - 1)}
                          className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border border-line text-fg-muted transition-colors duration-200 hover:bg-surface-sunken"
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <InputNumber
                          size="small"
                          min={0}
                          controls={false}
                          aria-label={t("Qty")}
                          className="min-w-12! py-0.5! [&_input]:text-center!"
                          value={l.quantity}
                          onChange={(v) => {
                            if (v !== null) setQty(key, Number(v));
                          }}
                        />
                        <button
                          type="button"
                          aria-label={t("More")}
                          onClick={() => setQty(key, l.quantity + 1)}
                          className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border border-line text-fg-muted transition-colors duration-200 hover:bg-surface-sunken"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                    <p className="tabular text-right text-xs text-fg-muted">
                      {l.is_bonus ? (
                        `${l.quantity} × ${t("Free")}`
                      ) : (
                        <>
                          {negotiated && (
                            <s className="mr-1 text-fg-subtle">
                              {money(listPrice)}
                            </s>
                          )}
                          {money(price)} × {l.quantity} ={" "}
                          {money(price * l.quantity)}
                        </>
                      )}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="space-y-2.5 border-t border-line p-3">
          {!picking && (
          <>
          <div className="flex gap-2">
            <Select
              className="flex-1"
              placeholder={t("Walk-in")}
              allowClear={!editing}
              // A corrected invoice keeps its client: the debt and history
              // already belong to that account.
              disabled={!!editing}
              showSearch
              optionFilterProp="label"
              value={clientId}
              onChange={(v) => setClientId(v ?? null)}
              options={clients.map((c) => ({
                value: c.id,
                label: c.phone ? `${c.name} (${c.phone})` : c.name,
                client: c,
              }))}
              optionRender={(opt) => {
                const c = (opt.data as { client: Client }).client;
                return (
                  <span className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate">{opt.label}</span>
                    {/* {c.client_type === "partner" && (
                      <span className="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
                        Partner
                      </span>
                    )} */}
                    {Number(c.outstanding) > 0 && (
                      <span className="tabular shrink-0 text-xs text-fg-subtle">
                        {t("Owes {amount}", { amount: money(c.outstanding) })}
                      </span>
                    )}
                  </span>
                );
              }}
            />
            {!editing && (
              <Button
                icon={<UserPlus className="h-4 w-4" />}
                onClick={() => setQuickClientOpen(true)}
                aria-label={t("New client")}
              />
            )}
          </div>

          <div className="flex items-center justify-between text-sm">
            <span className="text-fg-muted">{t("Discount %")}</span>
            <InputNumber
              min={0}
              max={100}
              value={discountPct}
              onChange={(v) => setDiscountPct(Number(v) || 0)}
              className="!w-24"
            />
          </div>
          </>
          )}

          <div className="space-y-1 text-sm">
            <div className="flex justify-between text-fg-muted">
              <span>{t("Subtotal")}</span>
              <span className="tabular">{money(subtotal)}</span>
            </div>
            {discountAmount > 0 && (
              <div className="flex justify-between text-fg-muted">
                <span>{t("Discount")}</span>
                <span className="tabular">-{money(discountAmount)}</span>
              </div>
            )}
            {taxRate > 0 && (
              <div className="flex justify-between text-fg-muted">
                <span>{t("Tax ({rate}%)", { rate: taxRate })}</span>
                <span className="tabular">{money(taxAmount)}</span>
              </div>
            )}
            <div className="flex items-baseline justify-between border-t border-line pt-1.5">
              <span className="text-base font-semibold text-fg">{t("Total")}</span>
              <span className="tabular text-2xl font-bold text-fg">
                {money(total)}
              </span>
            </div>
            {settings && (
              <div className="flex justify-between text-xs text-fg-subtle">
                <span>KHR</span>
                <span className="tabular">
                  {khr(total, settings.exchange_rate)}
                </span>
              </div>
            )}
          </div>

          {!picking &&
            selectedClient &&
            (Number(selectedClient.credit_balance) > 0 ||
              Number(selectedClient.outstanding) > 0) && (
              <p className="text-xs text-fg-subtle">
                {Number(selectedClient.credit_balance) > 0 &&
                  `${t("Prepaid")} ${money(selectedClient.credit_balance)}`}
                {Number(selectedClient.credit_balance) > 0 &&
                  Number(selectedClient.outstanding) > 0 &&
                  " · "}
                {Number(selectedClient.outstanding) > 0 &&
                  t("Owes {amount}", { amount: money(selectedClient.outstanding) })}
              </p>
            )}

          {/* A correction changes a bill the customer already has, so the
              figure that matters at the counter is the DIFFERENCE. */}
          {editing && (
            <div className="space-y-1.5 border-t border-line pt-2 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="text-fg-muted">{t("Old total")}</span>
                <span className="tabular text-fg-muted">
                  {money(editing.total)}
                </span>
              </div>
              {editWasSettled && editDiff !== 0 && (
                <div className="flex items-center justify-between gap-2 rounded-lg bg-surface-sunken px-2.5 py-1.5">
                  <span className="font-medium text-fg">
                    {editDiff > 0 ? t("Collect") : t("Give back")}
                  </span>
                  <span className="tabular font-semibold text-fg">
                    {money(Math.abs(editDiff))}
                  </span>
                </div>
              )}
              {!editWasSettled && editDiff !== 0 && (
                <p className="text-xs text-fg-subtle">
                  {t("Owing {amount}", {
                    amount: `${editDiff > 0 ? "+" : "-"}${money(Math.abs(editDiff))}`,
                  })}
                </p>
              )}
            </div>
          )}

          <Button
            type="primary"
            size="large"
            block
            disabled={cart.length === 0}
            loading={editing ? paying : false}
            onClick={picking ? confirmPick : editing ? saveInvoice : openPay}
          >
            {picking
              ? t("Confirm")
              : editing
                ? t("Save")
                : t("Charge {amount}", { amount: money(total) })}
          </Button>
          {!editing && !picking && lastSale && (
            <Button
              block
              icon={<Printer className="h-4 w-4" />}
              onClick={() => window.print()}
            >
              {t("Print receipt")}
            </Button>
          )}
        </div>
      </div>

      <BarcodeScanner
        open={scannerOpen}
        continuous
        onClose={() => setScannerOpen(false)}
        onScan={handleBarcode}
      />

      {/* ── Payment modal ── */}
      <Modal
        open={payOpen}
        onCancel={() => setPayOpen(false)}
        centered
        title={t("Payment")}
        okText={t("Confirm")}
        cancelText={t("Cancel")}
        onOk={checkout}
        confirmLoading={paying}
        okButtonProps={{
          disabled: owing > 0 && !clientId,
        }}
      >
        <div className="space-y-4 py-2">
          {/* Amount due + who is paying */}
          <div className="rounded-lg bg-surface-sunken p-3 text-center">
            <p className="mt-1.5 flex items-center justify-center gap-1.5 text-xs text-fg-muted">
              {selectedClient ? (
                  <span className="font-medium text-fg text-lg">
                    {selectedClient.name}
                  </span>
              ) : (
                t("Walk-in")
              )}
            </p>
            <div className="flex items-baseline justify-center gap-2">
              <p className="tabular text-2xl font-semibold text-fg">
                {money(total)}
              </p>
              {settings && (
                <p className="tabular text-lg text-fg-subtle">
                  ≈ {khr(total, settings.exchange_rate)}
                </p>
              )}
            </div>
          </div>

          {selectedClient && clientCredit > 0 && (
            <label className="flex cursor-pointer items-center justify-between rounded-lg border border-line px-3 py-2.5 transition-colors duration-200 hover:border-line-strong">
              <span className="text-sm text-fg">
                {t("Use prepaid")}
                <span className="tabular ml-1 text-fg-muted">
                  ({money(clientCredit)})
                </span>
              </span>
              <Switch
                checked={useCredit}
                onChange={(v) => {
                  setUseCredit(v);
                  // reseed the box with what is now due after credit
                  setPayAmount(
                    round2(total - (v ? Math.min(clientCredit, total) : 0)),
                  );
                }}
              />
            </label>
          )}

          {dueAfterCredit > 0 && (
            <>
              <Segmented
                block
                value={method}
                onChange={(v) => setMethod(v as PaymentMethod)}
                options={[
                  {
                    label: (
                      <span className="flex items-center justify-center gap-1.5">
                        <Banknote className="h-4 w-4" />
                        {t("Cash")}
                      </span>
                    ),
                    value: "cash",
                  },
                  {
                    label: (
                      <span className="flex items-center justify-center gap-1.5">
                        <QrCode className="h-4 w-4" />
                        KHQR
                      </span>
                    ),
                    value: "khqr",
                  },
                  {
                    label: (
                      <span className="flex items-center justify-center gap-1.5">
                        <CreditCard className="h-4 w-4" />
                        {t("Card")}
                      </span>
                    ),
                    value: "card",
                  },
                  {
                    label: (
                      <span className="flex items-center justify-center gap-1.5">
                        <Landmark className="h-4 w-4" />
                        {t("Bank")}
                      </span>
                    ),
                    value: "bank",
                  },
                ]}
              />
              <div>
                <div className="my-3 flex items-center justify-between">
                  <p className="text-sm text-fg-muted">{t("Pay now")}</p>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      className={chipCls(
                        payAmount !== null &&
                          round2(payAmount) === dueAfterCredit,
                      )}
                      onClick={() => setPayAmount(dueAfterCredit)}
                    >
                      {t("Full")}
                    </button>
                    <button
                      type="button"
                      className={chipCls(
                        payAmount !== null && round2(payAmount) === 0,
                      )}
                      onClick={() => setPayAmount(0)}
                    >
                      {t("Pay later")}
                    </button>
                  </div>
                </div>
                <InputNumber
                  size="large"
                  className="!w-full"
                  min={0}
                  max={dueAfterCredit}
                  prefix="$"
                  value={payAmount}
                  onChange={(v) => setPayAmount(v === null ? null : Number(v))}
                />
              </div>
            </>
          )}

          {/* What confirming will record */}
          <div className="space-y-1 rounded-lg border border-line p-3 text-sm">
            {creditApplied > 0 && (
              <div className="flex justify-between text-fg-muted">
                <span>{t("Prepaid used")}</span>
                <span className="tabular">-{money(creditApplied)}</span>
              </div>
            )}
            <div className="flex justify-between text-fg-muted">
              <span>{t("Pay now")}</span>
              <span className="tabular">{money(payingNow)}</span>
            </div>
            {owing > 0 && (
              <div className="flex justify-between font-medium text-fg">
                <span>{t("Owing")}</span>
                <span className="tabular">{money(owing)}</span>
              </div>
            )}
            <div className="flex items-center justify-between border-t border-line pt-1.5">
              <span className="text-fg-muted">{t("Status")}</span>
              <StatusBadge
                status={
                  owing <= 0
                    ? "paid"
                    : payingNow + creditApplied > 0
                      ? "partial"
                      : "unpaid"
                }
              />
            </div>
          </div>

          {owing > 0 && !clientId && (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/15 dark:text-rose-300">
              {t("Choose a client to sell on credit.")}
            </p>
          )}
        </div>
      </Modal>

      {/* ── Quick add client ── */}
      <Modal
        open={quickClientOpen}
        onCancel={() => setQuickClientOpen(false)}
        title={t("New client")}
        footer={null}
        destroyOnHidden
        centered
        width={420}
      >
        <Form
          layout="vertical"
          onFinish={quickCreateClient}
          requiredMark={false}
          initialValues={{ client_type: "normal" }}
        >
          <Form.Item
            label={t("Name")}
            name="name"
            rules={[{ required: true, message: t("Enter a name") }]}
          >
            <Input autoFocus />
          </Form.Item>
          <Form.Item label={t("Phone")} name="phone">
            <Input inputMode="tel" />
          </Form.Item>
          <Form.Item label={t("Type")} name="client_type">
            <Segmented
              block
              options={[
                { label: t("Normal"), value: "normal" },
                { label: t("Partner"), value: "partner" },
              ]}
            />
          </Form.Item>
          <Button type="primary" htmlType="submit" block>
            {t("Save")}
          </Button>
        </Form>
      </Modal>

      {/* Hidden, print-only */}
      <div className="hidden print:block">
        {lastSale && <Receipt sale={lastSale} settings={settings} />}
      </div>
    </div>
  );
}
