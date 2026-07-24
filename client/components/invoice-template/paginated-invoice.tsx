"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { CANVAS_W, CANVAS_H, type TemplateElement } from "./types";
import type { InvoiceData } from "./bindings";
import ElementView from "./element-view";

// Renders an invoice template (fixed absolutely-positioned A4 canvas) but lets the
// line-items table grow with the number of rows, receipt-style: rows flow down the
// sheet filling it to the bottom, spilling onto the next A4 sheet only once they
// reach the bottom. The totals block follows right after the last row (so its
// position depends on the table length), while any element anchored near the page
// bottom (a footer note / terms) stays put and prints on the last sheet only.
// A continued sheet repeats NO header and starts its rows near the top, so there
// is no large empty band. Row heights are measured in a hidden pass (like
// components/paper/paginated-paper.tsx) so nothing is cut by the page edge. A
// normal-length invoice yields a single sheet.

const SAFETY = 12; // slack for sub-pixel rounding / late font metrics
const PAGE_MARGIN = 48; // bottom margin rows fill down to on non-footer sheets
const ANCHOR_ZONE = 170; // an element whose bottom is within this of the page bottom stays anchored
const FOOTER_GAP = 24; // min gap between the hugged totals block and an anchored bottom element

// One absolutely-positioned element box. `dy` shifts it vertically (used to raise
// the items table on continued sheets and to push the totals block down to follow
// the real table height); `autoHeight` lets a box (the items table) take its
// natural content height instead of the template's fixed height.
function Abs({
  el, dy = 0, autoHeight = false, children,
}: {
  el: TemplateElement; dy?: number; autoHeight?: boolean; children: React.ReactNode;
}) {
  return (
    <div
      style={{
        position: "absolute",
        left: el.x,
        top: el.y + dy,
        width: el.w,
        height: autoHeight ? undefined : el.h,
      }}
    >
      {children}
    </div>
  );
}

type Layout = { pages: number[][]; theadH: number; rowH: number[] };

