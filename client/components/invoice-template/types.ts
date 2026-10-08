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
  | "photo" // an image the template itself carries (a signature, a stamp, a seal)
  | "qr" // the uploaded KHQR payment image
  | "items" // the line-items table
  | "totals" // subtotal / total / paid / balance block
  | "line"; // a horizontal divider rule

export type Align = "left" | "center" | "right";
export type LabelPosition = "top" | "inline";

export interface TemplateElement {
  id: string;
  kind: ElementKind;
  x: number;
  y: number;
  w: number;
  h: number;
  // presentation (all optional, sensible defaults per kind)
  fontFamily?: string; // key into INVOICE_FONTS (lib/invoice-fonts.ts); unset = the sheet font
  fontSize?: number;
  fontWeight?: 400 | 500 | 600 | 700;
  align?: Align;
  color?: string;
  // content
  text?: string; // kind = text
  binding?: string; // kind = field (key into FIELD_BINDINGS)
  // kind = photo. The uploaded image, as the /uploads/img/:id URL the upload
  // endpoint returned. It belongs to THIS element, not to the business: the
  // logo and the KHQR come from Settings and are the same on every template,
  // while a signature or a stamp is part of one template's layout.
  imageUrl?: string;
  label?: string; // small caption printed with a field / block
  // Where that caption sits: "top" (default) puts it on its own line above the
  // value, "inline" prints caption and value on ONE line.
  labelPosition?: LabelPosition;
  // kind = field, binding in DATE_BINDINGS. How the date is written out (see
  // lib/invoice-date.ts): literal text plus # tokens. Unset = the default
  // pattern, so a template saved before this existed still prints a date.
  dateFormat?: string;
  // Customizable captions so a template can be translated (e.g. Khmer). Any
  // omitted key falls back to the English default at render time.
  itemLabels?: ItemLabels; // kind = items (column headings)
  itemColumns?: ItemColumns; // kind = items (which columns print, and how wide)
  itemHead?: ItemHeadStyle; // kind = items (how the heading row is set)
  totalsLabels?: TotalsLabels; // kind = totals (LEGACY row captions, see TotalsRow)
  // kind = totals. The rows the block prints, in order. Unset = DEFAULT_TOTALS_ROWS,
  // which reproduces the block's original hardcoded behaviour, so a template saved
  // before this existed keeps printing exactly as it did.
  totalsRows?: TotalsRow[];
}

// How the items table draws its heading ROW. The element-level Style controls
// (font, size, weight, colour) describe the line-item ROWS, so before this the
// heading was stuck at a hardcoded 10px semibold uppercase #304A59 whatever the
// body did. A bilingual heading in particular needs its own size: Khmer set at
// the Latin heading size reads small, and the sub-line under it smaller still.
// The font FAMILY is deliberately not here: it comes from the element, so the
// whole table stays one typeface.
export interface ItemHeadStyle {
  fontSize?: number; // default 10
  fontWeight?: 400 | 500 | 600 | 700; // default 600
  color?: string; // default the brand ink used for captions
  uppercase?: boolean; // default true; off for a Khmer heading, which has no case
  subFontSize?: number; // the second line; default = fontSize - 0.5
}
export const DEFAULT_ITEM_HEAD: Required<Omit<ItemHeadStyle, "subFontSize">> = {
  fontSize: 10,
  fontWeight: 600,
  color: "#304A59",
  uppercase: true,
};
// The sub-line tracks the heading unless the template pins it, so raising the
// heading size does not leave a translation stranded at its old size.
export const subHeadSize = (h: ItemHeadStyle | undefined) =>
  h?.subFontSize ?? Math.max(6, (h?.fontSize ?? DEFAULT_ITEM_HEAD.fontSize) - 0.5);

