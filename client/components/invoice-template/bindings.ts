import dayjs from "dayjs";
import { capitalizeName, khrAmount, money, num } from "@/lib/format";
import { formatInvoiceDate } from "@/lib/invoice-date";
import { FIELD_BINDINGS } from "./types";
import type { Sale, Settings } from "@/lib/types";

// The concrete data a template renders against: resolved field strings, the
// line-items rows, and the totals block. Built from a real Sale for printing,
// or from FIELD_BINDINGS samples for the editor preview.
export interface InvoiceItemRow {
  name: string;
  qty: string;
  rate: string;
  amount: string;
  free: boolean;
  // Set only on a separator row (several invoices printed as one paper): the
  // row is not an item, it names the invoice the rows under it came from.
  group?: string;
}

// Money as NUMBERS, not pre-formatted strings: the totals block decides which
// rows to print and how (see totals-rows.ts), and a row can only auto-hide an
// empty figure if it can tell $0.00 from a real amount. Formatting happens once,
// at render, so every producer here stays a plain calculation.
export interface InvoiceTotals {
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  paid: number;
  balance: number;
  previousOwing: number;
  grandTotal: number;
  rate: number; // KHR per $1 this paper is priced at
  hasOwing: boolean;
}

// The paper's dates as RAW calendar days ("YYYY-MM-DD"), kept beside the
// formatted strings in `fields`. A date element writes itself out from these
// with its own pattern (see lib/invoice-date.ts), so two templates can print
// the same invoice as "03/09/2026" and "ថ្ងៃទី 3 ខែ 9 ឆ្នាំ 2026".
export interface InvoiceDates {
  issue_date: string;
  due_date: string;
}

export interface InvoiceData {
  fields: Record<string, string>;
  dates: InvoiceDates;
  items: InvoiceItemRow[];
  totals: InvoiceTotals;
  logoUrl: string | null;
  khqrUrl: string | null;
}

// KHR per $1 for one paper: the rate SNAPSHOTTED on the sale (the cashier may
// have typed today's rate at the POS), falling back to the settings rate for
// older sales and to 4100 when settings have not loaded.
const saleRate = (sale: Sale | null, settings: Settings | null): number =>
  Number(sale?.exchange_rate) || (settings ? Number(settings.exchange_rate) : 0) || 4100;

// How an exchange rate prints on an invoice.
const rateText = (rate: number) => `${num(rate)} ៛ / $1`;

// The day the paper is dated. `issue_date` is what the cashier typed at the
// POS; sales rung up before that column existed fall back to the day they were
// rung up, so no invoice ever prints without a date.
const saleDates = (sale: Sale): InvoiceDates => {
  const day = sale.issue_date || dayjs(sale.created_at).format("YYYY-MM-DD");
  return { issue_date: day, due_date: day };
};

// One place that derives the whole ladder, so a POS invoice, a combined paper and
// a brand invoice can never disagree about the arithmetic. Previous owing is
// folded in exactly once, by the caller passing it (a modal toggle), never per
// invoice.
//
// The ladder, and what each line MEANS — the two money lines are deliberately
// different things and neither substitutes for the other:
//
//   subtotal                       line items
//   − discount  + tax
//   = total                        what this invoice bills
//   + previousOwing                debt carried in from earlier invoices
//   = grandTotal                   THE WHOLE BILL. Never reduced by payment:
//                                  it is what was charged, so it still reads
//                                  $36.00 on a settled $36.00 invoice.
//   − paid                         money received
//   = balance                      what is still owed today (0 once settled)
//
// grandTotal used to be `balance + previousOwing`, which made it collapse to
// $0.00 the moment an invoice was paid — a "Grand Total" of nothing. It is the
// gross figure now; `balance` is the one that nets off payment.
export function buildTotals(v: {
  subtotal: number;
  discount?: number;
  tax?: number;
  total: number;
  paid: number;
  previousOwing?: number;
  rate: number;
}): InvoiceTotals {
  const previousOwing = Number(v.previousOwing) || 0;
  const grandTotal = v.total + previousOwing;
  return {
    subtotal: v.subtotal,
    discount: Number(v.discount) || 0,
    tax: Number(v.tax) || 0,
    total: v.total,
    paid: v.paid,
    balance: grandTotal - v.paid,
    previousOwing,
    grandTotal,
    rate: v.rate,
    hasOwing: previousOwing > 0,
  };
}