export default function PaginatedInvoice({
  elements,
  data,
  scale = 1,
}: {
  elements: TemplateElement[];
  data: InvoiceData;
  scale?: number;
}) {
  const itemsEl = elements.find((e) => e.kind === "items") ?? null;
  const measureRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<Layout | null>(null);
  const [, setFontsTick] = useState(0);

  const nItems = data.items.length;

  // Re-measure once the self-hosted fonts finish loading (metrics can shift,
  // especially for Khmer names that wrap onto more lines).
  useEffect(() => {
    let stale = false;
    document.fonts?.ready?.then(() => !stale && setFontsTick((t) => t + 1));
    return () => {
      stale = true;
    };
  }, []);

  // --- Geometry (pure from the template, independent of measurement) ---
  const itemsY = itemsEl ? itemsEl.y : Infinity;
  const itemsBoxBottom = itemsEl ? itemsEl.y + itemsEl.h : 0;
  const headerEls = elements.filter((e) => e !== itemsEl && e.y < itemsY);
  const belowItems = elements.filter((e) => e !== itemsEl && e.y >= itemsY);
  // Elements sitting near the page bottom (a footer note / terms) stay ANCHORED at
  // their y on the last sheet; the rest (totals, QR) FLOW right after the rows.
  const anchoredEls = belowItems.filter((e) => CANVAS_H - (e.y + e.h) < ANCHOR_ZONE);
  const flowEls = belowItems.filter((e) => !anchoredEls.includes(e));
  const flowBottom = flowEls.length ? Math.max(...flowEls.map((e) => e.y + e.h)) : itemsBoxBottom;
  const flowReserve = Math.max(0, flowBottom - itemsBoxBottom); // space the totals need below the rows
  const anchoredTop = anchoredEls.length ? Math.min(...anchoredEls.map((e) => e.y)) : CANVAS_H;

  // Continued sheets carry no header, so their rows start at the template's top
  // margin (the header block's top) instead of the items-table position.
  const contentTop = itemsEl ? Math.min(itemsY, ...headerEls.map((e) => e.y)) : 0;
  const pageTop = (idx: number) => (idx === 0 ? itemsY : contentTop);

  useLayoutEffect(() => {
    if (!itemsEl || nItems === 0) {
      setLayout((prev) => (prev === null ? prev : null));
      return;
    }
    const root = measureRef.current;
    if (!root) return;
    const thead = root.querySelector("thead") as HTMLElement | null;
    const trs = Array.from(root.querySelectorAll("tbody > tr")) as HTMLElement[];
    if (trs.length !== nItems) return; // hidden pass not rendered yet
    const theadH = thead?.offsetHeight ?? 0;
    const rowH = trs.map((tr) => tr.offsetHeight);

    const fillBottom = CANVAS_H - PAGE_MARGIN;
    // A sheet's rows may fill down to `fillBottom`, except the sheet that carries
    // the totals: its rows must stop short enough that the hugged totals block
    // (flowReserve tall) still clears any anchored bottom note.
    const rowBottom = (isFooter: boolean) =>
      isFooter ? Math.min(fillBottom, anchoredTop - FOOTER_GAP) - flowReserve : fillBottom;
    const budgetOf = (idx: number, isFooter: boolean) =>
      rowBottom(isFooter) - pageTop(idx) - theadH - SAFETY;

    // Pack rows into exactly `nPages` sheets, the LAST of which carries the totals
    // (so it uses the smaller footer budget); earlier sheets fill to the bottom.
    // Returns null if the rows don't fit in nPages sheets (caller tries more).
    const tryPack = (nPages: number): number[][] | null => {
      const pages: number[][] = [];
      let cur: number[] = [];
      let used = 0;
      for (let i = 0; i < nItems; i++) {
        const idx = pages.length;
        const budget = budgetOf(idx, idx === nPages - 1);
        const need = data.items[i].heading ? rowH[i] + (rowH[i + 1] ?? 0) : rowH[i];
        if (cur.length > 0 && used + need > budget) {
          pages.push(cur);
          cur = [];
          used = 0;
          if (pages.length > nPages - 1) return null; // overflowed the allowed sheets
        }
        cur.push(i);
        used += rowH[i];
      }
      pages.push(cur);
      if (pages.length > nPages) return null;
      // Fewer sheets used than allowed → the totals ride a footer-only trailing
      // sheet (keeps the rows sheet full instead of capping it short).
      while (pages.length < nPages) pages.push([]);
      return pages;
    };

    // Smallest number of sheets that fits: a single hugged sheet if it can, else
    // grow one sheet at a time.
    let pages: number[][] | null = null;
    for (let np = 1; np <= nItems + 1; np++) {
      pages = tryPack(np);
      if (pages) break;
    }
    if (!pages) pages = [Array.from({ length: nItems }, (_, i) => i)];

    const next: Layout = { pages, theadH, rowH };
    setLayout((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  });

  const measured = layout !== null;
  const laid = layout?.pages ?? [Array.from({ length: nItems }, (_, i) => i)];
  const theadH = layout?.theadH ?? 0;
  const rowH = layout?.rowH ?? [];
  const total = laid.length;

  const renderPage = (rowIdx: number[], idx: number, first: boolean, last: boolean) => {
    const top = pageTop(idx);
    // Items shift up on continued sheets (no header above them); before measuring
    // or with no items, keep the template's designed position.
    const dyItems = measured && itemsEl && nItems > 0 ? top - itemsY : 0;
    // The totals block hugs the bottom of this sheet's rows (or sits near the top
    // on a footer-only sheet that has no rows).
    const rowsBottom = top + theadH + rowIdx.reduce((s, i) => s + (rowH[i] ?? 0), 0);
    const dyFlow = measured && itemsEl ? rowsBottom - itemsBoxBottom : 0;
    return (
      <div
        key={idx}
        style={{ width: CANVAS_W * scale, height: CANVAS_H * scale, overflow: "hidden" }}
        className="shadow-lg"
      >
        <div
          data-paper-page
          style={{
            width: CANVAS_W,
            height: CANVAS_H,
            background: "#fff",
            position: "relative",
            transform: `scale(${scale})`,
            transformOrigin: "top left",
            fontFamily: "'Fira Sans', system-ui, sans-serif",
          }}
        >
          {/* Header block prints on the FIRST sheet only; continued sheets show
              just the remaining rows, flowing from the top. */}
          {first &&
            headerEls.map((el) => (
              <Abs key={el.id} el={el}>
                <ElementView el={el} data={data} />
              </Abs>
            ))}
          {itemsEl && (
            <Abs el={itemsEl} dy={dyItems} autoHeight>
              <ElementView el={itemsEl} data={{ ...data, items: rowIdx.map((i) => data.items[i]) }} />
            </Abs>
          )}
          {/* The totals block follows the rows; anchored notes stay put. Both print
              on the last (footer) sheet only. */}
          {last &&
            flowEls.map((el) => (
              <Abs key={el.id} el={el} dy={dyFlow}>
                <ElementView el={el} data={data} />
              </Abs>
            ))}
          {last &&
            anchoredEls.map((el) => (
              <Abs key={el.id} el={el}>
                <ElementView el={el} data={data} />
              </Abs>
            ))}
        </div>
      </div>
    );
  };

  return (
    <>
      {/* Hidden measuring pass: the full items table at its real width, so each
          row's true height (with wrapping) is known before laying out pages.
          Carries no data-paper-page, so PaperModal never exports it. */}
      {itemsEl && nItems > 0 && (
        <div
          ref={measureRef}
          aria-hidden
          className="pointer-events-none invisible absolute left-0 top-0 -z-10"
          style={{ width: itemsEl.w, fontFamily: "'Fira Sans', system-ui, sans-serif" }}
        >
          <ElementView el={itemsEl} data={data} />
        </div>
      )}
      {laid.map((rowIdx, pi) => renderPage(rowIdx, pi, pi === 0, pi === total - 1))}
    </>
  );
}
