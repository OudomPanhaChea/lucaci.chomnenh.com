"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Checkbox, DatePicker, Divider, Input, Popconfirm, Tabs } from "antd";
import { InputNumber } from "@/components/ui/input-number";
import { Button } from "@/components/ui/button";
import { Dayjs } from "dayjs";
import { toast } from "react-toastify";
import {
  ArrowLeft,
  CircleAlert,
  Gift,
  FileText,
  ReceiptText,
  Trash2,
} from "lucide-react";
import api, { apiError } from "@/services/api";
import { useRealtime } from "@/hooks/useRealtime";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import BonusPaperModal from "@/components/bonus/bonus-paper-modal";
import PickedItemsBonus from "@/components/bonus/picked-items-bonus";
import {
  Amount,
  EMPTY_SEL,
  RewardInput,
  Section,
  round2,
  type ItemSel,
  type RewardType,
} from "@/components/bonus/reward-parts";
import { bonusRef } from "@/components/bonus/bonus-data";
import {
  periodFromQuery,
  periodParams,
  type BonusPeriod,
} from "@/components/bonus/period";
import { money, num, fmtDate } from "@/lib/format";
import type { Bonus, BonusDetail, BonusEligibleItem } from "@/lib/types";
import { useT } from "@/lib/i18n";
import { rangePresets } from "@/lib/range-presets";

const { RangePicker } = DatePicker;

const keyOf = (it: BonusEligibleItem) =>
  `${it.sale_id}|${it.product_id ?? "x"}|${it.product_name}`;