// The money fields a `field` element can bind to, formatted from the same
// numbers the totals block prints, so a figure placed anywhere on the sheet
// always matches the block.
//
// `amount_due` IS the balance: what the client still has to hand over. It used
// to fall back to the invoice total once the balance reached zero, which printed
// a big "AMOUNT DUE $36.00" on a settled invoice whose own totals block said
// "Balance Due $0.00" on the same sheet. A template that wants the gross figure
// in that spot binds `grand_total` (or `total`); nothing here decides for it.
export const invoiceMoneyFields = (t: InvoiceTotals): Record<string, string> => ({
  amount_due: money(t.balance),
  amount_due_khr: `${khrAmount(t.balance, t.rate)} ៛`,
  subtotal: money(t.subtotal),
  discount: money(t.discount),
  tax: money(t.tax),
  total: money(t.total),
  paid: money(t.paid),
  balance: money(t.balance),
  previous_owing: money(t.previousOwing),
  grand_total: money(t.grandTotal),
  total_khr: `${khrAmount(t.total, t.rate)} ៛`,
  balance_khr: `${khrAmount(t.balance, t.rate)} ៛`,
  grand_total_khr: `${khrAmount(t.grandTotal, t.rate)} ៛`,
  exchange_rate: rateText(t.rate),
});

const itemRows = (sale: Sale): InvoiceItemRow[] =>
  (sale.items ?? []).map((it) => ({
    name: it.name_snapshot,
    qty: `${num(it.quantity)} ${it.unit_name ?? it.base_unit ?? "pcs"}`.trim(),
    rate: it.is_bonus ? "FREE" : money(it.price),
    amount: it.is_bonus ? "FREE" : money(it.line_total),
    free: !!it.is_bonus,
  }));

// oldOwing = the client's remaining previous debt to fold into this paper
// (0 = don't show it). The caller decides the amount and whether to include it
// (a modal toggle), so previous owing is never double-counted.
export function resolveInvoiceData(sale: Sale, settings: Settings | null, oldOwing = 0): InvoiceData {
  const totals = buildTotals({
    subtotal: Number(sale.subtotal),
    discount: Number(sale.discount_amount),
    tax: Number(sale.tax_amount),
    total: Number(sale.total),
    paid: Number(sale.amount_paid),
    previousOwing: Number(oldOwing) || 0,
    rate: saleRate(sale, settings),
  });

  const dates = saleDates(sale);
  // Every NAME on the sheet prints capitalized (see capitalizeName): a customer
  // typed in at the counter as "sun vireak" still reads "Sun Vireak" on the
  // paper the customer is handed. The stored value is untouched.
  const fields: Record<string, string> = {
    business_name: capitalizeName(settings?.business_name) || "Chomnenh",
    business_address: settings?.address || "",
    business_phone: settings?.phone || "",
    invoice_number: sale.invoice_number,
    issue_date: formatInvoiceDate(dates.issue_date),
    due_date: formatInvoiceDate(dates.due_date),
    // Typed onto this invoice at the POS (or snapshotted from a saved client);
    // never looked up live, so a reprint shows what was agreed at the counter.
    client_name: capitalizeName(sale.client_name) || "Walk-in customer",
    client_phone: sale.client_phone || "",
    client_address: sale.client_address || "",
    ...invoiceMoneyFields(totals),
    cashier_name: capitalizeName(sale.cashier_name),
    note: sale.note || "",
  };

  return {
    fields,
    dates,
    items: itemRows(sale),
    totals,
    logoUrl: settings?.logo_url ?? null,
    khqrUrl: settings?.khqr_url ?? null,
  };
}

