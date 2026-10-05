"use client";
import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Modal, Popconfirm, Tooltip } from "antd";
import { Button } from "@/components/ui/button";
import { toast } from "react-toastify";
import {
  Ban,
  CalendarDays,
  CircleAlert,
  HandCoins,
  ReceiptText,
  UserRound,
  BadgeDollarSign,
  ShieldCheck,
  FileText,
  Trash2,
  FilePen,
  Gift,
} from "lucide-react";
import api, { apiError } from "@/services/api";
import { useAuth } from "@/hooks/useAuth";
import { useRealtime } from "@/hooks/useRealtime";
import { StatusBadge, useStatusLabel } from "@/components/ui/status-badge";
import { Spinner } from "@/components/ui/spinner";
import Receipt from "@/components/receipt";
import InvoicePaperModal from "@/components/invoice-template/invoice-paper-modal";
import ReceivePaymentModal from "@/components/receive-payment-modal";
import { startInvoiceEdit } from "@/lib/pos-cart";
import { money, khr, num, fmtDate } from "@/lib/format";
import type { Sale, Settings } from "@/lib/types";
import { useT } from "@/lib/i18n";

// Shared invoice detail modal (same layout as nc-tax). Fetches the full sale
// itself (pass just the id), and owns the receive-payment flow, voiding,
// editing at the POS, marking for a partner bonus, the A4 invoice paper and
// realtime refresh. Used from the invoices page and the client details page.
export default function InvoiceDetailModal({
  saleId,
  onClose,
  onChanged,
}: {
  saleId: number | null;
  onClose: () => void;
  onChanged?: () => void; // parent lists re-fetch after a payment or void
}) {
  const { user } = useAuth();
  const { t } = useT();
  const statusLabel = useStatusLabel();
  const router = useRouter();
  const pathname = usePathname();
  const canVoid = user?.role === "owner" || user?.role === "admin";
  const canDelete = user?.role === "owner"; // deleting a voided invoice is owner-only
  const [sale, setSale] = useState<Sale | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [marking, setMarking] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  // The paper keeps its own copy of the id: the detail modal closes behind it,
  // which clears `sale`, so the paper cannot read the invoice from there.
  const [paperId, setPaperId] = useState<number | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);

  useEffect(() => {
    api
      .get("/settings")
      .then(({ data }) => setSettings(data))
      .catch(() => {});
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
    const updated = payload as Sale & { deleted?: boolean };
    if (!saleId || updated?.id !== saleId) return;
    // Another device deleted this invoice while it was open here: close it.
    if (updated.deleted) onClose();
    else setSale(updated);
  });

  const voidSale = async () => {
    if (!sale) return;
    try {
      const { data } = await api.post(`/sales/${sale.id}/void`);
      toast.success(t("Refunded"));
      setSale(data);
      onChanged?.();
    } catch (err) {
      toast.error(apiError(err));
    }
  };

  // Paid from prepaid balance: the server refuses to edit it (refunding part
  // of a prepaid spend belongs to the client's account), so say so here
  // instead of after the whole correction has been typed in.
  const paidByCredit = !!sale?.payments?.some(
    (p) => p.method === "credit" && Number(p.amount) > 0,
  );

  const openEditInvoice = () => {
    if (!sale) return;
    if (paidByCredit) {
      toast.error(t("Paid with prepaid, so it cannot be edited. Refund it and sell again."));
      return;
    }
    if (!startInvoiceEdit(sale, pathname)) {
      toast.error(t("Could not open for editing"));
      return;
    }
    onClose();
    router.push("/admin/pos");
  };

  const toggleBonusMark = async () => {
    if (!sale) return;
    const marked = !sale.bonus_marked_at;
    setMarking(true);
    try {
      const { data } = await api.put(`/sales/${sale.id}/bonus-mark`, {
        marked,
      });
      setSale(data);
      toast.success(marked ? t("Marked for bonus") : t("Unmarked"));
      onChanged?.();
    } catch (err) {
      toast.error(apiError(err));
    } finally {
      setMarking(false);
    }
  };

  const deleteSaleRow = async () => {
    if (!sale) return;
    setDeleting(true);
    try {
      await api.delete(`/sales/${sale.id}`);
      toast.success(t("Deleted"));
      onChanged?.();
      onClose();
    } catch (err) {
      toast.error(apiError(err));
    } finally {
      setDeleting(false);
    }
  };

  const balance = sale
    ? Math.round((Number(sale.total) - Number(sale.amount_paid)) * 100) / 100
    : 0;
  const voided = sale?.status === "voided";
  // Bonuses are for partner clients and are manager-only, like the Bonus page
  const canMarkBonus =
    !!sale && canVoid && !voided && sale.client_type === "partner";

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
            <span className="font-mono text-sm">
              {sale?.invoice_number ?? t("Invoice")}
            </span>
            {sale && <StatusBadge status={sale.status} />}
          </span>
        }
        footer={
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              {sale && canVoid && !voided && (
                <Popconfirm
                  title={t("Refund this invoice?")}
                  okText={t("Refund")}
                  cancelText={t("Cancel")}
                  okButtonProps={{ danger: true }}
                  onConfirm={voidSale}
                >
                  <Button danger icon={<Ban className="h-4 w-4" />}>
                    {t("Refund")}
                  </Button>
                </Popconfirm>
              )}
              {sale && canDelete && voided && (
                <Popconfirm
                  title={t("Delete this invoice?")}
                  okText={t("Delete")}
                  cancelText={t("Cancel")}
                  okButtonProps={{ danger: true }}
                  onConfirm={deleteSaleRow}
                >
                  <Button
                    danger
                    loading={deleting}
                    icon={<Trash2 className="h-4 w-4" />}
                  >
                    {t("Delete")}
                  </Button>
                </Popconfirm>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {/* Partner bonus mark: a small toggle in Close's place (the
                  header X still closes). Marked invoices wait, already
                  ticked, on the client's Bonus page. */}
              {canMarkBonus ? (
                <Tooltip
                  title={
                    sale.bonus_marked_at
                      ? `${fmtDate(sale.bonus_marked_at)}${sale.bonus_marked_by ? ` · ${sale.bonus_marked_by}` : ""}`
                      : t("Mark for bonus")
                  }
                >
                  <Button
                    loading={marking}
                    aria-pressed={!!sale.bonus_marked_at}
                    aria-label={t("Mark for bonus")}
                    icon={<Gift className="h-4 w-4" />}
                    onClick={toggleBonusMark}
                    className={
                      sale.bonus_marked_at
                        ? "border-brand! bg-brand-soft! text-brand-soft-foreground!"
                        : undefined
                    }
                  >
                    {sale.bonus_marked_at ? t("Marked") : t("Bonus")}
                  </Button>
                </Tooltip>
              ) : (
                <Button onClick={onClose}>{t("Close")}</Button>
              )}
              {/* A wrong invoice is corrected rather than thrown away: same
                  number, rewritten at the POS. Voided invoices are excluded,
                  they are already cancelled. */}
              {sale && canVoid && !voided && (
                <Button
                  icon={<FilePen className="h-4 w-4" />}
                  onClick={openEditInvoice}
                >
                  {t("Edit")}
                </Button>
              )}
              {sale && !voided && (
                <Button
                  variant="solid"
                  icon={<FileText className="h-4 w-4" />}
                  onClick={() => {
                    setPaperId(sale.id);
                    onClose();
                  }}
                >
                  {t("Invoice")}
                </Button>
              )}
            </div>
          </div>
        }
      >
        {!sale ? (
          <div className="flex justify-center py-16">
            <Spinner className="h-7 w-7" />
          </div>
        ) : (
          <div className="max-h-[65vh] space-y-4 overflow-y-auto pt-1 pr-1.5 text-sm">
            {/* What matters first: is this invoice settled? One neutral strip;
                only the amount still owed carries color. */}
            {balance !== 0 && (
              <div className="flex flex-wrap items-center gap-3 rounded-xl bg-surface-sunken/50 p-3.5">
                {voided ? (
                  <Ban className="h-5 w-5 shrink-0 text-fg-subtle" />
                ) : (
                  balance > 0 && (
                    <CircleAlert className="h-5 w-5 shrink-0 text-fg-muted" />
                  )
                )}
                <div className="min-w-0 flex-1">
                  {voided ? (
                    <>
                      <p className="font-semibold text-fg">{t("Refunded")}</p>
                      <p className="mt-0.5 text-xs text-fg-muted">
                        {fmtDate(sale.voided_at ?? "")}
                        {sale.voided_by ? ` · ${sale.voided_by}` : ""}
                      </p>
                    </>
                  ) : (
                    balance > 0 && (
                      <p className="font-semibold text-fg">
                        {t("Owing")}{" "}
                        <span className="tabular text-rose-600 dark:text-rose-400">
                          {money(balance)}
                        </span>
                      </p>
                    )
                  )}
                </div>
                {!voided && balance > 0 && (
                  <Button
                    type="primary"
                    icon={<HandCoins className="h-4 w-4" />}
                    onClick={() => setPayOpen(true)}
                  >
                    {t("Pay")}
                  </Button>
                )}
              </div>
            )}

            {/* Who, when, how */}
            <div className="grid grid-cols-2 gap-x-3 gap-y-3 rounded-xl bg-surface-sunken/50 p-3.5">
              <MetaItem
                // icon={<CalendarDays className="h-4 w-4" />}
                label={t("Date")}
                value={fmtDate(sale.created_at)}
              />
              <MetaItem
                // icon={<UserRound className="h-4 w-4" />}
                label={t("Client")}
                value={[
                  sale.client_name || t("Walk-in"),
                  sale.client_phone,
                  sale.client_address,
                ]
                  .filter(Boolean)
                  .join(" · ")}
                muted={!sale.client_name}
              />
              <MetaItem
                // icon={<ShieldCheck className="h-4 w-4" />}
                label={t("Cashier")}
                value={sale.cashier_name || ""}
              />
              <MetaItem
                // icon={<BadgeDollarSign className="h-4 w-4" />}
                label={t("Method")}
                value={statusLabel(sale.payment_method)}
              />
            </div>

            {/* Items, in the exact units they were sold in */}
            <div>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-line text-left text-xs uppercase text-fg-subtle">
                    <th className="pb-2 font-medium">{t("Product")}</th>
                    <th className="pb-2 text-center font-medium">{t("Qty")}</th>
                    <th className="pb-2 text-left font-medium">{t("Unit")}</th>
                    <th className="pb-2 text-right font-medium">{t("Price")}</th>
                    <th className="pb-2 text-right font-medium">{t("Total")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {sale.items?.map((it) => (
                    <tr key={it.id}>
                      <td className="py-2 text-fg">
                        {it.name_snapshot}
                        {!!it.is_bonus && (
                          <span className="ml-1.5 text-xs text-fg-subtle">
                            ({t("Free")})
                          </span>
                        )}
                        {it.discount_pct > 0 && !it.is_bonus && (
                          <span className="ml-1 text-xs text-fg-subtle">
                            -{it.discount_pct}%
                          </span>
                        )}
                      </td>
                      <td className="tabular py-2 text-center text-fg-muted">
                        {num(it.quantity)}
                      </td>
                      <td className="py-2 text-fg-muted">
                        {it.unit_name ?? it.base_unit ?? "pcs"}
                      </td>
                      <td className="tabular py-2 text-right text-fg-muted">
                        {it.is_bonus ? t("Free") : money(it.price)}
                      </td>
                      <td className="tabular py-2 text-right font-medium text-fg">
                        {it.is_bonus ? t("Free") : money(it.line_total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Money summary: the invoice math first, settlement below it,
                cash handling as a footnote */}
            <div className="my-4 flex justify-end">
              <div className="w-full sm:w-[50%]">
                <div className="space-y-1">
                  <div className="flex justify-between text-fg-muted">
                    <span>{t("Subtotal")}</span>
                    <span className="tabular">{money(sale.subtotal)}</span>
                  </div>
                  {Number(sale.discount_amount) > 0 && (
                    <div className="flex justify-between text-fg-muted">
                      <span>{t("Discount")} ({sale.discount_pct}%)</span>
                      <span className="tabular">
                        -{money(sale.discount_amount)}
                      </span>
                    </div>
                  )}
                  {Number(sale.tax_amount) > 0 && (
                    <div className="flex justify-between text-fg-muted">
                      <span>{t("Tax ({rate}%)", { rate: sale.tax_rate })}</span>
                      <span className="tabular">{money(sale.tax_amount)}</span>
                    </div>
                  )}
                  <div className="flex items-baseline justify-between border-t border-line pt-1.5 text-base font-semibold text-fg">
                    <span>{t("Total")}</span>
                    <span className="tabular">{money(sale.total)}</span>
                  </div>
                  <p className="tabular text-right text-xs text-fg-subtle">
                    ≈ {khr(Number(sale.total), sale.exchange_rate)}
                  </p>
                </div>
                {!voided && balance > 0 && (
                  <div className="mt-2 space-y-1 border-t border-line pt-2">
                    <div className="flex justify-between text-fg-muted">
                      <span>{t("Paid")}</span>
                      <span className="tabular">{money(sale.amount_paid)}</span>
                    </div>
                    <div className="flex justify-between font-medium">
                      <span className="text-fg">{t("Balance due")}</span>
                      <span className="tabular text-rose-600 dark:text-rose-400">
                        {money(balance)}
                      </span>
                    </div>
                  </div>
                )}
                {sale.amount_received !== null && (
                  <p className="tabular mt-2 text-right text-xs text-fg-subtle">
                    {t("Received")} {money(sale.amount_received)} · {t("Change")}{" "}
                    {money(sale.change_due)}
                  </p>
                )}
              </div>
            </div>

            {/* Payment history */}
            {(sale.payments?.length ?? 0) > 0 && (
              <div className="my-3">
                <h3 className="mb-2 flex items-baseline justify-between text-xs font-medium uppercase tracking-wide text-fg-subtle">
                  {t("Payments")} ({sale.payments?.length ?? 0})
                </h3>
                <ul className="divide-y divide-line rounded-xl border border-line px-3">
                  {/* Server returns the ledger oldest-first; show newest on top */}
                  {[...(sale.payments ?? [])]
                    .sort((a, b) => b.id - a.id)
                    .map((p) => (
                      <li
                        key={p.id}
                        className="flex items-center justify-between py-2.5"
                      >
                        <div>
                          <p className="text-fg">
                            {statusLabel(p.type === "refund" ? "refund" : p.method)}
                            {p.received_by && (
                              <span className="ml-2 text-xs text-fg-subtle">
                                · {p.received_by}
                              </span>
                            )}
                          </p>
                          <p className="mt-0.5 text-xs text-fg-subtle">
                            {fmtDate(p.created_at)}
                            {p.note ? ` · ${p.note}` : ""}
                          </p>
                        </div>
                        <span
                          className={`tabular font-medium ${
                            Number(p.amount) < 0 ? "text-fg-muted" : "text-fg"
                          }`}
                        >
                          {money(p.amount)}
                        </span>
                      </li>
                    ))}
                </ul>
              </div>
            )}

            {sale.note && (
              <p className="rounded-xl bg-surface-sunken p-3.5 text-fg-muted">
                <span className="mr-1.5 text-xs font-medium uppercase tracking-wide text-fg-subtle">
                  {t("Note")}
                </span>
                {sale.note}
              </p>
            )}
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

      <InvoicePaperModal
        open={paperId !== null}
        saleIds={paperId !== null ? [paperId] : null}
        canEdit={canVoid}
        onClose={() => setPaperId(null)}
        onSaved={onChanged}
      />

      <div className="hidden print:block">
        {sale && <Receipt sale={sale} settings={settings} />}
      </div>
    </>
  );
}

function MetaItem({
  icon,
  label,
  value,
  muted,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className="flex items-start gap-2.5">
      {icon && <span className="mt-0.5 text-fg-subtle">{icon}</span>}
      <div className="min-w-0">
        <p className="text-xs text-fg-subtle">{label}</p>
        <p
          className={`truncate font-medium ${muted ? "text-fg-subtle" : "text-fg"}`}
        >
          {value}
        </p>
      </div>
    </div>
  );
}
