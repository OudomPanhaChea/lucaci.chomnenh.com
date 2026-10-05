"use client";
import type { CSSProperties } from "react";
import {
  DATE_BINDINGS,
  DEFAULT_ITEM_COLUMNS,
  DEFAULT_ITEM_HEAD,
  DEFAULT_ITEM_LABELS,
  subHeadSize,
  type ItemColumns,
  type TemplateElement,
} from "./types";
import { formatInvoiceDate } from "@/lib/invoice-date";
import { resolveTotalsRows } from "./totals-rows";
import { fontStack } from "@/lib/invoice-fonts";
import type { InvoiceData } from "./bindings";

// Renders ONE element's content, filling its box. Positioning (absolute x/y/w/h)
// is applied by the caller (canvas or editable wrapper). Pure/read-only: the same
// component draws the editor preview and the final printed invoice.

const LABEL = "#304A59";

// Figures line up column-wise and never break across the gap that separates
// them from their caption, however long the caption gets.
const FIGURE: CSSProperties = {
  whiteSpace: "nowrap",
  fontVariantNumeric: "tabular-nums",
};

export default function ElementView({
  el,
  data,
  itemRange,
  placeholders = false,
}: {
  el: TemplateElement;
  data: InvoiceData;
  // Slice of the line items to draw (kind = "items"), set when the invoice
  // paginates onto several sheets. Undefined = the whole list.
  itemRange?: { from: number; to: number };
  // Draw a stand-in for an empty value (an em dash, a dashed "Logo" box). Only
  // the EDITOR asks for these: they exist so an element that happens to be
  // empty can still be seen and grabbed on the canvas. A printed invoice never
  // shows them, because an optional field left blank (a walk-in customer with
  // no address) must print as nothing, not as a dash the customer has to
  // interpret.
  placeholders?: boolean;
}) {
  const font = fontStack(el.fontFamily);
  const base: CSSProperties = {
    width: "100%",
    height: "100%",
    fontFamily: font,
    fontSize: el.fontSize ?? 13,
    fontWeight: el.fontWeight ?? 400,
    color: el.color ?? "#142332",
    textAlign: el.align ?? "left",
    lineHeight: 1.3,
    overflow: "hidden",
    // A long value (a joined invoice number, a Khmer product name) reflows
    // inside its box instead of running out of it.
    overflowWrap: "anywhere",
  };
  const labelStyle: CSSProperties = {
    fontFamily: font,
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: LABEL,
    textAlign: el.align ?? "left",
    marginBottom: 3,
  };

  switch (el.kind) {
    case "text":
      return <div style={{ ...base, whiteSpace: "pre-wrap" }}>{el.text || " "}</div>;

    case "field": {
      const value = fieldValue(el, data);
      const blank = placeholders ? "—" : "";
      // "inline": caption and value share one line, the pair following the
      // element's own alignment. Otherwise the caption sits above the value.
      if (el.label && el.labelPosition === "inline") {
        const justify = el.align === "right" ? "flex-end" : el.align === "center" ? "center" : "flex-start";
        return (
          <div
            style={{
              width: "100%", height: "100%", overflow: "hidden", display: "flex",
              alignItems: "baseline", gap: 6, justifyContent: justify,
              flexWrap: "wrap",
            }}
          >
            <span style={{ ...labelStyle, marginBottom: 0, flexShrink: 0 }}>{el.label}</span>
            <span style={{ ...base, width: "auto", height: "auto", minWidth: 0 }}>{value || blank}</span>
          </div>
        );
      }
      return (
        <div style={{ width: "100%", height: "100%", overflow: "hidden" }}>
          {el.label ? <div style={labelStyle}>{el.label}</div> : null}
          <div style={base}>{value || blank}</div>
        </div>
      );
    }

    case "logo":
      return data.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={data.logoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
      ) : placeholders ? (
        <div style={placeholder}>Logo</div>
      ) : null;

    // An image the template carries itself: a scanned signature, a stamp, a
    // seal. Always "contain", never "cover": a signature that has been cropped
    // to fill its box is a different signature.
    case "photo":
      return el.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={el.imageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
      ) : placeholders ? (
        <div style={placeholder}>Photo</div>
      ) : null;

    case "qr":
      return data.khqrUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={data.khqrUrl} alt="Payment QR" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
      ) : placeholders ? (
        <div style={placeholder}>KHQR<br />payment</div>
      ) : null;

    case "line":
      return (
        <div style={{ width: "100%", display: "flex", alignItems: "center", height: "100%" }}>
          <div style={{ width: "100%", borderTop: `1px solid ${el.color ?? "#e0e6ea"}` }} />
        </div>
      );

    case "items":
      return <ItemsTable el={el} data={data} range={itemRange} />;

    case "totals":
      return <TotalsBlock el={el} data={data} />;

    default:
      return null;
  }
}

