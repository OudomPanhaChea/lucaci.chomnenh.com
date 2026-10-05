"use client";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { TemplateElement } from "./types";
import type { InvoiceData } from "./bindings";
import ElementView from "./element-view";
import TemplateCanvas from "./template-canvas";

// Prints ONE invoice as as many A4 sheets as its line items need, the same way
// the statement paper paginates (components/paper/paginated-paper.tsx): the row
// heights are measured in a hidden pass at the real table width, then the rows
// are dealt onto sheets so none is ever cut by the page edge.
//
// A template is a freeform canvas, so the split follows the items element:
//   - everything ABOVE it (logo, business, billed-to) prints on sheet 1 only,
//   - everything BELOW it (totals, KHQR, footer) prints on the LAST sheet only,
//   - sheets 2+ open with a slim continuation line (invoice · Page x of y),
//     not the whole designed header, and the list resumes right under it.
// On every sheet but the last the list runs down to the bottom margin, so a
// long invoice leaves no empty space before it breaks.

const FLOW_BOTTOM = 1067; // lowest y the list may reach on a non-last sheet
const CONT_TOP = 100; // where the list resumes on a continuation sheet
const HINT_Y = 1078; // the "continued" line at the foot of a non-last sheet
const TOL = 4; // slack when deciding what sits below the items box
const MIN_TAIL_GAP = 24; // space kept between the last row and the totals block
const FOOT_ZONE = 1000; // a tail element this low is page furniture, never lifted

type Range = { from: number; to: number };

