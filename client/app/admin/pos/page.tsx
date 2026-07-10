"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import {
  Button, Input, InputNumber, Modal, Select, Segmented, Form,
} from "antd";
import { toast } from "react-toastify";
import {
  ScanBarcode, Search, Minus, Plus, Trash2, ShoppingCart, Printer,
  PackageOpen, UserPlus,
} from "lucide-react";
import api, { apiError } from "@/services/api";
import { playScanBeep, playScanError } from "@/lib/sound";
import { useRealtime } from "@/hooks/useRealtime";
import BarcodeScanner from "@/components/barcode-scanner";
import Receipt from "@/components/receipt";
import { EmptyState } from "@/components/ui/empty-state";
import { money, khr, unitPrice } from "@/lib/format";
import type { Product, Category, Client, CartLine, Sale, Settings, PaymentMethod } from "@/lib/types";

export default function PosPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [clientId, setClientId] = useState<number | null>(null);
  const [discountPct, setDiscountPct] = useState(0);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [paying, setPaying] = useState(false);
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [received, setReceived] = useState<number | null>(null);
  const [lastSale, setLastSale] = useState<Sale | null>(null);
  const [quickClientOpen, setQuickClientOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const loadProducts = useCallback(() => {
    api.get("/products", { params: { active: 1 } }).then(({ data }) => setProducts(data)).catch(() => {});
  }, []);
  const loadClients = useCallback(() => {
    api.get("/clients").then(({ data }) => setClients(data)).catch(() => {});
  }, []);

  useEffect(() => {
    loadProducts();
    loadClients();
    api.get("/categories").then(({ data }) => setCategories(data)).catch(() => {});
    api.get("/settings").then(({ data }) => setSettings(data)).catch(() => {});
  }, [loadProducts, loadClients]);

  useRealtime(["product:changed"], loadProducts);
  useRealtime(["client:changed"], loadClients);
  useRealtime(["settings:changed"], (_e, payload) => setSettings(payload as Settings));

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter(
      (p) =>
        (!categoryId || p.category_id === categoryId) &&
        (!q || p.name.toLowerCase().includes(q) || p.barcode?.includes(q) || p.sku?.toLowerCase().includes(q))
    );
  }, [products, search, categoryId]);

  const addToCart = useCallback((product: Product, silent = false) => {
    setCart((prev) => {
      const line = prev.find((l) => l.product.id === product.id);
      const inCart = line?.quantity ?? 0;
      if (inCart + 1 > product.stock_qty) {
        playScanError();
        toast.warn(`Only ${product.stock_qty} in stock for "${product.name}"`);
        return prev;
      }
      if (!silent) toast.success(`${product.name} added`, { autoClose: 900 });
      return line
        ? prev.map((l) => (l.product.id === product.id ? { ...l, quantity: l.quantity + 1 } : l))
        : [...prev, { product, quantity: 1 }];
    });
  }, []);

  // Barcode entry point for camera scans. Sound is the only feedback:
  // the scanner already beeped on the read, a buzz means "no such product".
  const handleBarcode = useCallback(
    async (code: string) => {
      const local = products.find((p) => p.barcode === code);
      if (local) {
        addToCart(local, true);
        return;
      }
      try {
        const { data } = await api.get(`/products/barcode/${encodeURIComponent(code)}`);
        addToCart(data, true);
      } catch {
        playScanError();
      }
    },
    [products, addToCart]
  );

  // USB scanners "type" the code then send Enter. Beep on hit, buzz on an
  // unknown code — no toasts, the cashier hears the result without looking.
  const onSearchEnter = () => {
    const code = search.trim();
    if (!code) return;
    const exact = products.find((p) => p.barcode === code);
    if (exact) {
      playScanBeep();
      addToCart(exact, true);
      setSearch("");
    } else if (filtered.length === 1) {
      playScanBeep();
      addToCart(filtered[0], true);
      setSearch("");
    } else if (filtered.length === 0) {
      playScanError();
    }
  };

  const setQty = (productId: number, qty: number) => {
    setCart((prev) =>
      prev
        .map((l) => {
          if (l.product.id !== productId) return l;
          const capped = Math.min(Math.max(qty, 0), l.product.stock_qty);
          if (qty > l.product.stock_qty) toast.warn(`Only ${l.product.stock_qty} in stock`);
          return { ...l, quantity: capped };
        })
        .filter((l) => l.quantity > 0)
    );
  };

  const subtotal = cart.reduce(
    (sum, l) => sum + unitPrice(l.product.sell_price, l.product.discount_pct) * l.quantity, 0
  );
  const discountAmount = subtotal * (discountPct / 100);
  const taxRate = Number(settings?.tax_rate) || 0;
  const taxAmount = (subtotal - discountAmount) * (taxRate / 100);
  const total = Math.round((subtotal - discountAmount + taxAmount) * 100) / 100;
  const change = received !== null ? received - total : null;

  const checkout = async () => {
    setPaying(true);
    try {
      const { data } = await api.post("/sales", {
        items: cart.map((l) => ({ product_id: l.product.id, quantity: l.quantity })),
        client_id: clientId,
        discount_pct: discountPct,
        payment_method: method,
        amount_received: method === "cash" ? received : null,
      });
      setLastSale(data);
      setCart([]);
      setClientId(null);
      setDiscountPct(0);
      setReceived(null);
      setMethod("cash");
      setPayOpen(false);
      toast.success(`Sale ${data.invoice_number} completed`);
    } catch (err) {
      toast.error(apiError(err, "Could not complete the sale"));
      loadProducts();
    } finally {
      setPaying(false);
    }
  };

  const quickCreateClient = async (values: { name: string; phone?: string }) => {
    try {
      const { data } = await api.post("/clients", values);
      await loadClients();
      setClientId(data.id);
      setQuickClientOpen(false);
      toast.success("Client created");
    } catch (err) {
      toast.error(apiError(err));
    }
  };

  return (
    <div className="flex flex-col gap-4 xl:h-[calc(100vh-8.5rem)] xl:flex-row">
      {/* ── Product picker ── */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="mb-3 flex gap-2">
          <Input
            ref={searchRef as never}
            size="large"
            allowClear
            prefix={<Search className="h-4 w-4 text-fg-subtle" />}
            placeholder="Search name, barcode or SKU. Scanner guns work here too"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onPressEnter={onSearchEnter}
          />
          <Button size="large" icon={<ScanBarcode className="h-4.5 w-4.5" />} onClick={() => setScannerOpen(true)}>
            <span className="hidden sm:inline">Scan</span>
          </Button>
        </div>

        <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1">
          {[{ id: null, name: "All" }, ...categories].map((c) => (
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
            <EmptyState icon={PackageOpen} title="No products found"
              description="Try a different search, or add products in Inventory." />
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
              {filtered.map((p) => {
                const price = unitPrice(p.sell_price, p.discount_pct);
                const out = p.stock_qty <= 0;
                return (
                  <button
                    key={p.id}
                    type="button"
                    disabled={out}
                    onClick={() => addToCart(p, true)}
                    className={`group overflow-hidden rounded-xl border border-line bg-surface-raised text-left shadow-card transition-colors duration-200 ${
                      out ? "opacity-50" : "cursor-pointer hover:border-brand"
                    }`}
                  >
                    <div className="relative aspect-square w-full bg-surface-sunken">
                      {p.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.image_url} alt={p.name} loading="lazy"
                          className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full items-center justify-center">
                          <PackageOpen className="h-8 w-8 text-fg-subtle" />
                        </div>
                      )}
                      {p.discount_pct > 0 && (
                        <span className="absolute left-2 top-2 rounded-full bg-rose-600 px-2 py-0.5 text-xs font-medium text-white">
                          -{p.discount_pct}%
                        </span>
                      )}
                      {out && (
                        <span className="absolute inset-x-0 bottom-0 bg-black/60 py-1 text-center text-xs text-white">
                          Out of stock
                        </span>
                      )}
                    </div>
                    <div className="p-2.5">
                      <p className="truncate text-sm font-medium text-fg">{p.name}</p>
                      <div className="mt-1 flex items-center justify-between">
                        <span className="tabular text-sm font-semibold text-brand dark:text-brand-soft-foreground">
                          {money(price)}
                        </span>
                        <span className="text-xs text-fg-subtle">{p.stock_qty} left</span>
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
      <div className="flex w-full flex-col rounded-xl border border-line bg-surface-raised shadow-card xl:w-96">
        <div className="flex items-center justify-between border-b border-line p-3">
          <h2 className="flex items-center gap-2 font-medium text-fg">
            <ShoppingCart className="h-4.5 w-4.5" /> Cart
            <span className="rounded-full bg-brand-soft px-2 py-0.5 text-xs font-medium text-brand-soft-foreground">
              {cart.reduce((n, l) => n + l.quantity, 0)}
            </span>
          </h2>
          {cart.length > 0 && (
            <button type="button" onClick={() => setCart([])}
              className="cursor-pointer text-sm text-rose-600 transition-colors duration-200 hover:text-rose-700 dark:text-rose-400">
              Clear
            </button>
          )}
        </div>

        <div className="max-h-72 min-h-24 flex-1 overflow-y-auto xl:max-h-none">
          {cart.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-fg-muted">
              Tap a product or scan a barcode to start a sale.
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {cart.map((l) => {
                const price = unitPrice(l.product.sell_price, l.product.discount_pct);
                return (
                  <li key={l.product.id} className="flex items-center gap-2 px-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-fg">{l.product.name}</p>
                      <p className="tabular text-xs text-fg-muted">
                        {money(price)} × {l.quantity} = {money(price * l.quantity)}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button type="button" aria-label="Decrease quantity"
                        onClick={() => setQty(l.product.id, l.quantity - 1)}
                        className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border border-line text-fg-muted transition-colors duration-200 hover:bg-surface-sunken">
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <span className="tabular w-7 text-center text-sm font-medium text-fg">{l.quantity}</span>
                      <button type="button" aria-label="Increase quantity"
                        onClick={() => setQty(l.product.id, l.quantity + 1)}
                        className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border border-line text-fg-muted transition-colors duration-200 hover:bg-surface-sunken">
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" aria-label="Remove item"
                        onClick={() => setQty(l.product.id, 0)}
                        className="ml-1 flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-rose-500 transition-colors duration-200 hover:bg-rose-50 dark:hover:bg-rose-500/10">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="space-y-2.5 border-t border-line p-3">
          <div className="flex gap-2">
            <Select
              className="flex-1"
              placeholder="Walk-in customer"
              allowClear
              showSearch
              optionFilterProp="label"
              value={clientId}
              onChange={(v) => setClientId(v ?? null)}
              options={clients.map((c) => ({
                value: c.id,
                label: c.phone ? `${c.name} (${c.phone})` : c.name,
              }))}
            />
            <Button icon={<UserPlus className="h-4 w-4" />} onClick={() => setQuickClientOpen(true)}
              aria-label="Quick add client" />
          </div>

          <div className="flex items-center justify-between text-sm">
            <span className="text-fg-muted">Discount %</span>
            <InputNumber min={0} max={100} value={discountPct}
              onChange={(v) => setDiscountPct(Number(v) || 0)} className="!w-24" />
          </div>

          <div className="space-y-1 text-sm">
            <div className="flex justify-between text-fg-muted">
              <span>Subtotal</span><span className="tabular">{money(subtotal)}</span>
            </div>
            {discountAmount > 0 && (
              <div className="flex justify-between text-fg-muted">
                <span>Discount</span><span className="tabular">-{money(discountAmount)}</span>
              </div>
            )}
            {taxRate > 0 && (
              <div className="flex justify-between text-fg-muted">
                <span>Tax ({taxRate}%)</span><span className="tabular">{money(taxAmount)}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-line pt-1.5 text-base font-semibold text-fg">
              <span>Total</span>
              <span className="tabular">{money(total)}</span>
            </div>
            {settings && (
              <div className="flex justify-between text-xs text-fg-subtle">
                <span>KHR</span><span className="tabular">{khr(total, settings.exchange_rate)}</span>
              </div>
            )}
          </div>

          <Button type="primary" size="large" block disabled={cart.length === 0}
            onClick={() => { setReceived(null); setPayOpen(true); }}>
            Charge {money(total)}
          </Button>
          {lastSale && (
            <Button block icon={<Printer className="h-4 w-4" />} onClick={() => window.print()}>
              Print last receipt ({lastSale.invoice_number})
            </Button>
          )}
        </div>
      </div>

      <BarcodeScanner open={scannerOpen} continuous onClose={() => setScannerOpen(false)} onScan={handleBarcode} />

      {/* ── Payment modal ── */}
      <Modal
        open={payOpen}
        onCancel={() => setPayOpen(false)}
        title="Take payment"
        okText={`Confirm ${money(total)}`}
        onOk={checkout}
        confirmLoading={paying}
        okButtonProps={{ disabled: method === "cash" && received !== null && received < total }}
      >
        <div className="space-y-4 py-2">
          <div className="rounded-lg bg-surface-sunken p-3 text-center">
            <p className="text-sm text-fg-muted">Amount due</p>
            <p className="tabular text-3xl font-semibold text-fg">{money(total)}</p>
            {settings && <p className="tabular text-sm text-fg-subtle">{khr(total, settings.exchange_rate)}</p>}
          </div>
          <Segmented
            block
            value={method}
            onChange={(v) => setMethod(v as PaymentMethod)}
            options={[
              { label: "Cash", value: "cash" },
              { label: "KHQR", value: "khqr" },
              { label: "Card", value: "card" },
              { label: "Bank", value: "bank" },
            ]}
          />
          {method === "cash" && (
            <div>
              <p className="mb-1 text-sm text-fg-muted">Cash received</p>
              <InputNumber
                autoFocus size="large" className="!w-full" min={0} prefix="$"
                value={received} onChange={(v) => setReceived(v === null ? null : Number(v))}
              />
              {change !== null && change >= 0 && (
                <p className="tabular mt-2 text-sm text-emerald-600 dark:text-emerald-400">
                  Change: {money(change)} {settings ? `(${khr(change, settings.exchange_rate)})` : ""}
                </p>
              )}
              {change !== null && change < 0 && (
                <p className="tabular mt-2 text-sm text-rose-600 dark:text-rose-400">
                  Missing {money(Math.abs(change))}
                </p>
              )}
            </div>
          )}
        </div>
      </Modal>

      {/* ── Quick add client ── */}
      <Modal open={quickClientOpen} onCancel={() => setQuickClientOpen(false)} title="Quick add client" footer={null} destroyOnHidden>
        <Form layout="vertical" onFinish={quickCreateClient} requiredMark={false}>
          <Form.Item label="Name" name="name" rules={[{ required: true, message: "Client name is required" }]}>
            <Input placeholder="Client name" />
          </Form.Item>
          <Form.Item label="Phone" name="phone">
            <Input placeholder="Phone number" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block>Create and select</Button>
        </Form>
      </Modal>

      {/* Hidden, print-only */}
      <div className="hidden print:block">
        {lastSale && <Receipt sale={lastSale} settings={settings} />}
      </div>
    </div>
  );
}