// Which line-item columns print and how the width is split. Description takes
// `descWidth` percent; the columns that remain share what is left, so hiding one
// widens the others instead of leaving a gap.
export interface ItemColumns {
  descWidth?: number; // percent, default 44
  rate?: boolean; // default true
  qty?: boolean; // default true
  total?: boolean; // default true
}
export const DEFAULT_ITEM_COLUMNS: Required<ItemColumns> = {
  descWidth: 44,
  rate: true,
  qty: true,
  total: true,
};

// Column headings for the line-items table.
//
// Each column can print a SECOND line under its heading, so a table can carry a
// translation ("Description" over "បរិយាយ") without needing two tables. Both
// lines are free text, which is what lets either language be the one on top:
// type the Khmer in the heading and the English in the sub-line to flip them.
// A sub-line left empty prints nothing at all, so this costs a template that
// does not use it exactly one line of height: none.
export interface ItemLabels {
  description?: string;
  rate?: string;
  qty?: string;
  total?: string;
  description2?: string;
  rate2?: string;
  qty2?: string;
  total2?: string;
}

// The four columns, and the two keys each one's heading is written from. One
// definition so the renderer and the property panel cannot disagree about which
// sub-line belongs to which column.
export const ITEM_COLUMN_KEYS = [
  { col: "description", sub: "description2" },
  { col: "rate", sub: "rate2" },
  { col: "qty", sub: "qty2" },
  { col: "total", sub: "total2" },
] as const satisfies readonly { col: keyof ItemLabels; sub: keyof ItemLabels }[];

// Row captions for the totals block.
export interface TotalsLabels {
  subtotal?: string;
  paid?: string;
  balance?: string;
  total?: string;
}

// English defaults, used when a label is not overridden.
// Only the first line has a default: a sub-line is opt-in, so its absence is
// the normal case and must not be filled in with a guess.
export const DEFAULT_ITEM_LABELS = {
  description: "Description",
  rate: "Rate",
  qty: "Qty",
  total: "Line Total",
} as const;
export const DEFAULT_TOTALS_LABELS: Required<TotalsLabels> = {
  subtotal: "Subtotal",
  paid: "Paid",
  balance: "Balance Due",
  total: "Total",
};

// ---------------------------------------------------------------------------
// Totals rows
//
// The totals block used to be a hardcoded ladder (subtotal, maybe paid, one
// emphasized figure) with only its captions translatable. It is now a LIST the
// template owns: which rows print, in what order, under what caption, and which
// one carries the closing rule.
//
// WHAT YOU SEE IS WHAT PRINTS. A ticked row prints on every invoice, with the
// caption you gave it, even when its figure is $0.00 — nothing appears, hides
// or renames itself based on the invoice. An earlier version had a per-row
// "auto" mode that did exactly that, and it made the editor a bad promise: a
// template previewing Subtotal / Total / Total (KHR) printed Subtotal /
// Discount / Paid / Balance Due. Do not reintroduce it.
//
// A template still chooses how money is PRESENTED, never what it is: every
// value stays bound to the invoice.
// ---------------------------------------------------------------------------

export type TotalsRowKey =
  | "subtotal"
  | "discount"
  | "tax"
  | "total"
  | "total_khr"
  | "paid"
  | "balance"
  | "balance_khr"
  | "previous_owing"
  | "grand_total"
  | "grand_total_khr";

export interface TotalsRow {
  key: TotalsRowKey;
  label?: string; // caption override; unset = the default for the key
  show?: boolean; // unset = the default for the key (see DEFAULT_TOTALS_ROWS)
  emphasis?: boolean; // the ruled, bold closing row
}

// Captions when a row does not override them. Each riel row converts the USD
// row it is named after, so the pair on the sheet always agrees.
export const TOTALS_ROW_LABELS: Record<TotalsRowKey, string> = {
  subtotal: "Subtotal",
  discount: "Discount",
  tax: "Tax",
  total: "Total",
  total_khr: "Total (KHR)",
  paid: "Paid",
  balance: "Balance Due",
  balance_khr: "Balance Due (KHR)",
  previous_owing: "Previous Owing",
  grand_total: "Grand Total",
  grand_total_khr: "Grand Total (KHR)",
};