export default function BonusDetailPage() {
  const params = useParams<{ id: string }>();
  const query = useSearchParams();
  const { t } = useT();
  const router = useRouter();
  const clientId = Number(params.id);

  // Two ways to reward: items picked in the POS (default) or real invoices.
  // The tab lives in the URL so a reload or a link lands on the same one.
  const [tab, setTab] = useState<"items" | "invoices">(() =>
    query.get("tab") === "invoices" ? "invoices" : "items",
  );
  const changeTab = (key: string) => {
    const next = key === "invoices" ? "invoices" : "items";
    setTab(next);
    const qs = new URLSearchParams(query.toString());
    if (next === "invoices") qs.set("tab", "invoices");
    else qs.delete("tab");
    router.replace(`?${qs}`, { scroll: false });
  };

  // Period filter is optional: null = all time (the default)
  const [range, setRange] = useState<BonusPeriod>(() =>
    periodFromQuery(query.get("from"), query.get("to")),
  );
  const periodQuery = useMemo(() => periodParams(range), [range]);

  const [detail, setDetail] = useState<BonusDetail | null>(null);
  const [loading, setLoading] = useState(true);

  // Step 1: which invoices count (nothing pre-ticked, owner's choice)
  const [invSel, setInvSel] = useState<number[]>([]);

  // Step 2: the two reward kinds, usable together
  const [invType, setInvType] = useState<RewardType>("percent");
  const [invPct, setInvPct] = useState<number | null>(null);
  const [invAmt, setInvAmt] = useState<number | null>(null);
  const [sel, setSel] = useState<Record<string, ItemSel>>({});
  const [bulkPct, setBulkPct] = useState<number | null>(null);

  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [paperBonus, setPaperBonus] = useState<Bonus | null>(null);

  // Invoices marked "for bonus" from the invoice modal arrive ticked, once per
  // load of the page or period (a realtime refresh must not re-tick what the
  // user just unticked).
  const seededFor = useRef<string | null>(null);

  const load = useCallback(() => {
    api
      .get(`/bonuses/clients/${clientId}`, { params: periodQuery })
      .then(({ data }) => {
        setDetail(data);
        const seedKey = `${clientId}|${JSON.stringify(periodQuery)}`;
        if (seededFor.current !== seedKey) {
          seededFor.current = seedKey;
          setInvSel(
            (data as BonusDetail).invoices
              .filter((i) => i.bonus_marked_at)
              .map((i) => i.id),
          );
        }
      })
      .catch(() => setDetail(null))
      .finally(() => setLoading(false));
  }, [clientId, periodQuery]);
  useEffect(load, [load]);
  useRealtime(
    ["sale:created", "sale:updated", "sale:voided", "bonus:changed"],
    load,
  );

  // Marked invoices first: they are the ones someone already picked
  const invoices = useMemo(
    () =>
      [...(detail?.invoices ?? [])].sort(
        (a, b) => Number(!!b.bonus_marked_at) - Number(!!a.bonus_marked_at),
      ),
    [detail],
  );
  const markedCount = invoices.filter((i) => i.bonus_marked_at).length;
  const history = useMemo(() => detail?.history ?? [], [detail]);

  // Invoices already counted in a past award, flagged so nothing is rewarded
  // twice by accident (by number, so it survives period changes)
  const rewarded = useMemo(() => {
    const set = new Set<string>();
    for (const b of history) {
      (b.invoice_numbers ?? []).forEach((n) => set.add(n));
      (b.items ?? []).forEach(
        (it) => it.invoice_number && set.add(it.invoice_number),
      );
    }
    return set;
  }, [history]);

  const selectedInvoices = useMemo(
    () => invoices.filter((i) => invSel.includes(i.id)),
    [invoices, invSel],
  );
  const selTotal = round2(
    selectedInvoices.reduce((s, i) => s + Number(i.total), 0),
  );
  const toggleInvoice = (id: number, on: boolean) =>
    setInvSel((prev) => (on ? [...prev, id] : prev.filter((x) => x !== id)));

  // Product lines of the selected invoices, grouped under their invoice
  const groups = useMemo(
    () =>
      selectedInvoices
        .map((inv) => ({
          inv,
          lines: (detail?.items ?? []).filter((it) => it.sale_id === inv.id),
        }))
        .filter((g) => g.lines.length > 0),
    [selectedInvoices, detail],
  );
  const visibleLines = useMemo(() => groups.flatMap((g) => g.lines), [groups]);

  const updateSel = (key: string, patch: Partial<ItemSel>) =>
    setSel((prev) => ({
      ...prev,
      [key]: { ...(prev[key] ?? EMPTY_SEL), ...patch },
    }));
  const tickLines = (
    lines: BonusEligibleItem[],
    pick: (it: BonusEligibleItem) => boolean,
  ) =>
    setSel((prev) => {
      const next = { ...prev };
      for (const it of lines)
        next[keyOf(it)] = {
          ...(next[keyOf(it)] ?? EMPTY_SEL),
          include: pick(it),
        };
      return next;
    });
  const applyBulkPct = () => {
    if (!bulkPct || bulkPct <= 0 || bulkPct > 100) return;
    setSel((prev) => {
      const next = { ...prev };
      for (const [k, s] of Object.entries(next))
        if (s.include) next[k] = { ...s, type: "percent", pct: bulkPct };
      return next;
    });
  };

  const lineAmount = useCallback(
    (it: BonusEligibleItem) => {
      const s = sel[keyOf(it)];
      if (!s?.include) return 0;
      if (s.type === "fixed")
        return s.amount && s.amount > 0 ? round2(s.amount) : 0;
      return s.pct && s.pct > 0
        ? round2((Number(it.line_total) * s.pct) / 100)
        : 0;
    },
    [sel],
  );
  const tickedCount = visibleLines.filter(
    (it) => sel[keyOf(it)]?.include,
  ).length;
  const pickedItems = useMemo(
    () => visibleLines.filter((it) => lineAmount(it) > 0),
    [visibleLines, lineAmount],
  );
  const itemsAmount = round2(
    pickedItems.reduce((s, it) => s + lineAmount(it), 0),
  );

  // Invoice total reward: active as soon as it has a value
  const invoiceBonus =
    selectedInvoices.length === 0
      ? 0
      : invType === "fixed"
        ? invAmt && invAmt > 0
          ? round2(invAmt)
          : 0
        : invPct && invPct > 0 && selTotal > 0
          ? round2((selTotal * invPct) / 100)
          : 0;

  const totalAmount = round2(itemsAmount + invoiceBonus);

  // Only invoices that actually earn something are recorded on the award
  const awardedInvoiceIds = useMemo(() => {
    if (invoiceBonus > 0) return selectedInvoices.map((i) => i.id);
    return [...new Set(pickedItems.map((it) => it.sale_id))];
  }, [invoiceBonus, selectedInvoices, pickedItems]);
  const awardedRewarded = invoices.filter(
    (i) => awardedInvoiceIds.includes(i.id) && rewarded.has(i.invoice_number),
  ).length;
  // Partial/unpaid invoices may be rewarded (owner's call), but say so before saving
  const awardedOwing = invoices.filter(
    (i) => awardedInvoiceIds.includes(i.id) && i.status !== "paid",
  ).length;

  const canSave = totalAmount > 0;

  const resetInputs = () => {
    setInvSel([]);
    setSel({});
    setInvPct(null);
    setInvAmt(null);
    setNote("");
  };

  const save = () => {
    if (!detail || !canSave) return;
    setSaving(true);
    api
      .post("/bonuses", {
        client_id: clientId,
        invoice_ids: awardedInvoiceIds,
        level1:
          invoiceBonus > 0
            ? {
                type: invType,
                pct: invType === "percent" ? invPct : null,
                amount: invType === "fixed" ? invAmt : null,
              }
            : null,
        note: note.trim() || null,
        items: pickedItems.map((it) => {
          const s = sel[keyOf(it)];
          return {
            sale_id: it.sale_id,
            product_id: it.product_id,
            product_name: it.product_name,
            bonus_type: s.type,
            pct: s.type === "percent" ? s.pct : null,
            amount: s.type === "fixed" ? s.amount : null,
          };
        }),
      })
      .then(({ data }) => {
        toast.success(t("Saved"));
        setPaperBonus(data);
        resetInputs();
        load();
      })
      .catch((err) => toast.error(apiError(err)))
      .finally(() => setSaving(false));
  };

  const removeBonus = (id: number) =>
    api
      .delete(`/bonuses/${id}`)
      .then(() => {
        toast.success(t("Deleted"));
        load();
      })
      .catch((err) => toast.error(apiError(err)));

  if (loading && !detail) {
    return (
      <div className="flex justify-center py-24">
        <Spinner />
      </div>
    );
  }
  if (!detail) {
    return (
      <EmptyState
        icon={CircleAlert}
        title={t("Client not found")}
        action={
          <Link href="/admin/bonus">
            <Button>{t("Back")}</Button>
          </Link>
        }
      />
    );
  }

  const c = detail.client;
  const allChecked = invoices.length > 0 && invSel.length === invoices.length;
  const someChecked = invSel.length > 0 && !allChecked;
  const givenTotal = round2(
    history.reduce((s, b) => s + Number(b.total_amount), 0),
  );
  const backHref = `/admin/bonus${range ? `?${new URLSearchParams(periodQuery)}` : ""}`;
  const hasInvoices = invoices.length > 0;
  const stats: { label: string; value: string }[] = [
    { label: t("Invoices"), value: num(detail.period.invoice_count) },
    { label: t("Total"), value: money(detail.period.invoice_total) },
    { label: t("Items"), value: num(detail.period.qty) },
    {
      label: t("Bonus given"),
      value: history.length ? money(givenTotal) : "—",
    },
  ];

  return (
    <div className="mx-auto max-w-7xl">
      <Link
        href={backHref}
        className="mb-3 inline-flex cursor-pointer items-center gap-1.5 text-sm text-fg-muted transition-colors duration-200 hover:text-fg"
      >
        <ArrowLeft className="h-4 w-4" /> {t("Bonus")}
      </Link>

      {/* ── Who ── */}
      <div className="pb-1 pt-2">
        <h1 className="truncate text-xl font-semibold text-fg">{c.name}</h1>
        <p className="truncate text-sm text-fg-muted">
          {[c.phone, c.address].filter(Boolean).join(" · ") ||
            `#${c.display_number}`}
        </p>
      </div>

      <div className="flex flex-col sm:flex-row items-center justify-between gap-1 sm:gap-4">
        <Tabs
          activeKey={tab}
          className="w-full"
          onChange={changeTab}
          items={[
            { key: "items", label: t("Items") },
            { key: "invoices", label: t("Invoices") },
          ]}
        />
        {tab === "invoices" && (
          <div className="flex flex-wrap items-center justify-end gap-3 pb-4">
            <label className="w-full sm:w-auto">
              <span className="mb-1 block text-xs font-medium text-fg-muted">
                {t("Period")}
              </span>
              <RangePicker
                className="min-w-80! w-full! sm:w-auto!"
                value={range}
                allowClear
                placeholder={[t("All time"), t("All time")]}
                onChange={(v) => {
                  setRange(
                    v && v[0] && v[1] ? ([v[0], v[1]] as [Dayjs, Dayjs]) : null,
                  );
                  setInvSel([]);
                  setSel({});
                }}
                presets={rangePresets(t)}
              />
            </label>
          </div>
        )}
      </div>

      {tab === "items" ? (
        <PickedItemsBonus
          client={c}
          onSaved={(b) => {
            setPaperBonus(b);
            load();
          }}
        />
      ) : (
        <>
          {/* ── Which period, and what they bought ── */}
          <div className="mb-4">
            <dl className="grid grid-cols-2 md:grid-cols-4 rounded-xl border border-line bg-surface-raised shadow-card">
              {stats.map((s, i) => (
                <div
                  key={s.label}
                  className={`px-4 py-3 ${i % 2 === 1 ? "border-l border-line" : ""} ${i >= 2 ? "border-t border-line md:border-t-0" : ""} ${i === 2 ? "md:border-l" : ""}`}
                >
                  <dt className="text-xs text-fg-subtle">{s.label}</dt>
                  <dd className="tabular mt-0.5 truncate text-base font-semibold text-fg">
                    {s.value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          {!hasInvoices ? (
            <EmptyState
              icon={ReceiptText}
              title={range ? t("No results") : t("No invoices yet")}
              action={
                range ? (
                  <Button onClick={() => setRange(null)}>
                    {t("All time")}
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
              <div className="min-w-0 space-y-4">
                {/* ── 1. Invoices ── */}
                <Section
                  n={1}
                  title={t("Select invoices")}
                  right={
                    <span className="tabular text-sm text-fg-muted">
                      {invSel.length > 0 ? (
                        <>
                          <span className="font-semibold text-fg">
                            {money(selTotal)}
                          </span>{" "}
                          · {invSel.length}/{invoices.length}
                        </>
                      ) : (
                        num(invoices.length)
                      )}
                    </span>
                  }
                >
                  {markedCount > 0 && (
                    <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 bg-surface-sunken px-3 py-2 text-sm text-fg-muted">
                      <Gift className="h-4 w-4 shrink-0" aria-hidden />
                      <span className="min-w-0 flex-1">
                        {t("{n} marked", { n: num(markedCount) })}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setInvSel(
                            invoices
                              .filter((i) => i.bonus_marked_at)
                              .map((i) => i.id),
                          )
                        }
                        className="cursor-pointer rounded-md px-1.5 py-0.5 text-sm font-medium text-fg underline-offset-2 transition-colors duration-200 hover:underline"
                      >
                        {t("Select marked")}
                      </button>
                    </div>
                  )}
                  <div className="overflow-hidden border-b border-line">
                    <label className="flex min-h-11 cursor-pointer items-center gap-3 border-b border-line bg-surface-sunken px-4">
                      <Checkbox
                        checked={allChecked}
                        indeterminate={someChecked}
                        onChange={(e) =>
                          setInvSel(
                            e.target.checked ? invoices.map((i) => i.id) : [],
                          )
                        }
                      />
                      <span className="text-sm font-medium text-fg-muted">
                        {t("Select all")}
                      </span>
                    </label>
                    <div className="max-h-80 divide-y divide-line overflow-y-auto">
                      {invoices.map((inv) => {
                        const checked = invSel.includes(inv.id);
                        return (
                          <label
                            key={inv.id}
                            className={`flex min-h-14 cursor-pointer items-center gap-3 px-4 py-2 transition-colors duration-150 ${
                              checked
                                ? "bg-brand-soft/40"
                                : "hover:bg-surface-sunken"
                            }`}
                          >
                            <Checkbox
                              checked={checked}
                              onChange={(e) =>
                                toggleInvoice(inv.id, e.target.checked)
                              }
                            />
                            <div className="min-w-0 flex-1">
                              <p className="flex flex-wrap items-center gap-1.5">
                                <span className="font-mono text-sm text-fg">
                                  {inv.invoice_number}
                                </span>
                                {inv.status !== "paid" && (
                                  <StatusBadge status={inv.status} />
                                )}
                                {inv.bonus_marked_at && (
                                  <span
                                    className="inline-flex items-center gap-1 text-xs text-fg-muted"
                                    title={`${fmtDate(inv.bonus_marked_at)}${inv.bonus_marked_by ? ` · ${inv.bonus_marked_by}` : ""}`}
                                  >
                                    <Gift className="h-3 w-3" aria-hidden />{" "}
                                    {t("Marked")}
                                  </span>
                                )}
                                {rewarded.has(inv.invoice_number) && (
                                  <span className="text-xs text-fg-subtle">
                                    · {t("Rewarded")}
                                  </span>
                                )}
                              </p>
                              <p className="text-xs text-fg-subtle">
                                {fmtDate(inv.created_at, "dd MMM yyyy")}
                              </p>
                            </div>
                            <span className="tabular shrink-0 text-sm font-medium text-fg">
                              {money(inv.total)}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                </Section>

                {/* ── 2. Rewards: invoice total and/or per product ── */}
                <Section n={2} title={t("Reward")}>
                  {invSel.length === 0 ? (
                    <div className="px-4 pt-4">
                      <p className="rounded-lg border border-dashed border-line px-4 py-8 text-center text-sm text-fg-subtle">
                        {t("Select invoices first.")}
                      </p>
                    </div>
                  ) : (
                    <div>
                      {/* On the invoice total: one value, live result */}
                      <div className="py-3 px-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <p className="min-w-0 text-lg font-semibold text-fg">
                            {t("Invoice total")}
                            <span className="tabular ml-1.5 font-normal text-sm text-fg-subtle">
                              ({money(selTotal)})
                            </span>
                          </p>
                          <div className="flex items-center gap-2">
                            <RewardInput
                              label={t("Invoice total")}
                              type={invType}
                              pct={invPct}
                              amount={invAmt}
                              onType={setInvType}
                              onPct={setInvPct}
                              onAmount={setInvAmt}
                            />
                            <Amount value={invoiceBonus} />
                          </div>
                        </div>
                      </div>

                      <Divider className="my-0!">
                        <p className="w-full text-center text-sm text-fg-subtle">
                          {t("Or")}
                        </p>
                      </Divider>

                      {/* Per product: tick lines, give each a % or $ */}
                      <div className="border-b border-line">
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
                          <p className="text-lg font-semibold text-fg">
                            {t("Per product")}
                          </p>

                          {/* Shortcut: one % for every ticked product */}
                          <div className="text-sm text-fg-muted">
                            <label className="flex items-center gap-2">
                              {t("All ticked")}
                              <InputNumber
                                min={0}
                                max={100}
                                step={0.5}
                                className="w-24!"
                                suffix="%"
                                placeholder="0"
                                value={bulkPct}
                                onChange={setBulkPct}
                              />
                              <Button
                                disabled={!bulkPct || tickedCount === 0}
                                onClick={applyBulkPct}
                                size="small"
                                type="primary"
                              >
                                {t("Apply")}
                              </Button>
                            </label>
                          </div>
                        </div>

                        {groups.length === 0 ? (
                          <p className="px-4 py-6 text-center text-sm text-fg-subtle">
                            {t("No products")}
                          </p>
                        ) : (
                          <>
                            <div className="divide-y divide-line">
                              {groups.map(({ inv, lines }) => {
                                const groupTicked = lines.filter(
                                  (it) => sel[keyOf(it)]?.include,
                                ).length;
                                const groupAmount = round2(
                                  lines.reduce(
                                    (s, it) => s + lineAmount(it),
                                    0,
                                  ),
                                );
                                return (
                                  <div key={inv.id}>
                                    <div className="flex items-center justify-between gap-2 bg-surface-sunken/60 px-4 py-2">
                                      <label className="flex min-h-8 cursor-pointer items-center gap-2">
                                        <Checkbox
                                          checked={groupTicked === lines.length}
                                          indeterminate={
                                            groupTicked > 0 &&
                                            groupTicked < lines.length
                                          }
                                          onChange={(e) =>
                                            tickLines(
                                              lines,
                                              () => e.target.checked,
                                            )
                                          }
                                          aria-label={inv.invoice_number}
                                        />
                                        <span className="font-mono text-xs font-medium text-fg">
                                          {inv.invoice_number}
                                        </span>
                                        {inv.status !== "paid" && (
                                          <StatusBadge status={inv.status} />
                                        )}
                                        <span className="text-xs text-fg-subtle">
                                          {fmtDate(
                                            inv.created_at,
                                            "dd MMM yyyy",
                                          )}
                                        </span>
                                      </label>
                                      {groupAmount > 0 && (
                                        <span className="tabular text-xs font-medium text-fg">
                                          {money(groupAmount)}
                                        </span>
                                      )}
                                    </div>
                                    <ul className="divide-y divide-line">
                                      {lines.map((it) => {
                                        const k = keyOf(it);
                                        const s = sel[k];
                                        return (
                                          <li
                                            key={k}
                                            className={`flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5 transition-colors duration-150 ${
                                              s?.include
                                                ? "bg-brand-soft/30"
                                                : ""
                                            }`}
                                          >
                                            <label className="flex min-h-10 min-w-0 flex-[1_1_14rem] cursor-pointer items-center gap-3">
                                              <Checkbox
                                                checked={!!s?.include}
                                                onChange={(e) =>
                                                  updateSel(k, {
                                                    include: e.target.checked,
                                                  })
                                                }
                                              />
                                              <span className="min-w-0 flex-1">
                                                <span className="block truncate text-sm font-medium text-fg">
                                                  {it.product_name}
                                                </span>
                                                <span className="block text-xs text-fg-subtle">
                                                  {it.qty_desc} ·{" "}
                                                  {money(it.line_total)}
                                                </span>
                                              </span>
                                            </label>
                                            {s?.include && (
                                              <div className="ml-auto flex items-center gap-2">
                                                <RewardInput
                                                  label={it.product_name}
                                                  type={s.type}
                                                  pct={s.pct}
                                                  amount={s.amount}
                                                  onType={(t) =>
                                                    updateSel(k, { type: t })
                                                  }
                                                  onPct={(v) =>
                                                    updateSel(k, { pct: v })
                                                  }
                                                  onAmount={(v) =>
                                                    updateSel(k, { amount: v })
                                                  }
                                                />
                                                <Amount
                                                  value={lineAmount(it)}
                                                />
                                              </div>
                                            )}
                                          </li>
                                        );
                                      })}
                                    </ul>
                                  </div>
                                );
                              })}
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </Section>
              </div>

              {/* ── 3. Review and save ── */}
              <aside className="rounded-xl border border-line bg-surface-raised shadow-card xl:sticky xl:top-20">
                <header className="flex items-center gap-2.5 border-b border-line px-4 py-3">
                  <span className="tabular flex h-6 w-6 items-center justify-center rounded-full bg-brand text-xs font-semibold text-brand-foreground">
                    3
                  </span>
                  <h2 className="font-semibold text-fg">{t("Summary")}</h2>
                </header>
                <div className="p-4">
                  <dl className="space-y-2 text-sm">
                    <div className="flex justify-between gap-3">
                      <dt className="text-fg-muted">{t("Invoices")}</dt>
                      <dd className="tabular text-fg">
                        {invSel.length
                          ? `${invSel.length} · ${money(selTotal)}`
                          : "—"}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-fg-muted">{t("Invoice total")}</dt>
                      <dd className="tabular text-fg">
                        {invoiceBonus > 0 ? money(invoiceBonus) : "—"}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-fg-muted">
                        {t("Per product")}
                        {pickedItems.length ? ` (${pickedItems.length})` : ""}
                      </dt>
                      <dd className="tabular text-fg">
                        {itemsAmount > 0 ? money(itemsAmount) : "—"}
                      </dd>
                    </div>
                  </dl>
                  <div className="mt-3 flex items-baseline justify-between border-t border-line pt-3">
                    <span className="font-medium text-fg">
                      {t("Total bonus")}
                    </span>
                    <span className="tabular text-2xl font-bold text-fg">
                      {money(totalAmount)}
                    </span>
                  </div>

                  {awardedRewarded > 0 && (
                    <p
                      role="status"
                      className="mt-3 flex items-start gap-1.5 rounded-lg bg-amber-50 p-2.5 text-xs text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
                    >
                      <CircleAlert
                        className="mt-0.5 h-3.5 w-3.5 shrink-0"
                        aria-hidden
                      />
                      {t("{n} rewarded before", { n: awardedRewarded })}
                    </p>
                  )}
                  {awardedOwing > 0 && (
                    <p
                      role="status"
                      className="mt-3 flex items-start gap-1.5 rounded-lg bg-amber-50 p-2.5 text-xs text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
                    >
                      <CircleAlert
                        className="mt-0.5 h-3.5 w-3.5 shrink-0"
                        aria-hidden
                      />
                      {t("{n} not fully paid", { n: awardedOwing })}
                    </p>
                  )}

                  <label className="mt-4 block">
                    <span className="mb-1 block text-xs font-medium text-fg-muted">
                      {t("Note")}
                    </span>
                    <Input.TextArea
                      rows={2}
                      maxLength={500}
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                    />
                  </label>

                  <Button
                    type="primary"
                    size="large"
                    block
                    className="mt-4!"
                    loading={saving}
                    disabled={!canSave}
                    onClick={save}
                  >
                    {t("Save")}
                  </Button>
                  {/* <p className="mt-2 text-center text-xs text-fg-subtle">
                Saved as a record only. Balances are not changed.
              </p> */}
                </div>
              </aside>
            </div>
          )}

          {/* Floating save bar for tablet/phone: the summary card is below the
          fold there. Sticky (not fixed) so it settles into the flow at the end
          of the page and never covers the sidebar. */}
          {hasInvoices && (
            <div className="sticky bottom-3 z-20 mt-4 flex items-center justify-between gap-3 rounded-xl border border-line bg-surface-raised/95 p-3 shadow-lg backdrop-blur xl:hidden">
              <div className="min-w-0">
                <p className="text-xs font-medium text-fg-subtle">
                  {t("Total bonus")}
                </p>
                <p className="tabular text-xl font-bold leading-tight text-fg">
                  {money(totalAmount)}
                </p>
              </div>
              <Button
                type="primary"
                size="large"
                loading={saving}
                disabled={!canSave}
                onClick={save}
              >
                {t("Save")}
              </Button>
            </div>
          )}
        </>
      )}

      {/* ── Bonus history ── */}
      <section className="mt-4 rounded-xl border border-line bg-surface-raised shadow-card">
        <header className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
          <h2 className="font-semibold text-fg">{t("History")}</h2>
          {history.length > 0 && (
            <span className="tabular text-sm text-fg-muted">
              {money(givenTotal)}
            </span>
          )}
        </header>
        {history.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-fg-subtle">
            {t("No bonus yet")}
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {history.map((b) => {
              const lines = b.items?.length ?? 0;
              const parts = [
                b.invoice_count > 0
                  ? t("{n} invoices", { n: num(b.invoice_count) })
                  : t("Picked items"),
                lines ? t("{n} products", { n: num(lines) }) : null,
                b.level1_type
                  ? b.level1_type === "percent"
                    ? `${Number(b.level1_pct)}%`
                    : t("Fixed")
                  : null,
              ].filter(Boolean);
              return (
                <li
                  key={b.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3"
                >
                  {/* Phones: details on top, amount + actions on their own row */}
                  <div className="w-full min-w-0 sm:w-auto sm:flex-1">
                    <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
                      <span className="font-mono text-xs text-fg-muted">
                        {bonusRef(b)}
                      </span>
                      <span className="font-medium text-fg">
                        {fmtDate(b.period_from, "dd MMM yyyy")}
                        {b.period_to !== b.period_from &&
                          ` – ${fmtDate(b.period_to, "dd MMM yyyy")}`}
                      </span>
                    </p>
                    <p className="text-xs text-fg-subtle">
                      {parts.join(" · ")} · {b.created_by || "—"} ·{" "}
                      {fmtDate(b.created_at, "dd MMM yyyy")}
                    </p>
                  </div>
                  <span className="tabular font-semibold text-fg">
                    {money(b.total_amount)}
                  </span>
                  <div className="ml-auto flex items-center gap-1.5 sm:ml-0">
                    <Button
                      icon={<FileText className="h-4 w-4" />}
                      onClick={() => setPaperBonus(b)}
                    >
                      {t("Print")}
                    </Button>
                    <Popconfirm
                      title={t("Delete?")}
                      okText={t("Delete")}
                      cancelText={t("Cancel")}
                      okButtonProps={{ danger: true }}
                      onConfirm={() => removeBonus(b.id)}
                    >
                      <Button
                        danger
                        icon={<Trash2 className="h-4 w-4" />}
                        aria-label={t("Delete")}
                      />
                    </Popconfirm>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <BonusPaperModal
        bonus={paperBonus}
        client={c}
        onClose={() => setPaperBonus(null)}
      />
    </div>
  );
}
