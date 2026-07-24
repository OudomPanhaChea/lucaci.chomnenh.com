"use client";
import type { CSSProperties } from "react";
import { DEFAULT_ITEM_LABELS, DEFAULT_TOTALS_LABELS, type TemplateElement } from "./types";
import type { InvoiceData } from "./bindings";

// Renders ONE element's content, filling its box. Positioning (absolute x/y/w/h)
// is applied by the caller (canvas or editable wrapper). Pure/read-only: the same
// component draws the editor preview and the final printed invoice.

const LABEL = "#304A59";

export default function ElementView({ el, data }: { el: TemplateElement; data: InvoiceData }) {
  const base: CSSProperties = {
    width: "100%",
    height: "100%",
    fontSize: el.fontSize ?? 13,
    fontWeight: el.fontWeight ?? 400,
    color: el.color ?? "#142332",
    textAlign: el.align ?? "left",
    lineHeight: 1.3,
    overflow: "hidden",
  };
  const labelStyle: CSSProperties = {
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
      const value = data.fields[el.binding || ""] ?? "";
      return (
        <div style={{ width: "100%", height: "100%", overflow: "hidden" }}>
          {el.label ? <div style={labelStyle}>{el.label}</div> : null}
          <div style={base}>{value || "—"}</div>
        </div>
      );
    }

    case "logo":
      return data.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={data.logoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
      ) : (
        <div style={placeholder}>Logo</div>
      );

    case "qr":
      return data.khqrUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={data.khqrUrl} alt="Payment QR" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
      ) : (
        <div style={placeholder}>KHQR<br />payment</div>
      );

    case "line":
      return (
        <div style={{ width: "100%", display: "flex", alignItems: "center", height: "100%" }}>
          <div style={{ width: "100%", borderTop: `1px solid ${el.color ?? "#e0e6ea"}` }} />
        </div>
      );

    case "items":
      return <ItemsTable el={el} data={data} />;

    case "totals":
      return <TotalsBlock el={el} data={data} />;

    default:
      return null;
  }
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

function ItemsTable({ el, data }: { el: TemplateElement; data: InvoiceData }) {
  // No rows (e.g. an owing-only statement rendered on the invoice canvas): skip
  // the table entirely rather than print a headings-only shell.
  if (data.items.length === 0) return null;
  const fs = el.fontSize ?? 13;
  const th: CSSProperties = {
    fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em",
    color: LABEL, padding: "0 8px 6px 0", borderBottom: "1px solid #d7dee2",
  };
  const td: CSSProperties = { fontSize: fs, padding: "7px 8px 7px 0", borderBottom: "1px solid #eef1f3", color: el.color ?? "#142332", verticalAlign: "top" };
  const L = el.itemLabels ?? {};
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
      <thead>
        <tr>
          <th style={{ ...th, textAlign: "left", width: "44%" }}>{L.description ?? DEFAULT_ITEM_LABELS.description}</th>
          <th style={{ ...th, textAlign: "right" }}>{L.rate ?? DEFAULT_ITEM_LABELS.rate}</th>
          <th style={{ ...th, textAlign: "right" }}>{L.qty ?? DEFAULT_ITEM_LABELS.qty}</th>
          <th style={{ ...th, textAlign: "right", paddingRight: 0 }}>{L.total ?? DEFAULT_ITEM_LABELS.total}</th>
        </tr>
      </thead>
      <tbody>
        {data.items.map((it, i) => (
          <tr key={i}>
            <td style={{ ...td, fontWeight: 500 }}>{it.name}</td>
            <td style={{ ...td, textAlign: "right" }}>{it.rate}</td>
            <td style={{ ...td, textAlign: "right" }}>{it.qty}</td>
            <td style={{ ...td, textAlign: "right", paddingRight: 0, fontWeight: 500 }}>{it.amount}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TotalsBlock({ el, data }: { el: TemplateElement; data: InvoiceData }) {
  const fs = el.fontSize ?? 13;
  const row: CSSProperties = { display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: fs, color: "#5b6b7a" };
  const grand: CSSProperties = { ...row, marginTop: 4, paddingTop: 8, borderTop: `2px solid ${LABEL}`, color: LABEL, fontWeight: 700, fontSize: fs + 2 };
  // Show a paid line + Balance Due when the invoice isn't fully paid at $0;
  // otherwise a single Total (matches how invoices read). When previous owing is
  // folded in, the invoice's own figure becomes a plain row and the emphasized
  // grand row is the Grand Total Owing (balance + previous owing).
  const hasPaid = data.totals.paid && data.totals.paid !== "$0.00";
  const hasOwing = data.totals.hasOwing;
  const L = el.totalsLabels ?? {};
  const invoiceLabel = hasPaid ? (L.balance ?? DEFAULT_TOTALS_LABELS.balance) : (L.total ?? DEFAULT_TOTALS_LABELS.total);
  const invoiceValue = hasPaid ? data.totals.balance : data.totals.total;

  // Owing-only statement (no line items): show just the owing, no $0 rows.
  if (hasOwing && data.totals.invoiceEmpty) {
    return (
      <div style={{ width: "100%", color: el.color ?? "#142332" }}>
        <div style={row}><span>Previous Owing</span><span>{data.totals.previousOwing}</span></div>
        <div style={grand}><span>Grand Total Owing</span><span>{data.totals.grandTotal}</span></div>
      </div>
    );
  }
  return (
    <div style={{ width: "100%", color: el.color ?? "#142332" }}>
      <div style={row}><span>{L.subtotal ?? DEFAULT_TOTALS_LABELS.subtotal}</span><span>{data.totals.subtotal}</span></div>
      {hasPaid && (
        <div style={row}><span>{L.paid ?? DEFAULT_TOTALS_LABELS.paid}</span><span>− {data.totals.paid}</span></div>
      )}
      {hasOwing ? (
        <>
          <div style={row}><span>{invoiceLabel}</span><span>{invoiceValue}</span></div>
          <div style={row}><span>Previous Owing</span><span>{data.totals.previousOwing}</span></div>
          <div style={grand}><span>Grand Total Owing</span><span>{data.totals.grandTotal}</span></div>
        </>
      ) : (
        <div style={grand}><span>{invoiceLabel}</span><span>{invoiceValue}</span></div>
      )}
    </div>
  );
}