// Several invoices printed as ONE paper: one header, one totals block, one
// footer, and a single item list where each invoice's lines sit under a
// separator row naming it. Money is summed across the invoices; the number
// field lists every invoice so the paper stays traceable.
// oldOwing is folded in exactly once for the whole document (never per sale),
// mirroring resolveInvoiceData's owing handling.
//
// owingOnlyIds (lucaci's "បុងចាស់") = invoices already handed to the client.
// They are NOT printed at all, not even as a balance line: their outstanding
// balance is added to Previous Owing together with the client's old owing, so
// the Grand Total is identical whether an invoice is itemized or carried.
export function combineInvoiceData(
  sales: Sale[], settings: Settings | null, oldOwing = 0, owingOnlyIds: number[] = [],
): InvoiceData {
  const itemized = sales.filter((s) => !owingOnlyIds.includes(s.id));
  const carried = sales.filter((s) => owingOnlyIds.includes(s.id));
  const carriedOwing = carried.reduce((acc, s) => acc + (Number(s.total) - Number(s.amount_paid)), 0);
  const previousOwing = (Number(oldOwing) || 0) + carriedOwing;

  // One invoice left on the paper prints exactly like a single invoice, with
  // the carried debt in its Previous Owing row.
  if (itemized.length === 1) return resolveInvoiceData(itemized[0], settings, previousOwing);

  // Every invoice carried: nothing is itemized, the paper is the owing alone.
  // Its header still describes the invoices the debt came from.
  const shown = itemized.length > 0 ? itemized : sales;

  const sum = (pick: (s: Sale) => unknown) =>
    itemized.reduce((acc, s) => acc + Number(pick(s) ?? 0), 0);

  // The paper is dated by the newest invoice it covers, so re-printing it
  // later does not change it. Its rate is the document's rate too: the invoices
  // may have been sold on different days at different rates.
  const newest = shown.reduce((a, b) => (a.created_at >= b.created_at ? a : b));

  const totals = buildTotals({
    subtotal: sum((s) => s.subtotal),
    discount: sum((s) => s.discount_amount),
    tax: sum((s) => s.tax_amount),
    total: sum((s) => s.total),
    paid: sum((s) => s.amount_paid),
    previousOwing,
    rate: saleRate(newest, settings),
  });

  const items: InvoiceItemRow[] = [];
  itemized.forEach((s) => {
    items.push({
      name: "", qty: "", rate: "", amount: "", free: false,
      group: `${s.invoice_number} · ${dayjs(s.created_at).format("DD MMM YYYY")}`,
    });
    items.push(...itemRows(s));
  });

  const uniq = (v: (string | null | undefined)[]) =>
    [...new Set(v.map((x) => (x || "").trim()).filter(Boolean))];

  const dates = saleDates(newest);
  const named = shown.find((s) => s.client_name);
  const fields: Record<string, string> = {
    business_name: capitalizeName(settings?.business_name) || "Chomnenh",
    business_address: settings?.address || "",
    business_phone: settings?.phone || "",
    invoice_number: shown.map((s) => s.invoice_number).join(", "),
    issue_date: formatInvoiceDate(dates.issue_date),
    due_date: formatInvoiceDate(dates.due_date),
    client_name: capitalizeName(named?.client_name) || "Walk-in customer",
    // The customer of the invoice that named them, so the contact block on a
    // combined paper belongs to one person rather than being stitched together.
    client_phone: named?.client_phone || shown.find((s) => s.client_phone)?.client_phone || "",
    client_address: named?.client_address || shown.find((s) => s.client_address)?.client_address || "",
    ...invoiceMoneyFields(totals),
    cashier_name: uniq(shown.map((s) => capitalizeName(s.cashier_name))).join(", "),
    note: uniq(shown.map((s) => s.note)).join(" · "),
  };

  return { fields, dates, items, totals, logoUrl: settings?.logo_url ?? null, khqrUrl: settings?.khqr_url ?? null };
}

