"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { DatePicker, Input, Segmented } from "antd";
import { Dayjs } from "dayjs";
import { ChevronRight, Gift, Search } from "lucide-react";
import api from "@/services/api";
import { useRealtime } from "@/hooks/useRealtime";
import { SectionHeader } from "@/components/ui/section-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { periodParams, type BonusPeriod } from "@/components/bonus/period";
import { money, num, fmtDate } from "@/lib/format";
import type { BonusClientSummary } from "@/lib/types";
import { useT } from "@/lib/i18n";
import { rangePresets } from "@/lib/range-presets";

const { RangePicker } = DatePicker;

type Show = "all" | "bought" | "never";

// Partner reward hub: every partner client as a card with their non-voided
// purchases (all time by default, or in a picked period); a card opens the
// bonus detail page where the bonus is built, saved, and exported as a paper.
export default function BonusPage() {
  const { t } = useT();
  const [range, setRange] = useState<BonusPeriod>(null);
  const [clients, setClients] = useState<BonusClientSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [show, setShow] = useState<Show>("all");

  const params = useMemo(() => periodParams(range), [range]);
  const load = useCallback(() => {
    api
      .get("/bonuses/clients", { params })
      .then(({ data }) => setClients(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [params]);
  useEffect(load, [load]);
  useRealtime(["sale:created", "sale:updated", "sale:voided", "client:changed", "bonus:changed"], load);

  const counts = useMemo(
    () => ({
      all: clients.length,
      bought: clients.filter((c) => Number(c.invoice_count) > 0).length,
      never: clients.filter((c) => Number(c.bonus_count) === 0).length,
    }),
    [clients]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return clients.filter((c) => {
      if (show === "bought" && Number(c.invoice_count) === 0) return false;
      if (show === "never" && Number(c.bonus_count) > 0) return false;
      if (!q) return true;
      return c.name.toLowerCase().includes(q) || c.phone?.includes(q) || c.email?.toLowerCase().includes(q);
    });
  }, [clients, search, show]);

  const query = new URLSearchParams(params).toString();
  const filtering = !!search.trim() || show !== "all" || !!range;

  return (
    <div>
      <SectionHeader
        title={t("Bonus")}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input
          allowClear
          className="w-full! sm:w-64!"
          prefix={<Search className="h-4 w-4 text-fg-subtle" />}
          placeholder={t("Search")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <RangePicker
          className="w-full! sm:w-auto!"
          value={range}
          allowClear
          placeholder={[t("All time"), t("All time")]}
          onChange={(v) => setRange(v && v[0] && v[1] ? [v[0], v[1]] as [Dayjs, Dayjs] : null)}
          presets={rangePresets(t)}
        />
        <Segmented<Show>
          value={show}
          onChange={setShow}
          options={[
            { value: "all", label: `${t("All")} (${counts.all})` },
            { value: "bought", label: `${t("Bought")} (${counts.bought})` },
            { value: "never", label: `${t("Not rewarded")} (${counts.never})` },
          ]}
        />
        {filtering && (
          <Button
            type="link"
            onClick={() => {
              setSearch("");
              setShow("all");
              setRange(null);
            }}
          >
            {t("Clear")}
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Spinner /></div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Gift}
          title={clients.length === 0 ? t("No partners yet") : t("No results")}
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-3 3xl:grid-cols-4">
          {filtered.map((c) => {
            const bought = Number(c.invoice_count) > 0;
            return (
              <Link
                key={c.id}
                href={`/admin/bonus/${c.id}${query ? `?${query}` : ""}`}
                className="group flex cursor-pointer flex-col rounded-xl border border-line bg-surface-raised! p-4 shadow-card transition! duration-200 hover:border-brand hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-soft text-lg font-semibold text-brand-soft-foreground">
                    {c.name.charAt(0).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-fg">{c.name}</p>
                    <p className="truncate text-xs text-fg-muted">{c.phone || c.email || `#${c.display_number}`}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-fg-subtle transition-transform duration-200 group-hover:translate-x-0.5" />
                </div>

                {/* Invoices flagged from the invoice modal, waiting ticked on
                    the detail page */}
                {Number(c.marked_count) > 0 && (
                  <p className="mt-3 flex items-center gap-1.5 text-xs font-medium text-fg-muted">
                    <Gift className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    {t("{n} marked", { n: num(c.marked_count) })}
                  </p>
                )}

                {bought ? (
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <div className="rounded-lg bg-surface-sunken px-2 py-2 text-center">
                      <p className="text-[11px] text-fg-subtle">{t("Invoices")}</p>
                      <p className="tabular mt-0.5 text-sm font-semibold text-fg">{num(c.invoice_count)}</p>
                    </div>
                    <div className="rounded-lg bg-surface-sunken px-2 py-2 text-center">
                      <p className="text-[11px] text-fg-subtle">{t("Total")}</p>
                      <p className="tabular mt-0.5 text-sm font-semibold text-fg">{money(c.invoice_total)}</p>
                    </div>
                    <div className="rounded-lg bg-surface-sunken px-2 py-2 text-center">
                      <p className="text-[11px] text-fg-subtle">{t("Items")}</p>
                      <p className="tabular mt-0.5 text-sm font-semibold text-fg">{num(c.qty)}</p>
                    </div>
                  </div>
                ) : (
                  <p className="mt-3 rounded-lg border border-dashed border-line px-3 py-[0.9rem] text-center text-xs text-fg-muted">
                    {range ? t("No results") : t("No purchases yet")}
                  </p>
                )}

                {/* spacer pins the footer to the bottom of grid-stretched cards */}
                <div className="min-h-3 flex-1" />
                <div className="flex items-center justify-between border-t border-line pt-2.5 text-xs">
                  <span className="text-fg-muted">
                    {c.bonus_count > 0
                      ? `${t("Bonus")}: ${money(c.bonus_total)}`
                      : t("Not rewarded")}
                  </span>
                  {c.last_bonus_at && (
                    <span className="text-fg-subtle">{t("Last: {date}", { date: fmtDate(c.last_bonus_at, "dd MMM yyyy") })}</span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
