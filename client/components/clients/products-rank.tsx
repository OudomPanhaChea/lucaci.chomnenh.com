"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Checkbox } from "antd";
import { Gift, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty-state";
import { writePicked, type PickedLine } from "@/lib/pos-cart";
import { money, num } from "@/lib/format";
import type { ClientProductRow } from "@/lib/types";
import { useT } from "@/lib/i18n";

const rowKey = (r: ClientProductRow) =>
  `${r.product_id ?? "x"}|${r.name}|${r.unit_name ?? ""}|${r.is_bonus ? 1 : 0}`;
const round2 = (n: number) => Math.round(n * 100) / 100;

// A row can seed a picked-items bonus only when it still points at a live
// product and unit, and it was not a FREE line.
const canPick = (r: ClientProductRow) =>
  !r.is_bonus &&
  r.product_id != null &&
  !r.is_deleted &&
  (r.unit_name == null || r.unit_id != null);

// What this client bought, as an invoice-style table: one row per product +
// unit as sold (never summed across units), most quantity first. Managers can
// tick rows and send them to the bonus page's Items tab as the reward basis.
export default function ProductsRank({
  clientId,
  products,
  loading,
  hasRange,
  canBonus,
}: {
  clientId: number;
  products: ClientProductRow[];
  loading: boolean;
  hasRange: boolean;
  canBonus: boolean;
}) {
  const { t } = useT();
  const router = useRouter();
  const [sel, setSel] = useState<string[]>([]);

  const selectable = useMemo(
    () => (canBonus ? products.filter(canPick) : []),
    [products, canBonus],
  );
  // Drop ticks that left the list (range change, realtime refresh)
  useEffect(() => {
    const keys = new Set(selectable.map(rowKey));
    setSel((prev) => {
      const next = prev.filter((k) => keys.has(k));
      return next.length === prev.length ? prev : next;
    });
  }, [selectable]);

  if (loading) return <div className="flex justify-center py-10"><Spinner /></div>;
  if (products.length === 0) {
    return (
      <EmptyState
        icon={Package}
        title={hasRange ? t("No results") : t("No purchases yet")}
      />
    );
  }

  const selSet = new Set(sel);
  const allChecked = selectable.length > 0 && sel.length === selectable.length;
  const grandTotal = products.reduce((s, r) => s + r.total, 0);
  const toggle = (key: string, on: boolean) =>
    setSel((prev) => (on ? [...prev, key] : prev.filter((k) => k !== key)));

  const createBonus = () => {
    const lines: PickedLine[] = selectable
      .filter((r) => selSet.has(rowKey(r)))
      .map((r) => ({
        product_id: r.product_id as number,
        unit_id: r.unit_id,
        product_name: r.name,
        unit_name: r.unit_name ?? r.base_unit ?? "pcs",
        quantity: r.qty,
        price: r.qty > 0 ? round2(r.total / r.qty) : 0,
      }));
    if (lines.length === 0) return;
    writePicked(clientId, lines);
    router.push(`/admin/bonus/${clientId}`);
  };

  return (
    <div>
      {selectable.length > 0 && (
        <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg bg-surface-sunken/50 px-3 py-2.5">
          <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-fg-muted">
            <Checkbox
              checked={allChecked}
              indeterminate={sel.length > 0 && !allChecked}
              onChange={(e) => setSel(e.target.checked ? selectable.map(rowKey) : [])}
            />
            {t("Select all")}
          </label>
          {sel.length > 0 && (
            <div className="ml-auto flex items-center gap-2.5">
              <span className="tabular text-xs font-medium text-fg">
                {t("{n} selected", { n: sel.length })}
              </span>
              <Button
                type="primary"
                size="medium"
                icon={<Gift className="h-3.5 w-3.5" aria-hidden />}
                onClick={createBonus}
              >
                {t("Bonus")}
              </Button>
            </div>
          )}
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full min-w-120 text-sm">
          <thead>
            <tr className="border-b border-line bg-surface-sunken text-xs text-fg-subtle">
              {canBonus && <th className="w-10 px-3 py-2" aria-label={t("Select all")} />}
              <th className="w-8 py-2 pl-3 text-right font-medium">#</th>
              <th className="px-3 py-2 text-left font-medium">{t("Product")}</th>
              <th className="px-3 py-2 text-right font-medium">{t("Qty")}</th>
              <th className="px-3 py-2 text-right font-medium">{t("Price")}</th>
              <th className="px-3 py-2 text-right font-medium">{t("Amount")}</th>
            </tr>
          </thead>
          <tbody>
            {products.map((r, i) => {
              const key = rowKey(r);
              const pickable = canBonus && canPick(r);
              const checked = selSet.has(key);
              return (
                <tr
                  key={key}
                  onClick={pickable ? () => toggle(key, !checked) : undefined}
                  className={`border-b border-line last:border-b-0 ${
                    pickable ? "cursor-pointer hover:bg-surface-sunken/40" : ""
                  } ${checked ? "bg-brand-soft/40" : ""}`}
                >
                  {canBonus && (
                    <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                      {pickable && (
                        <Checkbox
                          checked={checked}
                          onChange={(e) => toggle(key, e.target.checked)}
                          aria-label={r.name}
                        />
                      )}
                    </td>
                  )}
                  <td className="tabular py-2.5 pl-3 text-right text-fg-subtle">{i + 1}</td>
                  <td className="px-3 py-2.5 font-medium text-fg">{r.name}</td>
                  <td className="tabular whitespace-nowrap px-3 py-2.5 text-right text-fg">
                    {num(r.qty)} {r.unit_name ?? r.base_unit ?? "pcs"}
                  </td>
                  <td className="tabular whitespace-nowrap px-3 py-2.5 text-right text-fg-muted">
                    {r.is_bonus ? t("Free") : money(r.qty > 0 ? r.total / r.qty : 0)}
                  </td>
                  <td className="tabular whitespace-nowrap px-3 py-2.5 text-right font-medium text-fg">
                    {money(r.total)}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-line bg-surface-sunken/50">
              <td colSpan={canBonus ? 5 : 4} className="px-3 py-2.5 text-right text-xs font-medium text-fg-muted">
                {t("Total")}
              </td>
              <td className="tabular whitespace-nowrap px-3 py-2.5 text-right font-semibold text-fg">
                {money(grandTotal)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
