"use client";
import type { Bonus, BonusItem, Settings } from "@/lib/types";
import { money, khr, fmtDate } from "@/lib/format";
import {
  PaperHeader, PaperContinuation, PaperSignatures, PaperFooter,
} from "@/components/paper/paper";
import PaginatedPaper, { PaperBlock } from "@/components/paper/paginated-paper";

// The downloadable bonus paper, built on the shared A4 primitives in
// components/paper (white sheet, hairline rules, brand navy headings, thin
// #FFA040 accent). Item lines are fixed-template grid rows (not a <table>)
// so a long list can split onto extra sheets between rows, with the column
// headings re-printed after each break.

const COLS = "grid grid-cols-[minmax(0,1fr)_8.5rem_7rem_8rem_5.5rem] gap-x-3";

function ItemColumnHeads({ firstPage }: { firstPage: boolean }) {
  return (
    <div
      className={`${COLS} border-b-2 border-[#304A59] pb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#5b6b7a] ${
        firstPage ? "pt-8" : "pt-6"
      }`}
    >
      <span>Item</span>
      <span>Invoice</span>
      <span className="text-right">Quantity</span>
      <span className="text-right">Basis</span>
      <span className="text-right">Reward</span>
    </div>
  );
}

function ItemRow({ it }: { it: BonusItem }) {
  return (
    <div className={`${COLS} items-center border-b border-[#e6ebee] py-2.5 text-sm`}>
      <span className="font-medium">{it.product_name}</span>
      <span className="whitespace-nowrap font-mono text-xs text-[#5b6b7a]">{it.invoice_number}</span>
      <span className="text-right">{it.qty_desc || Number(it.pieces).toLocaleString()}</span>
      <span className="whitespace-nowrap text-right text-xs text-[#5b6b7a]">
        {it.bonus_type === "percent" ? `${money(it.line_total)} × ${Number(it.pct)}%` : "Fixed"}
      </span>
      <span className="whitespace-nowrap text-right font-semibold">{money(it.amount)}</span>
    </div>
  );
}

