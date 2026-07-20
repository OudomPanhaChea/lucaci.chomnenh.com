"use client";
import { useMemo } from "react";
import dayjs from "dayjs";
import type { Client, Sale, Settings } from "@/lib/types";
import { money, num, khr, fmtDate } from "@/lib/format";
import {
  PaperHeader, PaperContinuation, PaperSignatures, PaperFooter,
} from "@/components/paper/paper";
import PaginatedPaper from "@/components/paper/paginated-paper";

// The downloadable client statement, A4 portrait on the shared paper
// primitives: the selected invoices, each detailed separately (items, total,
// paid, balance), then one grand owing total (optionally including the
// client's remaining old owing, debt from before this system). Splits onto
// extra sheets when the invoices don't fit one page. Titled OWING STATEMENT
// when every selected invoice still owes money, ACCOUNT STATEMENT when paid
// ones are included.
export default function StatementPaper({
  client,
  sales,
  settings,
  preparedBy,
  oldOwing = 0,
}: {
  client: Client;
  sales: Sale[]; // full sales with items, oldest first
  settings: Settings | null;
  preparedBy: string;
  oldOwing?: number; // remaining pre-system debt to include, 0 = leave off
}) {
  const issued = useMemo(() => dayjs(), []);
  const purchased = sales.reduce((s, x) => s + Number(x.total), 0);
  const paid = sales.reduce((s, x) => s + Number(x.amount_paid), 0);
  const owing = purchased - paid + oldOwing;
  const owingOnly = sales.every((s) => Number(s.total) - Number(s.amount_paid) > 0);
  const title = owingOnly ? "OWING STATEMENT" : "ACCOUNT STATEMENT";

  const header = (
    <>
      <PaperHeader
        settings={settings}
        title={title}
        refText={`Ref STM-${issued.format("YYYYMMDD-HHmm")}`}
        issuedText={`Issued ${issued.format("DD MMM YYYY")}`}
      />

      {/* Billed to + invoice span */}
      <div className="flex items-end justify-between gap-6 pt-8">
        <div>
          <p className="mt-1 text-2xl font-bold text-[#142332]">{client.name}</p>
          {(client.phone || client.address) && (
            <p className="mt-0.5 text-xs text-[#5b6b7a]">
              {[client.phone, client.address].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>
        {sales.length > 0 && (
          <div className="text-right">
            <p className="mt-1 text-sm font-semibold">
              {sales.length} invoice{sales.length === 1 ? "" : "s"}
            </p>
            <p className="text-xs text-[#5b6b7a]">
              {fmtDate(sales[0].created_at, "dd MMM yyyy")} –{" "}
              {fmtDate(sales[sales.length - 1].created_at, "dd MMM yyyy")}
            </p>
          </div>
        )}
      </div>
    </>
  );

  // Owing-only paper (no invoices selected): one line stating the carried
  // balance, so the sheet is not just a totals box
  const owingAloneBlock = {
    key: "prev-owing",
    node: (
      <div className="pt-8">
        <div className="border-b-2 border-[#304A59] pb-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#8a97a3]">
            Previous owing
          </span>
        </div>
        <div className="flex items-center justify-between border-b border-[#e6ebee] py-2.5 text-sm">
          <span className="font-medium">Owing carried from previous records</span>
          <span className="tabular font-medium">{money(oldOwing)}</span>
        </div>
      </div>
    ),
  };

  // One block per invoice: its items, then total / paid / balance
  const invoiceBlocks = sales.map((s) => {
    const balance = Number(s.total) - Number(s.amount_paid);
    return {
      key: `inv-${s.id}`,
      node: (
        <div className="pt-8">
          <div className="flex items-baseline justify-between border-b-2 border-[#304A59] pb-1.5">
            <p className="flex items-baseline gap-2.5">
              <span className="font-mono text-sm font-bold text-[#304A59]">{s.invoice_number}</span>
              <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#8a97a3]">
                {s.status}
              </span>
            </p>
            <p className="text-xs text-[#5b6b7a]">{fmtDate(s.created_at, "dd MMM yyyy HH:mm")}</p>
          </div>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-[#e6ebee] text-left text-[10px] uppercase tracking-[0.12em] text-[#5b6b7a]">
                <th className="py-1.5 pr-3 font-semibold">Item</th>
                <th className="py-1.5 pr-3 text-right font-semibold">Quantity</th>
                <th className="py-1.5 pr-3 text-right font-semibold">Price</th>
                <th className="py-1.5 text-right font-semibold">Amount</th>
              </tr>
            </thead>
            <tbody>
              {(s.items ?? []).map((it) => (
                <tr key={it.id} className="border-b border-[#e6ebee]">
                  <td className="py-2 pr-3 font-medium">
                    {it.name_snapshot}
                    {!!it.is_bonus && (
                      <span className="ml-1.5 text-[10px] font-semibold uppercase text-[#8a97a3]">Free</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap py-2 pr-3 text-right">
                    {num(it.quantity)} {it.unit_name ?? it.base_unit ?? "pcs"}
                  </td>
                  <td className="whitespace-nowrap py-2 pr-3 text-right text-[#5b6b7a]">
                    {it.is_bonus ? "FREE" : money(it.price)}
                  </td>
                  <td className="whitespace-nowrap py-2 text-right font-medium">
                    {it.is_bonus ? "FREE" : money(it.line_total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="ml-auto mt-2 w-64 text-sm">
            <div className="flex items-center justify-between py-0.5 text-[#5b6b7a]">
              <span>Invoice total</span>
              <span className="tabular">{money(s.total)}</span>
            </div>
            <div className="flex items-center justify-between py-0.5 text-[#5b6b7a]">
              <span>Paid</span>
              <span className="tabular">{money(s.amount_paid)}</span>
            </div>
            <div className="mt-0.5 flex items-center justify-between border-t border-[#304A59] pt-1 font-semibold text-[#304A59]">
              <span>Balance due</span>
              <span className="tabular">{money(balance)}</span>
            </div>
          </div>
        </div>
      ),
    };
  });
  const blocks = sales.length > 0 ? invoiceBlocks : oldOwing > 0 ? [owingAloneBlock] : [];

  // Grand totals (purchased/paid rows only make sense with invoices)
  const tail = (
    <div className="ml-auto w-72 pt-9">
      {sales.length > 0 && (
        <>
          <div className="flex items-center justify-between py-1 text-sm text-[#5b6b7a]">
            <span>Total purchased</span>
            <span className="tabular">{money(purchased)}</span>
          </div>
          <div className="flex items-center justify-between py-1 text-sm text-[#5b6b7a]">
            <span>Total paid</span>
            <span className="tabular">{money(paid)}</span>
          </div>
        </>
      )}
      {oldOwing > 0 && (
        <div className="flex items-center justify-between py-1 text-sm text-[#5b6b7a]">
          <span>Previous owing</span>
          <span className="tabular">{money(oldOwing)}</span>
        </div>
      )}
      <div className="mt-1.5 flex items-baseline justify-between gap-4 border-t-2 border-[#304A59] pt-2.5">
        <span className="text-[11px] font-semibold uppercase tracking-[0.15em] text-[#304A59]">
          Total owing
        </span>
        <span className="whitespace-nowrap text-2xl font-bold text-[#304A59]">
          {money(owing)}
        </span>
      </div>
      {settings && (
        <p className="mt-1 text-right text-xs text-[#8a97a3]">
          ≈ {khr(owing, Number(settings.exchange_rate))}
        </p>
      )}
    </div>
  );

  // Signatures + footer pinned to the bottom of the last page
  const bottom = (
    <div className="mt-auto pt-14">
      <PaperSignatures
        left={{ name: preparedBy, label: "Prepared by" }}
        right={{ name: client.name, label: "Acknowledged by" }}
      />
      <PaperFooter settings={settings} />
    </div>
  );

  return (
    <PaginatedPaper
      header={header}
      continuation={(page, pages) => (
        <PaperContinuation title={title} subtitle={client.name} page={page} pages={pages} />
      )}
      blocks={blocks}
      tail={tail}
      bottom={bottom}
    />
  );
}