// A date binding writes itself out from the raw calendar day with the
// element's own pattern, so the same invoice can print "03/09/2026" on one
// template and "ថ្ងៃទី 3 ខែ 9 ឆ្នាំ 2026" on another. Every other binding is
// already a resolved string.
function fieldValue(el: TemplateElement, data: InvoiceData): string {
  const key = el.binding || "";
  if (DATE_BINDINGS.has(key)) {
    const raw = data.dates?.[key as keyof InvoiceData["dates"]];
    if (raw) return formatInvoiceDate(raw, el.dateFormat);
  }
  return data.fields[key] ?? "";
}

const placeholder: CSSProperties = {
  width: "100%",
  height: "100%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  textAlign: "center",
  border: "1px dashed #b8c2ca",
  borderRadius: 6,
  color: "#8a97a3",
  fontSize: 11,
  background: "#f6f8f9",
};

// Which columns this table prints and how wide they are. Description takes its
// configured share; whatever columns remain split the rest evenly, so hiding a
// column widens the others instead of leaving a hole.
export function itemColumnPlan(cfg: ItemColumns | undefined) {
  const c = { ...DEFAULT_ITEM_COLUMNS, ...cfg };
  const rest = (["rate", "qty", "total"] as const).filter((k) => c[k]);
  const desc = Math.max(15, Math.min(90, c.descWidth));
  const each = rest.length > 0 ? (100 - desc) / rest.length : 0;
  return { desc, rest, each };
}

