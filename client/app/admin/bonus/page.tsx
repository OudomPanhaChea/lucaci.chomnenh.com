"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { DatePicker, Input } from "antd";
import dayjs, { Dayjs } from "dayjs";
import { ChevronRight, Gift, Handshake, ReceiptText, Package, Trophy } from "lucide-react";
import api from "@/services/api";
import { useRealtime } from "@/hooks/useRealtime";
import { SectionHeader } from "@/components/ui/section-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Spinner } from "@/components/ui/spinner";
import { money, fmtDate } from "@/lib/format";
import type { BonusClientSummary } from "@/lib/types";

const { RangePicker } = DatePicker;

// Partner reward hub: every partner client as a card with their fully paid
// purchases in the period; clicking a card opens the bonus detail page where
// the actual bonus is picked, saved, and exported as a paper.
export default function BonusPage() {
  const [range, setRange] = useState<[Dayjs, Dayjs]>([dayjs().startOf("month"), dayjs()]);
  const [clients, setClients] = useState<BonusClientSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const from = range[0].format("YYYY-MM-DD");
  const to = range[1].format("YYYY-MM-DD");

  const load = useCallback(() => {
    api
      .get("/bonuses/clients", { params: { from, to } })
      .then(({ data }) => setClients(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [from, to]);
  useEffect(load, [load]);
  useRealtime(["sale:created", "sale:updated", "sale:voided", "client:changed", "bonus:changed"], load);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter(
      (c) => c.name.toLowerCase().includes(q) || c.phone?.includes(q) || c.email?.toLowerCase().includes(q)
    );
  }, [clients, search]);

  return (
    <div>
      <SectionHeader
        title="Partner bonus"
        subtitle="Reward partners for what they bought in a period. Only fully paid invoices count."
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input
          allowClear
          className="w-64!"
          placeholder="Search partner name or phone"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <RangePicker
          value={range}
          allowClear={false}
          onChange={(v) => v && setRange(v as [Dayjs, Dayjs])}
          presets={[
            { label: "This month", value: [dayjs().startOf("month"), dayjs()] },
            { label: "Last month", value: [dayjs().subtract(1, "month").startOf("month"), dayjs().subtract(1, "month").endOf("month")] },
            { label: "Last 3 months", value: [dayjs().subtract(2, "month").startOf("month"), dayjs()] },
            { label: "This year", value: [dayjs().startOf("year"), dayjs()] },
          ]}
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Spinner /></div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Gift}
          title={clients.length === 0 ? "No partner clients yet" : "No partners match your search"}
          description={
            clients.length === 0
              ? "Mark a client as Partner on the Clients page and their purchases will show up here."
              : "Try a different name or phone number."
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {filtered.map((c) => (
            <Link
              key={c.id}
              href={`/admin/bonus/${c.id}?from=${from}&to=${to}`}
              className="group cursor-pointer rounded-xl border border-line bg-surface-raised! p-4 shadow-card transition! duration-200 hover:border-brand"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 text-xl font-semibold shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand-soft-foreground">
                  {c.name.charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-fg">{c.name}</p>
                  <p className="truncate text-xs text-fg-muted">{c.phone || c.email || `Partner #${c.display_number}`}</p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-fg-subtle transition-transform duration-200 group-hover:translate-x-0.5" />
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2">
                <div className="rounded-lg bg-surface-sunken px-2 py-2 text-center">
                  <p className="flex items-center justify-center gap-1 text-[11px] text-fg-subtle">
                    <ReceiptText className="h-3 w-3" /> Paid inv.
                  </p>
                  <p className="tabular mt-0.5 text-sm font-semibold text-fg">{c.paid_invoices}</p>
                </div>
                <div className="rounded-lg bg-surface-sunken px-2 py-2 text-center">
                  <p className="text-[11px] text-fg-subtle">Paid total</p>
                  <p className="tabular mt-0.5 text-sm font-semibold text-fg">{money(c.paid_total)}</p>
                </div>
                <div className="rounded-lg bg-surface-sunken px-2 py-2 text-center">
                  <p className="flex items-center justify-center gap-1 text-[11px] text-fg-subtle">
                    <Package className="h-3 w-3" /> Items
                  </p>
                  <p className="tabular mt-0.5 text-sm font-semibold text-fg">{Number(c.qty).toLocaleString()}</p>
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between border-t border-line pt-2.5 text-xs">
                <span className="flex items-center gap-1.5 text-fg-muted">
                  <Trophy className="h-3.5 w-3.5 text-brand-soft-foreground" />
                  {c.bonus_count > 0
                    ? `${c.bonus_count} bonus${c.bonus_count > 1 ? "es" : ""} · ${money(c.bonus_total)}`
                    : "Never rewarded"}
                </span>
                {c.last_bonus_at && (
                  <span className="text-fg-subtle">Last: {fmtDate(c.last_bonus_at, "dd MMM yyyy")}</span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