export default function InvoiceSheets({
  elements,
  data,
  docTitle,
  scale = 1,
}: {
  elements: TemplateElement[];
  data: InvoiceData;
  docTitle: string; // left side of the continuation line
  scale?: number;
}) {
  const itemsEl = useMemo(() => elements.find((e) => e.kind === "items") ?? null, [elements]);
  const measureRef = useRef<HTMLDivElement>(null);
  const [metrics, setMetrics] = useState<{ head: number; rows: number[] } | null>(null);
  const [, setFontsTick] = useState(0);

  // Row heights shift once the self-hosted fonts land, so measure again then
  useEffect(() => {
    let stale = false;
    document.fonts?.ready?.then(() => !stale && setFontsTick((t) => t + 1));
    return () => { stale = true; };
  }, []);

  // No dep array on purpose (like PaginatedPaper): re-measure after every
  // render, and only commit when something actually moved, so this settles.
  useLayoutEffect(() => {
    const el = measureRef.current;
    if (!el) return;
    const head = (el.querySelector("thead") as HTMLElement | null)?.offsetHeight ?? 0;
    const rows = Array.from(el.querySelectorAll("tbody tr")).map((r) => (r as HTMLElement).offsetHeight);
    setMetrics((prev) =>
      prev && prev.head === head && prev.rows.length === rows.length && prev.rows.every((v, i) => v === rows[i])
        ? prev
        : { head, rows },
    );
  });

  // The first element sitting below the items box fixes how far the list may
  // run on the last sheet (the totals block must keep its designed spot).
  const { headEls, tailEls, tailTop } = useMemo(() => {
    if (!itemsEl) return { headEls: elements, tailEls: [] as TemplateElement[], tailTop: FLOW_BOTTOM };
    const bottom = itemsEl.y + itemsEl.h;
    const tail = elements.filter((e) => e !== itemsEl && e.y >= bottom - TOL);
    const head = elements.filter((e) => e !== itemsEl && !tail.includes(e));
    return {
      headEls: head,
      tailEls: tail,
      tailTop: tail.length > 0 ? Math.min(...tail.map((e) => e.y)) : FLOW_BOTTOM,
    };
  }, [elements, itemsEl]);

  const pages = useMemo<Range[] | null>(() => {
    if (!itemsEl || !metrics || metrics.rows.length === 0) return null;
    const { head, rows } = metrics;
    const n = rows.length;
    // A sheet that carries the totals stops at tailTop; any other one may run
    // all the way to the bottom margin.
    const lastCap = (start: number) => tailTop - start;
    const fullCap = (start: number) => FLOW_BOTTOM - start;

    const out: Range[] = [];
    let i = 0;
    while (i < n) {
      const start = out.length === 0 ? itemsEl.y : CONT_TOP;
      // Do all remaining rows fit here with room left for the totals below?
      let used = head;
      let k = i;
      while (k < n && used + rows[k] <= lastCap(start)) { used += rows[k]; k += 1; }
      if (k === n) { out.push({ from: i, to: n }); i = n; break; }
      // No: fill this sheet down to the bottom margin and break the page
      used = head;
      k = i;
      while (k < n && used + rows[k] <= fullCap(start)) { used += rows[k]; k += 1; }
      // Never end a sheet on an invoice separator: the label would sit alone at
      // the foot with its lines overleaf
      if (k > i + 1 && data.items[k - 1]?.group) k -= 1;
      if (k === i) k = i + 1; // a single oversized row still gets its own sheet
      out.push({ from: i, to: k });
      i = k;
    }

    // The rows may have filled the final sheet exactly; the totals then need a
    // sheet of their own.
    const lastPage = out[out.length - 1];
    const lastStart = out.length === 1 ? itemsEl.y : CONT_TOP;
    const lastUsed = head + rows.slice(lastPage.from, lastPage.to).reduce((a, b) => a + b, 0);
    if (lastUsed > lastCap(lastStart)) out.push({ from: n, to: n });
    return out;
  }, [itemsEl, metrics, tailTop, data.items]);

  // Hidden pass: the real items markup at the real width, so wrapped product
  // names are measured as they will print. Outside any [data-paper-page] node,
  // so it never lands in an exported JPG/PDF.
  const measurePass = itemsEl ? (
    <div
      ref={measureRef}
      aria-hidden
      className="pointer-events-none invisible absolute left-0 top-0 -z-10"
      style={{ width: itemsEl.w, fontFamily: "'Fira Sans', system-ui, sans-serif" }}
    >
      <ElementView el={itemsEl} data={data} />
    </div>
  ) : null;

  // Nothing to split (no items element, empty invoice, or it fits one sheet):
  // print the template exactly as designed.
  if (!itemsEl || !metrics || !pages || pages.length <= 1) {
    return (
      <>
        {measurePass}
        <TemplateCanvas elements={elements} data={data} scale={scale} />
      </>
    );
  }

  const total = pages.length;
  const contEls = (page: number): TemplateElement[] => [
    { id: "__cont-title", kind: "text", text: docTitle, x: itemsEl.x, y: 52, w: itemsEl.w / 2, h: 18, fontSize: 11, fontWeight: 600, color: "#304A59", align: "left" },
    { id: "__cont-page", kind: "text", text: `Page ${page} of ${total}`, x: itemsEl.x + itemsEl.w / 2, y: 52, w: itemsEl.w / 2, h: 18, fontSize: 11, color: "#8a97a3", align: "right" },
    { id: "__cont-rule", kind: "line", x: itemsEl.x, y: 78, w: itemsEl.w, h: 0, color: "#e0e6ea" },
  ];

  return (
    <>
      {measurePass}
      {pages.map((range, pi) => {
        const last = pi === total - 1;
        const start = pi === 0 ? itemsEl.y : CONT_TOP;
        const els: TemplateElement[] = pi === 0 ? [...headEls] : contEls(pi + 1);
        if (range.to > range.from) {
          els.push({ ...itemsEl, y: start, h: Math.max(40, (last ? tailTop : FLOW_BOTTOM) - start) });
        }
        if (last) {
          // The last sheet's list starts at the continuation top, not at the
          // designed items y, so leaving the totals where they were designed
          // opens a hole under the rows. Slide the block below the list up to
          // sit right under the last row, keeping its designed breathing room
          // and its internal spacing. Page furniture (a footer line sitting in
          // the bottom band) stays where it belongs.
          const rowsH = metrics.rows.slice(range.from, range.to).reduce((a, b) => a + b, 0);
          const listBottom = range.to > range.from ? start + metrics.head + rowsH : start;
          const gap = Math.max(MIN_TAIL_GAP, tailTop - (itemsEl.y + itemsEl.h));
          const lift = Math.max(0, tailTop - (listBottom + gap));
          els.push(...tailEls.map((e) => (e.y >= FOOT_ZONE ? e : { ...e, y: e.y - lift })));
        } else {
          els.push({
            id: "__cont-hint", kind: "text", text: `Page ${pi + 1} of ${total}, continued`,
            x: itemsEl.x, y: HINT_Y, w: itemsEl.w, h: 16, fontSize: 10, color: "#8a97a3", align: "right",
          });
        }
        return <TemplateCanvas key={pi} elements={els} data={data} itemRange={range} scale={scale} />;
      })}
    </>
  );
}
