// Freeform invoice-template model. A template is a list of absolutely-positioned
// elements on an A4 canvas (CANVAS_W x CANVAS_H css px at 96dpi). Coordinates and
// sizes are always in that fixed space; the editor may render scaled but stores
// real coordinates, so the printed sheet is pixel-identical to the design.

export const CANVAS_W = 794;
export const CANVAS_H = 1123;

// Every element kind the builder can place.
export type ElementKind =
  | "text" // static, editable text
  | "field" // a dynamic value bound to the invoice (see FIELD_BINDINGS)
  | "logo" // the business logo image
  | "qr" // the uploaded KHQR payment image
  | "items" // the line-items table
  | "totals" // subtotal / total / paid / balance block
  | "line"; // a horizontal divider rule

export type Align = "left" | "center" | "right";

export interface TemplateElement {
  id: string;
  kind: ElementKind;
  x: number;
  y: number;
  w: number;
  h: number;
  // presentation (all optional, sensible defaults per kind)
  fontSize?: number;
  fontWeight?: 400 | 500 | 600 | 700;
  align?: Align;
  color?: string;
  // content
  text?: string; // kind = text
  binding?: string; // kind = field (key into FIELD_BINDINGS)
  label?: string; // small caption printed above a field / block
  // Customizable captions so a template can be translated (e.g. Khmer). Any
  // omitted key falls back to the English default at render time.
  itemLabels?: ItemLabels; // kind = items (column headings)
  totalsLabels?: TotalsLabels; // kind = totals (row captions)
}

// Column headings for the line-items table.
export interface ItemLabels {
  description?: string;
  rate?: string;
  qty?: string;
  total?: string;
}

// Row captions for the totals block.
export interface TotalsLabels {
  subtotal?: string;
  paid?: string;
  balance?: string;
  total?: string;
}

// English defaults, used when a label is not overridden.
export const DEFAULT_ITEM_LABELS: Required<ItemLabels> = {
  description: "Description",
  rate: "Rate",
  qty: "Qty",
  total: "Line Total",
};
export const DEFAULT_TOTALS_LABELS: Required<TotalsLabels> = {
  subtotal: "Subtotal",
  paid: "Paid",
  balance: "Balance Due",
  total: "Total",
};

export interface InvoiceTemplate {
  id: number;
  name: string;
  is_default: 0 | 1 | boolean;
  elements: TemplateElement[];
}

// The dynamic values a `field` element can bind to. label = default caption.
export const FIELD_BINDINGS: { key: string; label: string; sample: string }[] = [
  { key: "business_name", label: "Business", sample: "Lucaci" },
  { key: "business_address", label: "Address", sample: "Phnom Penh" },
  { key: "business_phone", label: "Tel", sample: "012 345 678" },
  { key: "invoice_number", label: "Invoice Number", sample: "168" },
  { key: "issue_date", label: "Date of Issue", sample: "2026-07-22" },
  { key: "due_date", label: "Due Date", sample: "2026-07-22" },
  { key: "client_name", label: "Billed To", sample: "Sun Vireak" },
  { key: "client_phone", label: "Client phone", sample: "011 222 333" },
  { key: "client_address", label: "Client address", sample: "Toul Kork" },
  { key: "amount_due", label: "Amount Due (USD)", sample: "$13,000.00" },
  { key: "subtotal", label: "Subtotal", sample: "13,000.00" },
  { key: "total", label: "Total", sample: "$13,000.00" },
  { key: "paid", label: "Paid", sample: "$0.00" },
  { key: "balance", label: "Balance Due", sample: "$13,000.00" },
  { key: "previous_owing", label: "Previous Owing", sample: "$1,000.00" },
  { key: "grand_total", label: "Grand Total Owing", sample: "$14,000.00" },
  { key: "cashier_name", label: "Issued by", sample: "Lucaci" },
  { key: "note", label: "Note", sample: "Thank you for your business." },
];

export const bindingLabel = (key: string) =>
  FIELD_BINDINGS.find((b) => b.key === key)?.label ?? key;
