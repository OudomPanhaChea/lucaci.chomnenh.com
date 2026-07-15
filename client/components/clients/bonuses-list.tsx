"use client";
import { Gift, ImageDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty-state";
import { money, num, fmtDate } from "@/lib/format";
import type { Bonus } from "@/lib/types";

// Partner bonus awards tab of the client details page (manager-only data).
export default function BonusesList({
  bonuses,
  loading,
  hasRange,
  onPaper,
}: {
  bonuses: Bonus[];
  loading: boolean;
  hasRange: boolean;
  onPaper: (b: Bonus) => void;
}) {
  if (loading) return <div className="flex justify-center py-10"><Spinner /></div>;
  if (bonuses.length === 0) {
    return (
      <EmptyState
        icon={Gift}
        title="No bonuses yet"
        description={hasRange
          ? "No bonus was awarded in the selected period. Try a wider date range."
          : "Awards made on the Bonus page will be listed here."}
      />
    );
  }

  return (
    <ul className="space-y-1">
      {bonuses.map((b) => (
        <li key={b.id} className="flex items-center gap-3 rounded-lg px-2.5 py-2.5 text-sm">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand-soft-foreground">
            <Gift className="h-4.5 w-4.5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-medium text-fg">
              {fmtDate(b.period_from, "dd MMM yyyy")} – {fmtDate(b.period_to, "dd MMM yyyy")}
            </p>
            <p className="truncate text-xs text-fg-subtle">
              {num(b.invoice_count)} invoice{b.invoice_count === 1 ? "" : "s"}
              {(b.items?.length ?? 0) > 0 ? `, ${num(b.items!.length)} item line${b.items!.length === 1 ? "" : "s"}` : ""}
              {b.created_by ? `, by ${b.created_by}` : ""}
              {", "}{fmtDate(b.created_at, "dd MMM yyyy")}
            </p>
          </div>
          <span className="tabular font-semibold text-emerald-600 dark:text-emerald-400">
            {money(b.total_amount)}
          </span>
          <Button size="small" icon={<ImageDown className="h-3.5 w-3.5" />} onClick={() => onPaper(b)}>
            Paper
          </Button>
        </li>
      ))}
    </ul>
  );
}