function ItemsTable({
  el,
  data,
  range,
}: {
  el: TemplateElement;
  data: InvoiceData;
  range?: { from: number; to: number };
}) {
  // No rows at all (lucaci's owing-only paper, or every invoice carried into
  // previous owing): skip the table rather than print a headings-only shell.
  if (data.items.length === 0) return null;
  const fs = el.fontSize ?? 13;
  const font = fontStack(el.fontFamily);
  // On a continuation sheet only this page's rows are drawn; the column
  // headings are re-printed so the list stays readable after a page break.
  const rows = range ? data.items.slice(range.from, range.to) : data.items;
  // The heading row is set by the element's own Heading controls (the Style
  // section describes the line-item ROWS). Uppercasing is a choice, not a rule:
  // Khmer has no case, so forcing it there only widens the Latin half of a
  // bilingual pair. Letter-spacing follows the choice, since the tracking that
  // makes small caps legible is wrong for mixed-case text.
  const H = el.itemHead ?? {};
  const upper = H.uppercase ?? DEFAULT_ITEM_HEAD.uppercase;
  const headColor = H.color ?? DEFAULT_ITEM_HEAD.color;
  const th: CSSProperties = {
    fontSize: H.fontSize ?? DEFAULT_ITEM_HEAD.fontSize,
    fontWeight: H.fontWeight ?? DEFAULT_ITEM_HEAD.fontWeight,
    textTransform: upper ? "uppercase" : "none",
    letterSpacing: upper ? "0.06em" : "0.01em",
    color: headColor, padding: "0 8px 6px 0", borderBottom: "1px solid #d7dee2",
  };
  // The optional second heading line (a translation of the column name). It is
  // never uppercased and always one step lighter than the heading, so the pair
  // reads as one label with a subordinate line rather than as two headings. Its
  // size tracks the heading unless the template pins it. It shares the heading's
  // alignment, so the two lines stack and never straddle.
  const th2: CSSProperties = {
    fontSize: subHeadSize(H),
    fontWeight: Math.max(400, (H.fontWeight ?? DEFAULT_ITEM_HEAD.fontWeight) - 100),
    letterSpacing: "0.02em", textTransform: "none",
    color: headColor, opacity: 0.75, marginTop: 2,
  };
  const td: CSSProperties = { fontSize: fs, padding: "7px 8px 7px 0", borderBottom: "1px solid #eef1f3", color: el.color ?? "#142332", verticalAlign: "top" };
  const L = el.itemLabels ?? {};
  const { desc, rest, each } = itemColumnPlan(el.itemColumns);
  const cellOf: Record<(typeof rest)[number], (it: InvoiceData["items"][number]) => string> = {
    rate: (it) => it.rate,
    qty: (it) => it.qty,
    total: (it) => it.amount,
  };
  const headOf = {
    rate: L.rate ?? DEFAULT_ITEM_LABELS.rate,
    qty: L.qty ?? DEFAULT_ITEM_LABELS.qty,
    total: L.total ?? DEFAULT_ITEM_LABELS.total,
  };
  const subOf = { rate: L.rate2, qty: L.qty2, total: L.total2 };
  // A heading is its own line plus, when the template gives it one, a second
  // under it. Empty or whitespace-only means the column has no sub-line and
  // nothing is rendered, so the header row keeps its single-line height.
  const heading = (main: string, sub?: string) => (
    <>
      <div>{main}</div>
      {sub?.trim() ? <div style={th2}>{sub}</div> : null}
    </>
  );
  const span = 1 + rest.length;

  return (
    <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed", fontFamily: font }}>
      <thead>
        <tr>
          <th style={{ ...th, textAlign: "left", width: `${desc}%` }}>
            {heading(L.description ?? DEFAULT_ITEM_LABELS.description, L.description2)}
          </th>
          {rest.map((k, i) => (
            <th
              key={k}
              style={{ ...th, textAlign: "right", width: `${each}%`, paddingRight: i === rest.length - 1 ? 0 : 8 }}
            >
              {heading(headOf[k], subOf[k])}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((it, i) =>
          it.group ? (
            // Separator naming the invoice the following lines came from
            // (several invoices printed as one paper)
            <tr key={i}>
              <td
                colSpan={span}
                style={{
                  fontSize: 10.5, fontWeight: 700, letterSpacing: "0.06em", color: LABEL,
                  paddingTop: i === 0 ? 6 : 14, paddingBottom: 5,
                  borderBottom: "1px solid #d7dee2",
                }}
              >
                {it.group}
              </td>
            </tr>
          ) : (
            <tr key={i}>
              <td style={{ ...td, fontWeight: 500, overflowWrap: "anywhere" }}>{it.name}</td>
              {rest.map((k, ci) => (
                <td
                  key={k}
                  style={{
                    ...td, ...FIGURE, textAlign: "right",
                    paddingRight: ci === rest.length - 1 ? 0 : 8,
                    fontWeight: k === "total" ? 500 : 400,
                  }}
                >
                  {cellOf[k](it)}
                </td>
              ))}
            </tr>
          ),
        )}
      </tbody>
    </table>
  );
}

// The totals block is a LIST the template owns (see totals-rows.ts): which rows
// print, in what order, under what caption, and which one carries the closing
// rule. Rows lay out as flex pairs, so a long or translated caption wraps in its
// own column instead of colliding with the figure beside it.
function TotalsBlock({ el, data }: { el: TemplateElement; data: InvoiceData }) {
  const fs = el.fontSize ?? 13;
  const font = fontStack(el.fontFamily);
  const rows = resolveTotalsRows(el, data.totals).filter((r) => r.visible);

  const row: CSSProperties = {
    display: "flex", justifyContent: "space-between", alignItems: "baseline",
    gap: 12, padding: "4px 0", fontSize: fs, color: "#5b6b7a",
  };
  const emph: CSSProperties = {
    ...row, marginTop: 4, paddingTop: 8, borderTop: `2px solid ${LABEL}`,
    color: LABEL, fontWeight: 700, fontSize: fs + 2,
  };

  return (
    <div style={{ width: "100%", color: el.color ?? "#142332", fontFamily: font }}>
      {rows.map((r, i) => {
        // A row directly under the closing rule reads as its companion (the
        // riel line under the grand total), so it keeps the emphasis colour
        // without repeating the rule.
        const trails = i > 0 && rows[i - 1].emphasis && !r.emphasis;
        return (
          <div
            key={r.key}
            style={{
              ...(r.emphasis ? emph : row),
              ...(trails ? { color: LABEL, paddingTop: 0 } : null),
            }}
          >
            <span style={{ flex: "1 1 auto", minWidth: 0, overflowWrap: "anywhere" }}>{r.label}</span>
            <span style={{ ...FIGURE, flex: "0 0 auto" }}>{r.value}</span>
          </div>
        );
      })}
    </div>
  );
}