// What the editor's preview invoice looks like. The designer drives these from
// the editor's Preview panel, so rows that only print on some invoices
// (discount, paid, previous owing) can be SEEN and positioned while designing
// instead of staying invisible until a real invoice happens to carry them.
export interface SamplePreview {
  itemCount: number;
  discountPct: number;
  paid: number;
  previousOwing: number;
  rate: number; // 0 = use the business rate from Settings
}

export const DEFAULT_SAMPLE_PREVIEW: SamplePreview = {
  itemCount: 3,
  discountPct: 0,
  paid: 0,
  previousOwing: 0,
  rate: 0,
};

// Products the preview cycles through. Khmer names on purpose: they are the
// widest thing the description column ever has to hold.
const SAMPLE_PRODUCTS: { name: string; qty: number; unit: string; price: number }[] = [
  { name: "Mecira ស្រ្កាប់ពន្លៃ", qty: 960, unit: "កំប៉ុង", price: 5.3 },
  { name: "Mecira ស្ក្រាប់កាហ្វេ", qty: 1000, unit: "កំប៉ុង", price: 5.3 },
  { name: "Lucaci Sun Cream", qty: 1000, unit: "ដប", price: 2.9 },
  { name: "ក្រែមការពារកម្តៅថ្ងៃ", qty: 240, unit: "កំប៉ុង", price: 7.5 },
  { name: "សាប៊ូកក់សក់", qty: 480, unit: "ដប", price: 3.25 },
];

// Sample data for the editor preview (Settings, no real invoice yet). The
// totals are DERIVED from the sample rows, so adding or removing rows moves the
// subtotal and every figure under it, exactly as a real invoice would.
export function sampleInvoiceData(settings: Settings | null, preview?: Partial<SamplePreview>): InvoiceData {
  const p = { ...DEFAULT_SAMPLE_PREVIEW, ...preview };
  const count = Math.max(1, Math.min(60, Math.round(p.itemCount) || 1));

  const items: InvoiceItemRow[] = [];
  let subtotal = 0;
  for (let i = 0; i < count; i += 1) {
    const src = SAMPLE_PRODUCTS[i % SAMPLE_PRODUCTS.length];
    // Vary the quantity per cycle so a long preview does not read as one row
    // repeated, and every line total stays a distinct number.
    const qty = src.qty + Math.floor(i / SAMPLE_PRODUCTS.length) * 20;
    const line = Math.round(qty * src.price * 100) / 100;
    subtotal += line;
    items.push({
      name: src.name,
      qty: `${num(qty)} ${src.unit}`,
      rate: money(src.price),
      amount: money(line),
      free: false,
    });
  }
  subtotal = Math.round(subtotal * 100) / 100;

  const discount = Math.round(subtotal * (Math.max(0, Math.min(100, p.discountPct)) / 100) * 100) / 100;
  const total = Math.round((subtotal - discount) * 100) / 100;
  const totals = buildTotals({
    subtotal,
    discount,
    tax: 0,
    total,
    paid: Math.max(0, Math.min(total, Number(p.paid) || 0)),
    previousOwing: Math.max(0, Number(p.previousOwing) || 0),
    rate: Number(p.rate) || (settings ? Number(settings.exchange_rate) : 0) || 4100,
  });

  const fields: Record<string, string> = {};
  FIELD_BINDINGS.forEach((b) => (fields[b.key] = b.sample));
  if (settings?.business_name) fields.business_name = capitalizeName(settings.business_name);
  if (settings?.address) fields.business_address = settings.address;
  if (settings?.phone) fields.business_phone = settings.phone;
  Object.assign(fields, invoiceMoneyFields(totals));

  return {
    fields,
    // The editor previews today, so a date pattern is designed against a real
    // date rather than a fixed sample that never changes shape.
    dates: { issue_date: dayjs().format("YYYY-MM-DD"), due_date: dayjs().format("YYYY-MM-DD") },
    items,
    totals,
    logoUrl: settings?.logo_url ?? null,
    khqrUrl: settings?.khqr_url ?? null,
  };
}
