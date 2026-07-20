"use client";
import { ChevronRight, Wallet } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty-state";
import { money, fmtDate } from "@/lib/format";
import type { Payment } from "@/lib/types";

// Payments and deposits ledger tab of the client details page.
export default function PaymentsList({
  payments,
  loading,
  onOpenInvoice,
}: {
  payments: Payment[];
  loading: boolean;
  onOpenInvoice: (id: number) => void;
}) {
  if (loading) return <div className="flex justify-center py-10"><Spinner /></div>;
  if (payments.length === 0) {
    return (
      <EmptyState
        icon={Wallet}
        title="No payments yet"
        description="Money received for invoices and prepaid deposits will be listed here."
      />
    );
  }

  return (
    <ul className="space-y-1">
      {payments.map((p) => (
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
            <p className="flex items-center gap-2">
              <StatusBadge
                status={p.type === "sale" ? p.method : p.type}
                label={
                  p.type === "owing_add"
                    ? "Old owing"
                    : p.type === "owing_pay"
                      ? "Owing paid"
                      : undefined
                }
              />
              {Boolean(p.is_paydown) && (
                <span
                  title="Received after the sale: this payment pays down what was owing"
                  className="rounded-full bg-surface-sunken px-2 py-0.5 text-[11px] font-medium text-fg-muted"
                >
                  Paydown
                </span>
              )}
              {p.invoice_number && <span className="font-mono text-xs text-fg-subtle">{p.invoice_number}</span>}
            </p>
            <p className="mt-0.5 text-xs text-fg-subtle">
              {fmtDate(p.created_at)}
              {p.received_by ? `, by ${p.received_by}` : ""}
              {p.note ? `, ${p.note}` : ""}
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
            {p.sale_id && (
              <ChevronRight className="h-4 w-4 shrink-0 text-fg-subtle transition-colors duration-150 group-hover:text-fg" />
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}
