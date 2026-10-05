"use client";
import { Gift, ImageDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty-state";
import { money, num, fmtDate } from "@/lib/format";
import type { Bonus } from "@/lib/types";
import { useT } from "@/lib/i18n";

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
  const { t } = useT();
  if (loading) return <div className="flex justify-center py-10"><Spinner /></div>;
  if (bonuses.length === 0) {
    return (
      <EmptyState
        icon={Gift}
        title={hasRange ? t("No results") : t("No bonus yet")}
      />
    );
  }

  return (
    <ul className="space-y-1">
      {bonuses.map((b) => (
        <li key={b.id} className="flex items-center gap-3 rounded-lg px-2.5 py-2.5 text-sm">
          <div className="min-w-0 flex-1">
            <p className="font-medium text-fg">
              {fmtDate(b.period_from, "dd MMM yyyy")}
              {b.period_to !== b.period_from && ` – ${fmtDate(b.period_to, "dd MMM yyyy")}`}
            </p>
            <p className="truncate text-xs text-fg-subtle">
              {b.invoice_count > 0
                ? t("{n} invoices", { n: num(b.invoice_count) })
                : t("Picked items")}
              {b.created_by ? ` · ${b.created_by}` : ""}
              {" · "}{fmtDate(b.created_at, "dd MMM yyyy")}
            </p>
          </div>
          <span className="tabular font-semibold text-fg">
            {money(b.total_amount)}
          </span>
          <Button size="small" icon={<ImageDown className="h-3.5 w-3.5" />} onClick={() => onPaper(b)}>
            {t("Print")}
          </Button>
        </li>
      ))}
    </ul>
  );
}
