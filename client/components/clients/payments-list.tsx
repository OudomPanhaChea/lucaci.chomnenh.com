"use client";
import { useState } from "react";
import { Popconfirm, Tooltip } from "antd";
import { toast } from "react-toastify";
import { ChevronRight, Pencil, Trash2, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useStatusLabel } from "@/components/ui/status-badge";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty-state";
import LedgerEditModal from "@/components/clients/ledger-edit-modal";
import api, { apiError } from "@/services/api";
import { money, fmtDate } from "@/lib/format";
import type { Payment } from "@/lib/types";
import { useT } from "@/lib/i18n";

// Rows that belong to the client alone (no invoice) and can be corrected in
// place. Invoice payments drive the sale's status, so they are fixed by
// voiding the sale, never edited from the ledger.
const EDITABLE = new Set(["deposit", "owing_add", "owing_pay"]);

// Payments and deposits ledger tab of the client details page.
export default function PaymentsList({
  payments,
  loading,
  clientId,
  canManage = false,
  onOpenInvoice,
  onChanged,
}: {
  payments: Payment[];
  loading: boolean;
  clientId: number;
  canManage?: boolean;
  onOpenInvoice: (id: number) => void;
  onChanged?: () => void;
}) {
  const { t } = useT();
  const statusLabel = useStatusLabel();
  const [editing, setEditing] = useState<Payment | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const remove = async (p: Payment) => {
    setDeletingId(p.id);
    try {
      await api.delete(`/clients/${clientId}/payments/${p.id}`);
      toast.success(t("Deleted"));
      onChanged?.();
    } catch (err) {
      toast.error(apiError(err));
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) return <div className="flex justify-center py-10"><Spinner /></div>;
  if (payments.length === 0) {
    return (
      <EmptyState
        icon={Wallet}
        title={t("No payments yet")}
      />
    );
  }

  return (
    <>
      <ul className="space-y-1">
        {payments.map((p) => {
          const editable = canManage && EDITABLE.has(p.type);
          return (
            <li
              key={p.id}
              onClick={p.sale_id ? () => onOpenInvoice(p.sale_id!) : undefined}
              className={`flex items-center justify-between gap-2 rounded-lg border border-transparent px-2.5 py-2.5 text-sm ${
                p.sale_id
                  ? "group cursor-pointer transition-colors duration-150 hover:border-line hover:bg-surface-sunken"
                  : ""
              }`}
            >
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-fg">
                  {statusLabel(p.type === "sale" ? p.method : p.type)}
                  {Boolean(p.is_paydown) && (
                    <span className="text-xs text-fg-subtle">· {t("Owing paid")}</span>
                  )}
                  {p.invoice_number && <span className="font-mono text-xs text-fg-subtle">{p.invoice_number}</span>}
                </p>
                <p className="mt-0.5 text-xs text-fg-subtle">
                  {fmtDate(p.created_at)}
                  {p.received_by ? ` · ${p.received_by}` : ""}
                  {p.note ? ` · ${p.note}` : ""}
                </p>
              </div>
              <span className="flex items-center gap-2">
                {/* owing_add is debt recorded, not money in: no "+", rose */}
                <span className={`tabular font-medium ${
                  Number(p.amount) < 0 || p.type === "owing_add"
                    ? "text-rose-600 dark:text-rose-400"
                    : "text-fg"
                }`}>
                  {Number(p.amount) < 0 || p.type === "owing_add" ? "" : "+"}
                  {money(p.amount)}
                </span>
                {editable && (
                  <span
                    className="flex items-center gap-1"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Tooltip title={t("Edit")}>
                      <Button
                        size="small"
                        type="text"
                        icon={<Pencil className="h-4 w-4" />}
                        onClick={() => setEditing(p)}
                      />
                    </Tooltip>
                    <Popconfirm
                      title={t("Delete?")}
                      okText={t("Delete")}
                      cancelText={t("Cancel")}
                      okButtonProps={{ danger: true }}
                      onConfirm={() => remove(p)}
                    >
                      <Tooltip title={t("Delete")}>
                        <Button
                          danger
                          size="small"
                          type="text"
                          loading={deletingId === p.id}
                          icon={<Trash2 className="h-4 w-4" />}
                        />
                      </Tooltip>
                    </Popconfirm>
                  </span>
                )}
                {p.sale_id && (
                  <ChevronRight className="h-4 w-4 shrink-0 text-fg-subtle transition-colors duration-150 group-hover:text-fg" />
                )}
              </span>
            </li>
          );
        })}
      </ul>

      <LedgerEditModal
        clientId={clientId}
        payment={editing}
        onClose={() => setEditing(null)}
        onDone={() => onChanged?.()}
      />
    </>
  );
}
