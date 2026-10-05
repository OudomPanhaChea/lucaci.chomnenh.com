import { khrAmount, money } from "@/lib/format";
import {
  DEFAULT_TOTALS_ROWS,
  TOTALS_ROW_LABELS,
  type TemplateElement,
  type TotalsLabels,
  type TotalsRow,
  type TotalsRowKey,
} from "./types";
import type { InvoiceTotals } from "./bindings";

// The one place that turns a template's totals configuration + an invoice's
// figures into printable rows. The canvas renders the ticked ones; the property
// panel lists ALL of them with the same captions and the same live values, so
// what the designer sees in the editor is what the invoice prints.
//
// There is deliberately NO conditional visibility here. A ticked row prints on
// every invoice, at $0.00 if that is what the invoice says. See the note in
// types.ts for why.

export interface ResolvedTotalsRow {
  key: TotalsRowKey;
  label: string;
  value: string;
  emphasis: boolean;
  visible: boolean;
  // True when the figure is zero: the panel flags it so the designer can decide
  // whether the row is worth keeping. It never changes what prints.
  empty: boolean;
}

// Money already taken off the invoice reads as a deduction, not a fresh charge,
// so those two rows print with a minus.
function rowAmount(key: TotalsRowKey, t: InvoiceTotals): number {
  switch (key) {
    case "subtotal": return t.subtotal;
    case "discount": return t.discount;
    case "tax": return t.tax;
    case "total": case "total_khr": return t.total;
    case "paid": return t.paid;
    case "balance": case "balance_khr": return t.balance;
    case "previous_owing": return t.previousOwing;
    case "grand_total": case "grand_total_khr": return t.grandTotal;
    default: return 0;
  }
}

const DEDUCTIONS = new Set<TotalsRowKey>(["discount", "paid"]);
const RIEL = new Set<TotalsRowKey>(["total_khr", "balance_khr", "grand_total_khr"]);

function rowValue(key: TotalsRowKey, t: InvoiceTotals): string {
  const n = rowAmount(key, t);
  if (RIEL.has(key)) return `${khrAmount(n, t.rate)} ៛`;
  return DEDUCTIONS.has(key) && n !== 0 ? `− ${money(n)}` : money(n);
}

// Captions are FIXED per key. The legacy `totalsLabels` (four captions a
// template could translate before rows existed) still feeds the four rows it
// covered, so a translated template keeps its words.
function defaultLabel(key: TotalsRowKey, legacy: TotalsLabels | undefined): string {
  const L = legacy ?? {};
  switch (key) {
    case "subtotal": return L.subtotal || TOTALS_ROW_LABELS.subtotal;
    case "paid": return L.paid || TOTALS_ROW_LABELS.paid;
    case "balance": return L.balance || TOTALS_ROW_LABELS.balance;
    case "total": return L.total || TOTALS_ROW_LABELS.total;
    default: return TOTALS_ROW_LABELS[key];
  }
}

// The rows a template element carries, filled in from the defaults. Any key the
// stored list is missing is appended unticked, so a template saved before a row
// existed can still turn it on without being re-created.
export function templateRows(el: Pick<TemplateElement, "totalsRows">): TotalsRow[] {
  const stored = el.totalsRows;
  if (!stored || stored.length === 0) return DEFAULT_TOTALS_ROWS.map((r) => ({ ...r }));
  const known = new Set(DEFAULT_TOTALS_ROWS.map((r) => r.key));
  const seen = new Set(stored.map((r) => r.key));
  const missing = DEFAULT_TOTALS_ROWS.filter((r) => !seen.has(r.key)).map((r) => ({ ...r, show: false }));
  return [...stored.filter((r) => known.has(r.key)).map((r) => ({ ...r })), ...missing];
}

export function resolveTotalsRows(
  el: Pick<TemplateElement, "totalsRows" | "totalsLabels">,
  t: InvoiceTotals,
): ResolvedTotalsRow[] {
  return templateRows(el).map((r) => ({
    key: r.key,
    label: r.label?.trim() || defaultLabel(r.key, el.totalsLabels),
    value: rowValue(r.key, t),
    emphasis: !!r.emphasis,
    visible: r.show !== false,
    empty: rowAmount(r.key, t) === 0,
  }));
}

// The client-details paper can fold a client's earlier debt into one print
// ("Include $X previous owing"). Most templates leave those two rows unticked
// because most invoices carry no such debt, so that toggle would otherwise do
// nothing visible. This turns them on for THAT render only — the direct effect
// of a control the user just pressed, never a rule applied behind their back —
// and leaves a template that already prints them exactly as designed.
export function withOwingRows(el: TemplateElement): TemplateElement {
  const rows = templateRows(el);
  const on = (k: TotalsRowKey) => rows.some((r) => r.key === k && r.show !== false);
  if (on("previous_owing") && on("grand_total")) return el; // already designed in
  return {
    ...el,
    totalsRows: rows.map((r) =>
      r.key === "previous_owing" || r.key === "grand_total" ? { ...r, show: true } : r,
    ),
  };
}
