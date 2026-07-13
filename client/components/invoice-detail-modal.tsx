"use client";
import { useEffect, useState } from "react";
import { Modal, Popconfirm } from "antd";
import { Button } from "@/components/ui/button";
import { toast } from "react-toastify";
import {
  Ban, CalendarDays, CheckCircle2, CircleAlert, HandCoins, Printer,
  ReceiptText, UserRound, BadgeDollarSign, ShieldCheck,
} from "lucide-react";
import api, { apiError } from "@/services/api";
import { useAuth } from "@/hooks/useAuth";
import { useRealtime } from "@/hooks/useRealtime";
import { StatusBadge } from "@/components/ui/status-badge";
import { Spinner } from "@/components/ui/spinner";
import Receipt from "@/components/receipt";
import ReceivePaymentModal from "@/components/receive-payment-modal";
import { money, khr, fmtDate } from "@/lib/format";
import type { Sale, Settings } from "@/lib/types";

// Shared invoice detail modal. Fetches the full sale itself (pass just the id),
// and owns the receive-payment flow, voiding, printing and realtime refresh.
// Used from the invoices page and the client statement drawer.
export default function InvoiceDetailModal({
  saleId, onClose, onChanged,
}: {
  saleId: number | null;
  onClose: () => void;
  onChanged?: () => void; // parent lists re-fetch after a payment or void
}) {
  const { user } = useAuth();
  const canVoid = user?.role === "owner" || user?.role === "admin";
  const [sale, setSale] = useState<Sale | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [settings, setSettings] = useState<Settings | null>(null);

  useEffect(() => {
    api.get("/settings").then(({ data }) => setSettings(data)).catch(() => {});
  }, []);

  useEffect(() => {
    setSale(null);
    setPayOpen(false);
    if (!saleId) return;
    api
      .get(`/sales/${saleId}`)
      .then(({ data }) => setSale(data))
      .catch((err) => {
        toast.error(apiError(err));
        onClose();
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saleId]);

  // Keep the open invoice fresh if another device receives a payment or voids it
  useRealtime(["sale:updated", "sale:voided"], (_event, payload) => {
    const updated = payload as Sale;
    if (saleId && updated?.id === saleId) setSale(updated);
  });

  const voidSale = async () => {
    if (!sale) return;
    try {
      const { data } = await api.post(`/sales/${sale.id}/void`);
      toast.success(`${sale.invoice_number} voided, stock restored`);
      setSale(data);
      onChanged?.();
    } catch (err) {
      toast.error(apiError(err));
    }
  };

  const balance = sale ? Math.round((Number(sale.total) - Number(sale.amount_paid)) * 100) / 100 : 0;
  const voided = sale?.status === "voided";

  return (
    <>
      <Modal
        open={!!saleId}
        onCancel={onClose}
        centered
        width={640}
        title={
          <span className="flex items-center gap-2">
            <ReceiptText className="h-4.5 w-4.5 text-fg-muted" />
            <span className="font-mono text-sm">{sale?.invoice_number ?? "Invoice"}</span>
            {sale && <StatusBadge status={sale.status} />}
          </span>
        }
        footer={
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              {sale && canVoid && !voided && (
                <Popconfirm
                  title="Void this invoice?"
                  description="Stock is restored and received money is marked refunded. This cannot be undone."
                  okText="Void invoice"
                  okButtonProps={{ danger: true }}
                  onConfirm={voidSale}
                >
                  <Button danger icon={<Ban className="h-4 w-4" />}>Void</Button>
                </Popconfirm>
              )}
            </div>
            <div className="flex gap-2">
              {sale && (
                <Button icon={<Printer className="h-4 w-4" />} onClick={() => window.print()}>
                  Print receipt
                </Button>
              )}
              <Button onClick={onClose}>Close</Button>
            </div>
          </div>
        }
      >
        {!sale ? (
          <div className="flex justify-center py-16">
            <Spinner className="h-7 w-7" />
          </div>
        ) : (
          <div className="max-h-[65vh] space-y-4 overflow-y-auto pt-1 text-sm">
            {/* What matters first: is this invoice settled? */}
            {voided ? (
              <div className="flex items-start gap-3 rounded-xl border border-line bg-surface-sunken p-3.5">
                <Ban className="mt-0.5 h-5 w-5 shrink-0 text-fg-subtle" />
                <div>
                  <p className="font-semibold text-fg">This invoice was voided</p>
                  <p className="mt-0.5 text-xs text-fg-muted">
                    {fmtDate(sale.voided_at ?? "")}{sale.voided_by ? ` by ${sale.voided_by}` : ""}. Stock was
                    returned and any money received was refunded.
                  </p>
                </div>
              </div>
            ) : balance <= 0 ? (
              <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 dark:border-emerald-500/30 dark:bg-emerald-500/10">
                <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <div>
                  <p className="font-semibold text-emerald-700 dark:text-emerald-300">Paid in full</p>
                  <p className="text-xs text-emerald-700/80 dark:text-emerald-300/80">
                    {money(sale.amount_paid)} received. Nothing left to collect.
                  </p>
                </div>
              </div>
            ) : (
              <div
                className={`flex flex-wrap items-center gap-3 rounded-xl border p-3.5 ${
                  sale.status === "partial"
                    ? "border-amber-200 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10"
                    : "border-rose-200 bg-rose-50 dark:border-rose-500/30 dark:bg-rose-500/10"
                }`}
              >
                <CircleAlert
                  className={`h-6 w-6 shrink-0 ${
                    sale.status === "partial"
                      ? "text-amber-600 dark:text-amber-400"
                      : "text-rose-600 dark:text-rose-400"
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <p
                    className={`font-semibold ${
                      sale.status === "partial"
                        ? "text-amber-700 dark:text-amber-300"
                        : "text-rose-700 dark:text-rose-300"
                    }`}
                  >
                    <span className="tabular">{money(balance)}</span> still to collect
                  </p>
                  <p className="text-xs text-fg-muted">
                    Paid {money(sale.amount_paid)} of {money(sale.total)} so far.
                  </p>
                </div>
                <Button type="primary" icon={<HandCoins className="h-4 w-4" />} onClick={() => setPayOpen(true)}>
                  Receive payment
                </Button>
              </div>
            )}

            {/* Who, when, how */}
            <div className="grid grid-cols-2 gap-x-3 gap-y-3 rounded-xl bg-surface-sunken p-3.5">
              <MetaItem icon={<CalendarDays className="h-4 w-4" />} label="Date" value={fmtDate(sale.created_at)} />
              <MetaItem
                icon={<UserRound className="h-4 w-4" />}
                label="Client"
                value={sale.client_name || "Walk-in"}
                muted={!sale.client_name}
              />
              <MetaItem icon={<ShieldCheck className="h-4 w-4" />} label="Cashier" value={sale.cashier_name || ""} />
              <MetaItem
                icon={<BadgeDollarSign className="h-4 w-4" />}
                label="Payment method"
                value={sale.payment_method.toUpperCase()}
              />
            </div>

            {/* Items */}
            <div>
              <h3 className="mb-2 font-medium text-fg">
                Items <span className="text-xs font-normal text-fg-subtle">({sale.items?.length ?? 0})</span>
              </h3>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-line text-left text-xs uppercase text-fg-subtle">
                    <th className="pb-2 font-medium">Item</th>
                    <th className="pb-2 text-center font-medium">Qty</th>
                    <th className="pb-2 text-left font-medium">Unit</th>
                    <th className="pb-2 text-right font-medium">Price</th>
                    <th className="pb-2 text-right font-medium">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {sale.items?.map((it) => (
                    <tr key={it.id}>
                      <td className="py-2 text-fg">
                        {it.name_snapshot}
                        {!!it.is_bonus && (
                          <span className="ml-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
                            Free
                          </span>
                        )}
                        {it.discount_pct > 0 && !it.is_bonus && (
                          <span className="ml-1 text-xs text-rose-500">-{it.discount_pct}%</span>
                        )}
                      </td>
                      <td className="tabular py-2 text-center text-fg-muted">{it.quantity}</td>
                      <td className="py-2 text-fg-muted">
                        {it.unit_name ?? "Piece"}
                        {it.unit_factor > 1 && (
                          <span className="ml-1 text-xs text-fg-subtle">= {it.quantity * it.unit_factor} pcs</span>
                        )}
                      </td>
                      <td className="tabular py-2 text-right text-fg-muted">{it.is_bonus ? "FREE" : money(it.price)}</td>
                      <td className="tabular py-2 text-right font-medium text-fg">
                        {it.is_bonus ? "FREE" : money(it.line_total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Money summary */}
            <div className="space-y-1 rounded-xl bg-surface-sunken p-3.5">
              <div className="flex justify-between text-fg-muted">
                <span>Subtotal</span><span className="tabular">{money(sale.subtotal)}</span>
              </div>
              {Number(sale.discount_amount) > 0 && (
                <div className="flex justify-between text-fg-muted">
                  <span>Discount ({sale.discount_pct}%)</span>
                  <span className="tabular">-{money(sale.discount_amount)}</span>
                </div>
              )}
              {Number(sale.tax_amount) > 0 && (
                <div className="flex justify-between text-fg-muted">
                  <span>Tax ({sale.tax_rate}%)</span><span className="tabular">{money(sale.tax_amount)}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-line pt-1.5 text-base font-semibold text-fg">
                <span>Total</span><span className="tabular">{money(sale.total)}</span>
              </div>
              <p className="tabular text-right text-xs text-fg-subtle">≈ {khr(Number(sale.total), sale.exchange_rate)}</p>
              {sale.amount_received !== null && (
                <>
                  <div className="flex justify-between text-fg-muted">
                    <span>Received</span><span className="tabular">{money(sale.amount_received)}</span>
                  </div>
                  <div className="flex justify-between text-fg-muted">
                    <span>Change</span><span className="tabular">{money(sale.change_due)}</span>
                  </div>
                </>
              )}
              {!voided && (
                <>
                  <div className="flex justify-between text-fg-muted">
                    <span>Paid</span>
                    <span className="tabular text-emerald-600 dark:text-emerald-400">{money(sale.amount_paid)}</span>
                  </div>
                  {balance > 0 && (
                    <div className="flex justify-between font-medium">
                      <span className="text-fg">Balance due</span>
                      <span className="tabular text-rose-600 dark:text-rose-400">{money(balance)}</span>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Payment history */}
            {(sale.payments?.length ?? 0) > 0 && (
              <div>
                <h3 className="mb-2 flex items-baseline justify-between font-medium text-fg">
                  Payments
                  <span className="text-xs font-normal text-fg-subtle">latest first</span>
                </h3>
                <ul className="divide-y divide-line rounded-xl border border-line px-3">
                  {/* Server returns the ledger oldest-first; show newest on top */}
                  {[...(sale.payments ?? [])].sort((a, b) => b.id - a.id).map((p) => (
                    <li key={p.id} className="flex items-center justify-between py-2.5">
                      <div>
                        <p className="text-fg">
                          <StatusBadge status={p.type === "refund" ? "refund" : p.method} />
                          {p.received_by && <span className="ml-2 text-xs text-fg-subtle">by {p.received_by}</span>}
                        </p>
                        <p className="mt-0.5 text-xs text-fg-subtle">
                          {fmtDate(p.created_at)}{p.note ? `, ${p.note}` : ""}
                        </p>
                      </div>
                      <span
                        className={`tabular font-medium ${
                          Number(p.amount) < 0 ? "text-rose-600 dark:text-rose-400" : "text-fg"
                        }`}
                      >
                        {money(p.amount)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {sale.note && <p className="rounded-xl bg-surface-sunken p-3.5 text-fg-muted">{sale.note}</p>}
          </div>
        )}
      </Modal>

      <ReceivePaymentModal
        sale={payOpen ? sale : null}
        onClose={() => setPayOpen(false)}
        onDone={(updated) => {
          setSale(updated);
          onChanged?.();
        }}
      />

      <div className="hidden print:block">
        {sale && <Receipt sale={sale} settings={settings} />}
      </div>
    </>
  );
}

function MetaItem({
  icon, label, value, muted,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 text-fg-subtle">{icon}</span>
      <div className="min-w-0">
        <p className="text-xs text-fg-subtle">{label}</p>
        <p className={`truncate font-medium ${muted ? "text-fg-subtle" : "text-fg"}`}>{value}</p>
      </div>
    </div>
  );
}