// The block a template starts with, in ladder order: what was billed, then the
// debt carried in, then the whole bill, then what was paid, then what is left.
// Previous Owing and Grand Total are off because most invoices carry no earlier
// debt (with none, Grand Total would just repeat Total); the client-details
// paper turns them on for the one print where the user ticks "Include previous
// owing" (see withOwingRows in totals-rows.ts), and they land in the right place
// because of this order.
export const DEFAULT_TOTALS_ROWS: TotalsRow[] = [
  { key: "subtotal", show: true },
  { key: "discount", show: true },
  { key: "tax", show: false },
  { key: "total", show: true },
  { key: "total_khr", show: false },
  { key: "previous_owing", show: false },
  { key: "grand_total", show: false },
  { key: "grand_total_khr", show: false },
  { key: "paid", show: true },
  { key: "balance", show: true, emphasis: true },
  { key: "balance_khr", show: true },
];

export interface InvoiceTemplate {
  id: number;
  name: string;
  is_default: 0 | 1 | boolean;
  kind?: TemplateKind;
  elements: TemplateElement[];
}

// 'invoice' layouts print invoices; 'bonus' layouts print bonus awards.
export type TemplateKind = "invoice" | "bonus";

// The dynamic values a `field` element can bind to. label = default caption.
export const FIELD_BINDINGS: { key: string; label: string; sample: string }[] = [
  { key: "business_name", label: "Business", sample: "Lucaci" },
  { key: "business_address", label: "Address", sample: "Phnom Penh" },
  { key: "business_phone", label: "Tel", sample: "012 345 678" },
  { key: "invoice_number", label: "Invoice Number", sample: "INV-20260722-0001" },
  { key: "issue_date", label: "Date of Issue", sample: "2026-07-22" },
  { key: "due_date", label: "Due Date", sample: "2026-07-22" },
  { key: "client_name", label: "Billed To", sample: "Sun Vireak" },
  { key: "client_phone", label: "Client phone", sample: "011 222 333" },
  { key: "client_address", label: "Client address", sample: "Toul Kork" },
  { key: "amount_due", label: "Amount Due (USD)", sample: "$13,000.00" },
  { key: "amount_due_khr", label: "Amount Due (KHR)", sample: "53,300,000 ៛" },
  { key: "subtotal", label: "Subtotal", sample: "$13,000.00" },
  { key: "discount", label: "Discount", sample: "$0.00" },
  { key: "tax", label: "Tax", sample: "$0.00" },
  { key: "total", label: "Total", sample: "$13,000.00" },
  { key: "paid", label: "Paid", sample: "$0.00" },
  { key: "balance", label: "Balance Due", sample: "$13,000.00" },
  { key: "previous_owing", label: "Previous Owing", sample: "$1,000.00" },
  { key: "grand_total", label: "Grand Total", sample: "$14,000.00" },
  { key: "grand_total_khr", label: "Grand Total (KHR)", sample: "57,400,000 ៛" },
  { key: "total_khr", label: "Total (KHR)", sample: "53,300,000 ៛" },
  { key: "balance_khr", label: "Balance Due (KHR)", sample: "53,300,000 ៛" },
  { key: "exchange_rate", label: "Exchange rate", sample: "4,100 ៛ / $1" },
  { key: "cashier_name", label: "Issued by", sample: "Lucaci" },
  { key: "note", label: "Note", sample: "Thank you for your business." },
];

// Bindings whose value is a DATE, not a string: they render through the
// element's own `dateFormat` pattern instead of printing a stored string, which
// is what lets one template say "03/09/2026" and another "ថ្ងៃទី 3 ខែ 9 ឆ្នាំ 2026".
export const DATE_BINDINGS = new Set(["issue_date", "due_date"]);

export const bindingLabel = (key: string) =>
  FIELD_BINDINGS.find((b) => b.key === key)?.label ?? key;
