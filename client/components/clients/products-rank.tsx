"use client";
import { Package } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty-state";
import type { ClientStatement } from "@/lib/types";

// What this client buys, ranked by the amount spent on it (quantities stay in
// the units they were sold, per the owner's display rule).
export default function ProductsRank({
  products,
  loading,
  hasRange,
}: {
  products: ClientStatement["products"];
  loading: boolean;
  hasRange: boolean;
}) {
  if (loading) return <div className="flex justify-center py-10"><Spinner /></div>;
  if (products.length === 0) {
    return (
      <EmptyState
        icon={Package}
        title="No products yet"
        description={hasRange
          ? "Nothing was bought in the selected period. Try a wider date range."
          : "Products this client buys will be ranked here after their first sale."}
      />
    );
  }

  const max = Number(products[0]?.total) || 1;
  return (
    <ul className="space-y-0.5">
      {products.map((pr, i) => (
        <li key={`${pr.product_id ?? "x"}-${pr.name}`} className="rounded-lg px-2.5 py-2 text-sm">
          <div className="flex items-center gap-3">
            <span className="tabular w-6 shrink-0 text-right text-fg-subtle">{i + 1}.</span>
            <span className="min-w-0 flex-1 truncate font-medium text-fg">{pr.name}</span>
            <span className="tabular shrink-0 text-xs text-fg-subtle">{pr.qty_desc}</span>
          </div>
          <div className="ml-9 mt-1.5 h-1 overflow-hidden rounded-full bg-surface-sunken">
            <div
              className="h-full rounded-full bg-brand/60"
              style={{ width: `${Math.max((Number(pr.total) / max) * 100, 2)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
