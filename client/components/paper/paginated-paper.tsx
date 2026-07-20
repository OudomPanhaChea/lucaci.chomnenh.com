"use client";
import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";
import { PaperSheet } from "@/components/paper/paper";

// Splits paper content across as many A4 sheets as it needs. The content is a
// list of self-contained blocks (an invoice, a table row); their real heights
// are measured in a hidden pass at the exact sheet width, then blocks are
// dealt onto pages so nothing is ever cut by the 1123px page edge. Page 1
// starts with `header`, later pages with `continuation`; `tail` (totals) and
// `bottom` (signatures + footer, pinned) always sit on the last page.

const PAGE_H = 1123;
const PAD_Y = 88; // pt-12 + pb-10 of PaperSheet
const SAFETY = 16; // slack for sub-pixel rounding / late font metrics
const BUDGET = PAGE_H - PAD_Y - SAFETY;

export type PaperBlock = { key: string; node: React.ReactNode };

export default function PaginatedPaper({
  header,
  continuation,
  blocks,
  repeatOnBreak,
  tail,
  bottom,
}: {
  header: React.ReactNode;
  continuation: (page: number, pages: number) => React.ReactNode;
  blocks: PaperBlock[];
  // Re-printed under the continuation header (e.g. table column headings),
  // only on pages whose first block passes `when`
  repeatOnBreak?: { node: React.ReactNode; when: (firstKey: string | undefined) => boolean };
  tail: React.ReactNode;
  bottom: React.ReactNode;
}) {
  const measureRef = useRef<HTMLDivElement>(null);
  const [pages, setPages] = useState<string[][] | null>(null);
  const [, setFontsTick] = useState(0);

  // Re-measure once the self-hosted fonts finish loading (metrics can shift)
  useEffect(() => {
    let stale = false;
    document.fonts?.ready?.then(() => !stale && setFontsTick((t) => t + 1));
    return () => { stale = true; };
  }, []);

  useLayoutEffect(() => {
    const el = measureRef.current;
    if (!el) return;
    const h = (name: string) =>
      (el.querySelector(`[data-m="${name}"]`) as HTMLElement | null)?.offsetHeight ?? 0;
    const contH = h("cont") + h("repeat");
    const tailH = h("tail");
    const bottomH = h("bottom");
    // Non-last pages end with the "Continued on next page" hint, so blocks
    // get a budget that leaves room for it
    const blockBudget = BUDGET - h("hint");

    const next: string[][] = [];
    let cur: string[] = [];
    let used = h("header");
    blocks.forEach((b, i) => {
      const bh = h(`b${i}`);
      // An oversized single block still gets its own page and just grows it
      if (cur.length > 0 && used + bh > blockBudget) {
        next.push(cur);
        cur = [];
        used = contH;
      }
      cur.push(b.key);
      used += bh;
    });
    if (cur.length > 0 && used + tailH + bottomH > BUDGET) {
      next.push(cur);
      cur = [];
    }
    next.push(cur); // last page carries the tail + pinned bottom
    setPages((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
  });

  const byKey = new Map(blocks.map((b) => [b.key, b.node]));
  const laidOut = pages ?? [blocks.map((b) => b.key)];
  const total = laidOut.length;

  return (
    <>
      {/* Hidden measuring pass: same width, padding and font context as the
          sheet. overflow-hidden contains child margins so offsetHeight is the
          true footprint of each part. Sits outside the exported page nodes. */}
      <div
        ref={measureRef}
        aria-hidden
        className="pointer-events-none invisible absolute left-0 top-0 -z-10 w-[794px] bg-white px-14 text-[#142332]"
      >
        <div data-m="header" className="overflow-hidden">{header}</div>
        <div data-m="cont" className="overflow-hidden">{continuation(2, 2)}</div>
        {repeatOnBreak && <div data-m="repeat" className="overflow-hidden">{repeatOnBreak.node}</div>}
        {blocks.map((b, i) => (
          <div key={b.key} data-m={`b${i}`} className="overflow-hidden">{b.node}</div>
        ))}
        <div data-m="tail" className="overflow-hidden">{tail}</div>
        <div data-m="bottom" className="overflow-hidden">{bottom}</div>
        <div data-m="hint" className="overflow-hidden"><ContinuedHint page={1} pages={2} /></div>
      </div>

      {laidOut.map((keys, pi) => {
        const last = pi === total - 1;
        return (
          <PaperSheet key={pi}>
            {pi === 0 ? (
              header
            ) : (
              <>
                {continuation(pi + 1, total)}
                {repeatOnBreak?.when(keys[0]) && repeatOnBreak.node}
              </>
            )}
            {keys.map((k) => (
              <Fragment key={k}>{byKey.get(k)}</Fragment>
            ))}
            {last ? (
              <>
                {tail}
                {bottom}
              </>
            ) : (
              <ContinuedHint page={pi + 1} pages={total} />
            )}
          </PaperSheet>
        );
      })}
    </>
  );
}

function ContinuedHint({ page, pages }: { page: number; pages: number }) {
  return (
    <p className="mt-auto pt-6 text-right text-[11px] text-[#8a97a3]">
      Page {page} of {pages}
    </p>
  );
}