export default function BonusPaper({
  bonus,
  settings,
}: {
  bonus: Bonus;
  settings: Settings | null;
}) {
  const items = bonus.items ?? [];
  const invoiceNumbers = bonus.invoice_numbers ?? [];
  const itemsAmount = Number(bonus.items_amount ?? 0);
  const hasBoth = items.length > 0 && !!bonus.level1_type;

  const header = (
    <>
      <PaperHeader
        settings={settings}
        title="BONUS AWARD"
        refText={`Ref BON-${String(bonus.id).padStart(4, "0")}`}
        issuedText={`Issued ${fmtDate(bonus.created_at, "dd MMM yyyy")}`}
      />

      {/* Awarded to + period */}
      <div className="flex items-end justify-between gap-6 pt-8">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#8a97a3]">
            Awarded to
          </p>
          <p className="mt-1 text-2xl font-bold text-[#142332]">
            {bonus.client_name}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#8a97a3]">
            Purchase period
          </p>
          <p className="mt-1 text-sm font-semibold">
            {fmtDate(bonus.period_from, "dd MMM yyyy")} –{" "}
            {fmtDate(bonus.period_to, "dd MMM yyyy")}
          </p>
        </div>
      </div>
    </>
  );

  // Item reward lines: heads + first row stay together, the rest may break
  const blocks: PaperBlock[] = items.map((it, i) => ({
    key: `item-${it.id}`,
    node:
      i === 0 ? (
        <div>
          <ItemColumnHeads firstPage />
          <ItemRow it={it} />
        </div>
      ) : (
        <ItemRow it={it} />
      ),
  }));

  // The invoice-total reward (kept as one unbreakable block)
  if (bonus.level1_type) {
    blocks.push({
      key: "invoice-level",
      node: (
        <table className="mt-8 w-full border-collapse text-sm">
          <thead>
            <tr className="border-b-2 border-[#304A59] text-left text-[10px] uppercase tracking-[0.12em] text-[#5b6b7a]">
              <th className="pb-2 pr-3 font-semibold">Description</th>
              <th className="pb-2 pr-3 font-semibold">Invoice</th>
              <th className="pb-2 pr-3 text-right font-semibold">Basis</th>
              <th className="pb-2 text-right font-semibold">Reward</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-[#e6ebee] align-baseline">
              <td className="py-2.5 pr-3">
                <p className="font-medium">Invoice total reward</p>
                <p className="text-xs text-[#8a97a3]">
                  {bonus.invoice_count} fully paid invoice
                  {bonus.invoice_count === 1 ? "" : "s"}
                </p>
              </td>
              <td className="py-2.5 pr-3 text-xs text-[#5b6b7a]">
                {invoiceNumbers.length > 0 && (
                  <div className="mt-2.5 font-mono text-[10px] leading-relaxed text-[#8a97a3]">
                    {invoiceNumbers.map((num) => (
                      <p key={num}>{num}</p>
                    ))}
                  </div>
                )}
              </td>
              <td className="whitespace-nowrap py-2.5 pr-3 text-right text-xs text-[#5b6b7a]">
                {bonus.level1_type === "percent"
                  ? `${money(bonus.invoice_total)} × ${Number(bonus.level1_pct)}%`
                  : "Fixed"}
              </td>
              <td className="whitespace-nowrap py-2.5 text-right font-semibold">
                {money(bonus.level1_amount)}
              </td>
            </tr>
          </tbody>
        </table>
      ),
    });
  }

  // Totals + note
  const tail = (
    <>
      <div className="ml-auto w-72 pt-7">
        {hasBoth && (
          <>
            <div className="flex items-center justify-between py-1 text-sm text-[#5b6b7a]">
              <span>Item rewards</span>
              <span className="tabular">{money(itemsAmount)}</span>
            </div>
            <div className="flex items-center justify-between py-1 text-sm text-[#5b6b7a]">
              <span>Invoice reward</span>
              <span className="tabular">{money(bonus.level1_amount)}</span>
            </div>
          </>
        )}
        <div className="mt-1.5 flex items-baseline justify-between gap-4 border-t-2 border-[#304A59] pt-2.5">
          <span className="text-[11px] font-semibold uppercase tracking-[0.15em] text-[#304A59]">
            Total bonus
          </span>
          <span className="whitespace-nowrap text-2xl font-bold text-[#304A59]">
            {money(bonus.total_amount)}
          </span>
        </div>
        {settings && (
          <p className="mt-1 text-right text-xs text-[#8a97a3]">
            ≈ {khr(Number(bonus.total_amount), Number(settings.exchange_rate))}
          </p>
        )}
      </div>

      {bonus.note && (
        <p className="pt-7 text-sm leading-relaxed text-[#42525f]">
          <span className="font-semibold text-[#304A59]">Note: </span>
          {bonus.note}
        </p>
      )}
    </>
  );

  // Signatures + footer pinned to the bottom of the last page
  const bottom = (
    <div className="mt-auto pt-14">
      <PaperSignatures
        left={{ name: bonus.created_by || "", label: "Prepared by" }}
        right={{ name: bonus.client_name, label: "Received by" }}
      />
      <PaperFooter settings={settings} />
    </div>
  );

  return (
    <PaginatedPaper
      header={header}
      continuation={(page, pages) => (
        <PaperContinuation title="BONUS AWARD" subtitle={bonus.client_name} page={page} pages={pages} />
      )}
      blocks={blocks}
      repeatOnBreak={{
        node: <ItemColumnHeads firstPage={false} />,
        when: (firstKey) => !!firstKey?.startsWith("item-") && firstKey !== `item-${items[0]?.id}`,
      }}
      tail={tail}
      bottom={bottom}
    />
  );
}
