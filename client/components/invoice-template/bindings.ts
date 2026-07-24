import dayjs from "dayjs";
import { money, num } from "@/lib/format";
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
}

export interface InvoiceData {
  fields: Record<string, string>;
  items: InvoiceItemRow[];
  totals: {
    subtotal: string; total: string; paid: string; balance: string; khr: string;
    // Set when previous owing is folded in (>0): the totals block then prints a
    // Previous owing line and a Grand Total Owing = balance + previous owing.
    previousOwing: string; grandTotal: string; hasOwing: boolean;
    // No line items (owing-only statement): the totals block drops the $0
    // subtotal/total rows and shows just the owing.
    invoiceEmpty: boolean;
  };
  logoUrl: string | null;
  khqrUrl: string | null;
}

// oldOwing = the client's remaining pre-system debt to fold into this invoice
// (0 = don't show it). The caller decides the amount and whether to include it
// (a modal toggle + "show on the last sheet only" for multi-invoice batches),
// so previous owing is never double-counted across sheets.
export function resolveInvoiceData(sale: Sale, settings: Settings | null, oldOwing = 0): InvoiceData {
  const paid = Number(sale.amount_paid);
  const total = Number(sale.total);
  const balance = total - paid;
  const rate = settings ? Number(settings.exchange_rate) : 4100;
  const prevOwing = Number(oldOwing) || 0;
  const grandTotal = balance + prevOwing;
  // What the big "Amount Due" and the KHR line reflect: the grand total when
  // previous owing is folded in, otherwise this invoice's balance (or total).
  const dueBase = prevOwing > 0 ? grandTotal : balance > 0 ? balance : total;

  const items: InvoiceItemRow[] = (sale.items ?? []).map((it) => ({
    name: it.name_snapshot,
    qty: `${num(it.quantity)} ${it.unit_name ?? it.base_unit ?? "pcs"}`.trim(),
    rate: it.is_bonus ? "FREE" : money(it.price),
    amount: it.is_bonus ? "FREE" : money(it.line_total),
    free: !!it.is_bonus,
  }));

  const fields: Record<string, string> = {
    business_name: settings?.business_name || "Chomnenh",
    business_address: settings?.address || "",
    business_phone: settings?.phone || "",
    invoice_number: sale.invoice_number,
    issue_date: dayjs(sale.created_at).format("YYYY-MM-DD"),
    due_date: dayjs(sale.created_at).format("YYYY-MM-DD"),
    client_name: sale.client_name || "Walk-in customer",
    client_phone: "",
    client_address: "",
    amount_due: money(dueBase),
    subtotal: money(sale.subtotal),
    total: money(total),
    paid: money(paid),
    balance: money(balance),
    previous_owing: money(prevOwing),
    grand_total: money(grandTotal),
    cashier_name: sale.cashier_name || "",
    note: sale.note || "",
  };

  return {
    fields,
    items,
    totals: {
      subtotal: money(sale.subtotal),
      total: money(total),
      paid: money(paid),
      balance: money(balance),
      khr: `≈ ${Math.round(dueBase * rate).toLocaleString("en-US")} ៛`,
      previousOwing: money(prevOwing),
      grandTotal: money(grandTotal),
      hasOwing: prevOwing > 0,
      invoiceEmpty: (sale.items?.length ?? 0) === 0,
    },
    logoUrl: settings?.logo_url ?? null,
    khqrUrl: settings?.khqr_url ?? null,
  };
}

// Sample data for the editor preview (Settings, no real invoice yet).
export function sampleInvoiceData(settings: Settings | null): InvoiceData {
  const fields: Record<string, string> = {};
  FIELD_BINDINGS.forEach((b) => (fields[b.key] = b.sample));
  if (settings?.business_name) fields.business_name = settings.business_name;
  if (settings?.address) fields.business_address = settings.address;
  if (settings?.phone) fields.business_phone = settings.phone;
  return {
    fields,
    items: [
      { name: "ស្គ្រាប់ NC ធំ", qty: "960 កំប៉ុង", rate: "$5.30", amount: "$5,088.00", free: false },
      { name: "ស្គ្រាប់ NC ធំ", qty: "1000 កំប៉ុង", rate: "$5.30", amount: "$5,300.00", free: false },
      { name: "ប្រេង", qty: "1000 ដប", rate: "$2.90", amount: "$2,900.00", free: false },
    ],
    totals: { subtotal: "13,288.00", total: "$13,288.00", paid: "$0.00", balance: "$13,288.00", khr: "≈ 54,480,800 ៛", previousOwing: "$0.00", grandTotal: "$13,288.00", hasOwing: false, invoiceEmpty: false },
    logoUrl: settings?.logo_url ?? null,
    khqrUrl: settings?.khqr_url ?? null,
  };
}
