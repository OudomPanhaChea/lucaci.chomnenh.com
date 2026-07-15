"use client";
import { useEffect, useMemo, useState } from "react";
import { Checkbox } from "antd";
import { Button } from "@/components/ui/button";
import { ChevronRight, HandCoins, Printer, ReceiptText } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty-state";
import { money, num, fmtDate } from "@/lib/format";
import type { Sale } from "@/lib/types";

const balanceOf = (s: Sale) => Number(s.total) - Number(s.amount_paid);
const isOwing = (s: Sale) => s.status !== "voided" && balanceOf(s) > 0;
const isSelectable = (s: Sale) => s.status !== "voided";

// Purchase list of the client details page. Any non-voided invoice can be
// ticked (or all at once) to print them together as one A4 statement paper;
// owing-only selections print as an owing statement.
export default function PurchaseHistory({
  sales,
  loading,
  hasRange,
  onOpenInvoice,
  onPay,
  onCreatePaper,
}: {
  sales: Sale[];
  loading: boolean;
  hasRange: boolean;
  onOpenInvoice: (id: number) => void;
  onPay: (s: Sale) => void;
  onCreatePaper: (saleIds: number[]) => void;
}) {
  const [sel, setSel] = useState<number[]>([]);
  const selectable = useMemo(() => sales.filter(isSelectable), [sales]);

  // Drop selections that no longer exist or got voided meanwhile
  useEffect(() => {
    setSel((prev) => prev.filter((id) => selectable.some((s) => s.id === id)));
  }, [selectable]);

  if (loading) return <div className="flex justify-center py-10"><Spinner /></div>;
  if (sales.length === 0) {
    return (
      <EmptyState
        icon={ReceiptText}
        title="No purchases yet"
        description={hasRange
          ? "Nothing was bought in the selected period. Try a wider date range."
          : "Invoices will show up here after this client's first sale at the POS."}
      />
    );
  }

  const selected = selectable.filter((s) => sel.includes(s.id));
  const selOwing = selected.reduce((sum, s) => sum + balanceOf(s), 0);
  const allChecked = selectable.length > 0 && sel.length === selectable.length;

  return (
    <div>
      {selectable.length > 0 ? (
        <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg bg-surface-sunken/50 px-3 py-2.5">
          <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-fg-muted">
            <Checkbox
              checked={allChecked}
              indeterminate={sel.length > 0 && !allChecked}
              onChange={(e) => setSel(e.target.checked ? selectable.map((s) => s.id) : [])}
            />
            Select all
          </label>
          <span className="text-xs text-fg-subtle max-sm:hidden">
            Tick invoices to print one statement paper
          </span>
          {sel.length > 0 && (
            <div className="ml-auto flex items-center gap-2.5">
              <span className="tabular text-xs font-medium text-fg">
                {sel.length} invoice{sel.length === 1 ? "" : "s"}
                {selOwing > 0 && (
                  <>
                    {" · "}
                    <span className="text-rose-600 dark:text-rose-400">{money(selOwing)} owing</span>
                  </>
                )}
              </span>
              <Button type="primary" size="small" icon={<Printer className="h-3.5 w-3.5" />}
                onClick={() => onCreatePaper(sel)}>
                Statement paper
              </Button>
            </div>
          )}
        </div>
      ) : (
        <p className="mb-1.5 text-xs text-fg-subtle">Click a purchase to see the full invoice.</p>
      )}
      <ul className="space-y-1">
        {sales.map((s) => {
          const bal = balanceOf(s);
          const canTick = isSelectable(s);
          const owes = isOwing(s);
          return (
            <li
              key={s.id}
              onClick={() => onOpenInvoice(s.id)}
              className={`group flex cursor-pointer items-center gap-3 rounded-lg border px-2.5 py-2.5 text-sm transition-colors duration-150 hover:bg-surface-sunken/50 ${
                sel.includes(s.id) ? "border-line bg-brand-soft/40" : "border-transparent"
              }`}
            >
              {canTick && (
                <span onClick={(e) => e.stopPropagation()} className="flex items-center">
                  <Checkbox
                    checked={sel.includes(s.id)}
                    aria-label={`Select ${s.invoice_number} for the statement paper`}
                    onChange={(e) =>
                      setSel((prev) => (e.target.checked ? [...prev, s.id] : prev.filter((x) => x !== s.id)))}
                  />
                </span>
              )}
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand-soft-foreground">
                <ReceiptText className="h-4.5 w-4.5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 font-medium text-fg">
                  <span className="truncate">{fmtDate(s.created_at, "dd MMM yyyy")}</span>
                  <StatusBadge status={s.status} />
                </p>
                <p className="truncate font-mono text-xs text-fg-subtle">
                  {s.invoice_number}{s.item_count ? `, ${num(s.item_count)} items` : ""}
                </p>
              </div>
              <div className="text-right">
                <p className="tabular font-medium text-fg">{money(s.total)}</p>
                {owes && (
                  <p className="tabular text-xs text-rose-600 dark:text-rose-400">{money(bal)} owing</p>
                )}
              </div>
              {owes && (
                <Button size="middle" variant="solid" icon={<HandCoins className="h-3.5 w-3.5" />}
                  onClick={(e) => {
                    e.stopPropagation();
                    onPay(s);
                  }}>
                  Pay
                </Button>
              )}
              <ChevronRight className="h-4 w-4 shrink-0 text-fg-subtle transition-colors duration-150 group-hover:text-fg" />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
