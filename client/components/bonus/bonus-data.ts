import dayjs from "dayjs";
import { capitalizeName, money, num } from "@/lib/format";
import { formatInvoiceDate } from "@/lib/invoice-date";
import { buildTotals, invoiceMoneyFields, type InvoiceData, type InvoiceItemRow } from "@/components/invoice-template/bindings";
import { templateRows } from "@/components/invoice-template/totals-rows";
import type { TemplateElement } from "@/components/invoice-template/types";
import type { Bonus, Settings } from "@/lib/types";

// A bonus award printed through the business's invoice templates (Settings →
// Invoice template), so it carries the same logo, layout and fonts as the
// invoices. The award maps onto the invoice model: one item row per rewarded
// product line (grouped under the invoice it came from), one row for the
// invoice-total reward, and a totals block whose only figure is the bonus.

export const bonusRef = (b: Pick<Bonus, "id">) => `BON-${String(b.id).padStart(4, "0")}`;

const basis = (lineTotal: number, type: "percent" | "fixed", pct: number | null) =>
  type === "percent" ? `${money(lineTotal)} × ${Number(pct)}%` : "Fixed";

export function resolveBonusData(
  bonus: Bonus,
  settings: Settings | null,
  client?: { phone?: string | null; address?: string | null } | null,
): InvoiceData {
  const rate = (settings ? Number(settings.exchange_rate) : 0) || 4100;
  const total = Number(bonus.total_amount);
  const totals = buildTotals({ subtotal: total, total, paid: 0, rate });

  const items: InvoiceItemRow[] = [];
  let lastInvoice: string | null = null;
  for (const it of bonus.items ?? []) {
    if (it.invoice_number && it.invoice_number !== lastInvoice) {
      items.push({ name: "", qty: "", rate: "", amount: "", free: false, group: it.invoice_number });
      lastInvoice = it.invoice_number;
    }
    items.push({
      name: it.product_name,
      qty: it.qty_desc || num(it.pieces),
      rate: basis(Number(it.line_total), it.bonus_type, it.pct),
      amount: money(it.amount),
      free: false,
    });
  }
  if (bonus.level1_type) {
    const nums = bonus.invoice_numbers ?? [];
    items.push({ name: "", qty: "", rate: "", amount: "", free: false, group: bonus.invoice_count > 0 ? "Invoice total" : "Total" });
    items.push({
      // An award on items picked in the POS has no invoices behind it
      name:
        bonus.invoice_count > 0
          ? `${num(bonus.invoice_count)} invoice${bonus.invoice_count === 1 ? "" : "s"}${nums.length ? `: ${nums.join(", ")}` : ""}`
          : "Items total",
      qty: "",
      rate: basis(Number(bonus.invoice_total), bonus.level1_type, bonus.level1_pct),
      amount: money(bonus.level1_amount),
      free: false,
    });
  }

  const day = dayjs(bonus.created_at).format("YYYY-MM-DD");
  const fields: Record<string, string> = {
    business_name: capitalizeName(settings?.business_name) || "Chomnenh",
    business_address: settings?.address || "",
    business_phone: settings?.phone || "",
    invoice_number: bonusRef(bonus),
    issue_date: formatInvoiceDate(day),
    due_date: formatInvoiceDate(day),
    client_name: capitalizeName(bonus.client_name),
    client_phone: client?.phone || "",
    client_address: client?.address || "",
    ...invoiceMoneyFields(totals),
    cashier_name: capitalizeName(bonus.created_by),
    note: bonus.note || "",
  };

  return {
    fields,
    dates: { issue_date: day, due_date: day },
    items,
    totals,
    logoUrl: settings?.logo_url ?? null,
    khqrUrl: settings?.khqr_url ?? null,
  };
}

// Invoice wording that still reads as the ENGLISH default is re-worded for a
// bonus. Anything the owner typed themselves (Khmer captions, a template made
// for bonuses) does not match and prints exactly as designed.
const MONEY_BINDINGS = new Set(["amount_due", "amount_due_khr", "subtotal", "total", "balance", "grand_total", "total_khr", "balance_khr", "grand_total_khr"]);
const MONEY_LABEL = /^(amount due|total|sub ?total|balance due|grand total)\b/i;
const FIELD_WORDS: Record<string, string> = {
  "billed to": "Awarded To",
  "invoice number": "Bonus No.",
  "invoice no.": "Bonus No.",
  "invoice": "Bonus No.",
  "date of issue": "Date",
};

function rewordField(el: TemplateElement): TemplateElement {
  const label = el.label?.trim() ?? "";
  if (!label) return el;
  if (MONEY_BINDINGS.has(el.binding ?? "") && MONEY_LABEL.test(label)) {
    const currency = label.match(/\((USD|KHR)\)/i)?.[0];
    return { ...el, label: currency ? `Total Bonus ${currency.toUpperCase()}` : "Total Bonus" };
  }
  const word = FIELD_WORDS[label.toLowerCase()];
  return word ? { ...el, label: word } : el;
}

// The template's invoice wording, re-pointed at a bonus for THIS print only
// (the template itself is never changed): the title and captions read as a
// bonus, the price column becomes the reward basis, the amount column the
// reward, the totals block prints the bonus alone (an award has no discount,
// payment or balance), and the due date, meaningless here, is left off.
export function bonusElements(elements: TemplateElement[]): TemplateElement[] {
  return elements.filter((el) => !(el.kind === "field" && el.binding === "due_date")).map((el) => {
    if (el.kind === "text" && /^\s*invoice\s*$/i.test(el.text ?? "")) {
      const t = el.text!.trim();
      return { ...el, text: t === t.toUpperCase() ? "BONUS" : "Bonus" };
    }
    if (el.kind === "field") return rewordField(el);
    if (el.kind === "items") {
      return {
        ...el,
        itemLabels: { ...el.itemLabels, rate: "Basis", rate2: "", total: "Bonus", total2: "" },
      };
    }
    if (el.kind === "totals") {
      return {
        ...el,
        totalsRows: templateRows(el).map((r) =>
          r.key === "total"
            ? { ...r, label: "Total Bonus", show: true, emphasis: true }
            : r.key === "total_khr"
              ? { ...r, label: "Total Bonus (KHR)", show: true, emphasis: false }
              : { ...r, show: false, emphasis: false },
        ),
      };
    }
    return el;
  });
}

// The template a bonus prints from by default: one the owner named for
// bonuses ("Bonus", "Bonus paper" ...), else the business default, else any.
export function defaultBonusTemplateId(templates: { id: number; name: string; is_default: unknown }[]) {
  return (
    templates.find((t) => /bonus|រង្វាន់/i.test(t.name))?.id ??
    templates.find((t) => t.is_default)?.id ??
    templates[0]?.id ??
    null
  );
}
