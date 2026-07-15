"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Checkbox, DatePicker, Input, Popconfirm, Segmented, Switch } from "antd";
import { InputNumber } from "@/components/ui/input-number";
import { Button } from "@/components/ui/button";
import dayjs, { Dayjs } from "dayjs";
import { toast } from "react-toastify";
import {
  ArrowLeft, Boxes, CircleAlert, Gift, Handshake, ImageDown, ListChecks,
  Package, ReceiptText, Trash2, Trophy,
} from "lucide-react";
import api, { apiError } from "@/services/api";
import { useRealtime } from "@/hooks/useRealtime";
import { SectionHeader } from "@/components/ui/section-header";
import { StatCard } from "@/components/ui/stat-card";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty-state";
import BonusPaperModal from "@/components/bonus/bonus-paper-modal";
import { money, fmtDate } from "@/lib/format";
import type { Bonus, BonusDetail, BonusEligibleItem } from "@/lib/types";

const { RangePicker } = DatePicker;

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

// Per-line reward choice for the item level. A line only counts toward the
// total once it has a usable value (pct or fixed amount), so half-filled rows
// are simply ignored instead of blocking the save.
type ItemSel = { include: boolean; type: "percent" | "fixed"; pct: number | null; amount: number | null };
const keyOf = (it: BonusEligibleItem) => `${it.sale_id}|${it.product_id ?? "x"}|${it.product_name}`;

export default function BonusDetailPage() {
  const params = useParams<{ id: string }>();
  const query = useSearchParams();
  const clientId = Number(params.id);

  const [range, setRange] = useState<[Dayjs, Dayjs]>(() => {
    const f = query.get("from");
    const t = query.get("to");
    return f && t && dayjs(f).isValid() && dayjs(t).isValid()
      ? [dayjs(f), dayjs(t)]
      : [dayjs().startOf("month"), dayjs()];
  });
  const from = range[0].format("YYYY-MM-DD");
  const to = range[1].format("YYYY-MM-DD");

  const [detail, setDetail] = useState<BonusDetail | null>(null);
  const [loading, setLoading] = useState(true);

  // Invoice selection scopes BOTH levels; every paid invoice starts selected
  const [invSel, setInvSel] = useState<number[]>([]);

  // Item level (used most often, so it comes first and starts enabled).
  // Every line of the selected invoices is listed and manually tickable; the
  // limit is only a quick-tick helper, not a filter that hides lines.
  const [itemsOn, setItemsOn] = useState(true);
  const [qtyLimit, setQtyLimit] = useState<number | null>(null);
  const [sel, setSel] = useState<Record<string, ItemSel>>({});

  // Invoice-total level: % of the selected invoices' sum, or a fixed amount
  const [invOn, setInvOn] = useState(false);
  const [invType, setInvType] = useState<"percent" | "fixed">("percent");
  const [invPct, setInvPct] = useState<number | null>(null);
  const [invAmt, setInvAmt] = useState<number | null>(null);

  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [paperBonus, setPaperBonus] = useState<Bonus | null>(null);

  const load = useCallback(() => {
    api
      .get(`/bonuses/clients/${clientId}`, { params: { from, to } })
      .then(({ data }) => setDetail(data))
      .catch(() => setDetail(null))
      .finally(() => setLoading(false));
  }, [clientId, from, to]);
  useEffect(load, [load]);
  useRealtime(["sale:created", "sale:updated", "sale:voided", "bonus:changed"], load);

  const invoices = detail?.invoices ?? [];
  const selectedInvoices = useMemo(() => invoices.filter((i) => invSel.includes(i.id)), [invoices, invSel]);
  const selTotal = round2(selectedInvoices.reduce((s, i) => s + Number(i.total), 0));
  const selQty = selectedInvoices.reduce((s, i) => s + Number(i.qty), 0);
  const toggleInvoice = (id: number, on: boolean) =>
    setInvSel((prev) => (on ? [...prev, id] : prev.filter((x) => x !== id)));

  // Item level: every line of the selected invoices, grouped under its
  // invoice so it's always obvious where a quantity came from
  const groups = useMemo(
    () =>
      selectedInvoices
        .map((inv) => ({
          inv,
          lines: (detail?.items ?? []).filter((it) => it.sale_id === inv.id),
        }))
        .filter((g) => g.lines.length > 0),
    [selectedInvoices, detail]
  );
  // Quick-tick: (un)tick every visible line by whether the quantity bought
  // (in the units it was sold, e.g. 1000 boxes = 1000) reached the limit
  const quickTick = () => {
    const lim = qtyLimit ?? 0;
    setSel((prev) => {
      const next = { ...prev };
      for (const g of groups) {
        for (const it of g.lines) {
          const k = keyOf(it);
          const base: ItemSel = next[k] ?? { include: false, type: "percent", pct: null, amount: null };
          next[k] = { ...base, include: Number(it.qty) >= lim };
        }
      }
      return next;
    });
  };
  // Tick/untick every line of one invoice at once (group header checkbox)
  const tickGroup = (lines: BonusEligibleItem[], on: boolean) =>
    setSel((prev) => {
      const next = { ...prev };
      for (const it of lines) {
        const k = keyOf(it);
        const base: ItemSel = next[k] ?? { include: false, type: "percent", pct: null, amount: null };
        next[k] = { ...base, include: on };
      }
      return next;
    });
  // One % for every ticked line in one go (the most common way to award)
  const [bulkPct, setBulkPct] = useState<number | null>(null);
  const applyBulkPct = () => {
    if (!bulkPct || bulkPct <= 0 || bulkPct > 100) return;
    setSel((prev) => {
      const next = { ...prev };
      for (const [k, s] of Object.entries(next)) {
        if (s.include) next[k] = { ...s, type: "percent", pct: bulkPct };
      }
      return next;
    });
  };
  const lineAmount = useCallback(
    (it: BonusEligibleItem) => {
      const s = sel[keyOf(it)];
      if (!s?.include) return 0;
      if (s.type === "fixed") return s.amount && s.amount > 0 ? round2(s.amount) : 0;
      return s.pct && s.pct > 0 ? round2((Number(it.line_total) * s.pct) / 100) : 0;
    },
    [sel]
  );
  const visibleLines = useMemo(() => groups.flatMap((g) => g.lines), [groups]);
  const tickedCount = visibleLines.filter((it) => sel[keyOf(it)]?.include).length;
  const pickedItems = useMemo(
    () => (itemsOn ? visibleLines.filter((it) => lineAmount(it) > 0) : []),
    [itemsOn, visibleLines, lineAmount]
  );
  const itemsAmount = round2(pickedItems.reduce((s, it) => s + lineAmount(it), 0));

  const updateSel = (key: string, patch: Partial<ItemSel>) =>
    setSel((prev) => {
      const base: ItemSel = prev[key] ?? { include: false, type: "percent", pct: null, amount: null };
      return { ...prev, [key]: { ...base, ...patch } };
    });

  // Invoice-total level math (on the selected invoices only)
  const invoiceBonus = !invOn
    ? 0
    : invType === "fixed"
      ? invAmt && invAmt > 0 ? round2(invAmt) : 0
      : invPct && invPct > 0 && selTotal > 0 ? round2((selTotal * invPct) / 100) : 0;

  const totalAmount = round2(itemsAmount + invoiceBonus);

  // A period that overlaps an already-awarded one is legal but worth flagging
  const overlaps = useMemo(
    () =>
      (detail?.history ?? []).some(
        (b) => dayjs(b.period_from).format("YYYY-MM-DD") <= to && dayjs(b.period_to).format("YYYY-MM-DD") >= from
      ),
    [detail, from, to]
  );

  const resetInputs = () => {
    setSel({});
    setInvOn(false);
    setInvPct(null);
    setInvAmt(null);
    setNote("");
  };

  const save = () => {
    if (!detail) return;
    setSaving(true);
    api
      .post("/bonuses", {
        client_id: clientId,
        from,
        to,
        invoice_ids: invSel,
        level1: invOn && invoiceBonus > 0
          ? { type: invType, pct: invType === "percent" ? invPct : null, amount: invType === "fixed" ? invAmt : null }
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
        toast.success("Bonus saved");
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
        toast.success("Bonus deleted");
        load();
      })
      .catch((err) => toast.error(apiError(err)));

  if (loading && !detail) {
    return <div className="flex justify-center py-24"><Spinner /></div>;
  }
  if (!detail) {
    return (
      <EmptyState
        icon={CircleAlert}
        title="Client not found"
        action={<Link href="/admin/bonus"><Button>Back to partners</Button></Link>}
      />
    );
  }

  const allChecked = invoices.length > 0 && invSel.length === invoices.length;
  const someChecked = invSel.length > 0 && !allChecked;

  return (
    <div>
      <div className="mb-3">
        <Link
          href="/admin/bonus"
          className="inline-flex cursor-pointer items-center gap-1.5 text-sm text-fg-muted transition-colors duration-200 hover:text-fg"
        >
          <ArrowLeft className="h-4 w-4" /> All partners
        </Link>
      </div>

      <SectionHeader
        title={detail.client.name}
        subtitle={detail.client.phone || detail.client.email || `Partner #${detail.client.display_number}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-2.5 py-1 text-xs font-medium text-brand-soft-foreground">
              <Handshake className="h-3.5 w-3.5" /> Partner
            </span>
            <RangePicker
              value={range}
              allowClear={false}
              onChange={(v) => {
                if (!v) return;
                setRange(v as [Dayjs, Dayjs]);
                resetInputs();
              }}
              presets={[
                { label: "This month", value: [dayjs().startOf("month"), dayjs()] },
                { label: "Last month", value: [dayjs().subtract(1, "month").startOf("month"), dayjs().subtract(1, "month").endOf("month")] },
                { label: "Last 3 months", value: [dayjs().subtract(2, "month").startOf("month"), dayjs()] },
                { label: "This year", value: [dayjs().startOf("year"), dayjs()] },
              ]}
            />
          </div>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {/* Money never truncates: full width on phones, one of three on sm+ */}
        <StatCard title="Paid total" value={money(detail.period.paid_total)} icon={Trophy} accent="emerald" hint="Grand total of paid invoices" className="col-span-2 sm:order-2 sm:col-span-1" />
        <StatCard title="Fully paid invoices" value={detail.period.invoice_count} icon={ReceiptText} hint="In the selected period" className="sm:order-1" />
        <StatCard title="Items bought" value={Number(detail.period.qty).toLocaleString()} icon={Package} hint="Counted as sold" className="sm:order-3" />
      </div>

      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          {/* ── Invoice selection: scopes both reward levels ── */}
          <section className="rounded-xl border border-line bg-surface-raised p-4 shadow-card">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-soft text-brand-soft-foreground">
                  <ListChecks className="h-4.5 w-4.5" />
                </span>
                <div>
                  <p className="font-semibold text-fg">Invoices in this period</p>
                  <p className="text-xs text-fg-muted">Untick any invoice you don&apos;t want counted in the bonus</p>
                </div>
              </div>
              <div className="text-right">
                <p className="tabular text-lg font-semibold text-fg">{money(selTotal)}</p>
                <p className="text-xs text-fg-subtle">{invSel.length} of {invoices.length} selected</p>
              </div>
            </div>

            {invoices.length === 0 ? (
              <p className="mt-4 py-4 text-center text-sm text-fg-subtle">No fully paid invoices in this period</p>
            ) : (
              <div className="mt-4 overflow-hidden rounded-lg border border-line">
                <label className="flex cursor-pointer items-center gap-3 border-b border-line bg-surface-sunken px-3 py-2">
                  <Checkbox
                    checked={allChecked}
                    indeterminate={someChecked}
                    onChange={(e) => setInvSel(e.target.checked ? invoices.map((i) => i.id) : [])}
                  />
                  <span className="text-xs font-medium text-fg-muted">Select all</span>
                  <span className="ml-auto text-[11px] text-fg-subtle">{selQty.toLocaleString()} items selected</span>
                </label>
                <div className="max-h-64 divide-y divide-line overflow-y-auto sm:max-h-80">
                  {invoices.map((inv) => {
                    const checked = invSel.includes(inv.id);
                    return (
                      <label
                        key={inv.id}
                        className={`flex cursor-pointer items-center gap-3 px-3 py-2.5 transition-colors duration-200 hover:bg-surface-sunken ${checked ? "" : "opacity-55"}`}
                      >
                        <Checkbox checked={checked} onChange={(e) => toggleInvoice(inv.id, e.target.checked)} />
                        <div className="min-w-0 flex-1">
                          <p className="font-mono text-xs text-fg">{inv.invoice_number}</p>
                          <p className="text-[11px] text-fg-subtle">{fmtDate(inv.created_at, "dd MMM yyyy HH:mm")}</p>
                        </div>
                        {/* <span className="tabular shrink-0 text-xs text-fg-muted">{Number(inv.qty).toLocaleString()} items</span> */}
                        <span className="tabular w-20 shrink-0 text-right text-sm font-medium text-fg">{money(inv.total)}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </section>

          {/* ── Item quantity bonus (most used, so it comes first) ── */}
          <section className={`rounded-xl border border-line bg-surface-raised p-4 shadow-card transition-opacity duration-200 ${itemsOn ? "" : "opacity-70"}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-soft text-brand-soft-foreground">
                  <Boxes className="h-4.5 w-4.5" />
                </span>
                <div>
                  <p className="font-semibold text-fg">Item quantity bonus</p>
                  <p className="text-xs text-fg-muted text-truncate">Tick the product lines to reward</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {itemsOn && tickedCount > 0 && (
                  <span className="rounded-full bg-brand-soft px-2.5 py-0.5 text-xs font-medium text-brand-soft-foreground">
                    {tickedCount} line{tickedCount === 1 ? "" : "s"} ticked
                  </span>
                )}
                <Switch checked={itemsOn} onChange={setItemsOn} />
              </div>
            </div>

            {/* Bulk helpers: tick by quantity, then one % for everything ticked */}
            {itemsOn && groups.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2.5 rounded-lg bg-surface-sunken px-3 py-2.5">
                <label className="flex w-full flex-wrap items-center gap-2 text-xs font-medium text-fg-muted sm:w-auto">
                  Tick lines with at least
                  <InputNumber min={0} className="w-24!" placeholder="100" value={qtyLimit} onChange={(v) => setQtyLimit(v)} />
                  <Button disabled={!qtyLimit} onClick={quickTick}>Tick</Button>
                </label>
                <span className="hidden h-4 w-px bg-line sm:block" />
                <label className="flex w-full flex-wrap items-center gap-2 text-xs font-medium text-fg-muted sm:w-auto">
                  Give every ticked line
                  <InputNumber min={0} max={100} step={0.5} className="w-24!" suffix="%" placeholder="2" value={bulkPct} onChange={(v) => setBulkPct(v)} />
                  <Button disabled={!bulkPct || tickedCount === 0} onClick={applyBulkPct}>Apply</Button>
                </label>
              </div>
            )}

            {itemsOn && (
              <div className="mt-4 space-y-3">
                {groups.length === 0 ? (
                  <p className="py-4 text-center text-sm text-fg-subtle">
                    {invSel.length === 0
                      ? "Select at least one invoice above"
                      : "The selected invoices have no item lines"}
                  </p>
                ) : (
                  groups.map(({ inv, lines }) => {
                    const groupTicked = lines.filter((it) => sel[keyOf(it)]?.include).length;
                    return (
                    <div key={inv.id} className="overflow-hidden rounded-lg border border-line">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-surface-sunken px-3 py-2">
                        <label className="flex cursor-pointer items-center gap-2">
                          <Checkbox
                            checked={groupTicked === lines.length}
                            indeterminate={groupTicked > 0 && groupTicked < lines.length}
                            onChange={(e) => tickGroup(lines, e.target.checked)}
                          />
                          <ReceiptText className="h-3.5 w-3.5 text-fg-subtle" />
                          <span className="font-mono text-xs font-medium text-fg">{inv.invoice_number}</span>
                          <span className="text-[11px] text-fg-subtle">{fmtDate(inv.created_at, "dd MMM yyyy")}</span>
                        </label>
                        <span className="tabular text-xs text-fg-muted">{money(inv.total)}</span>
                      </div>
                      <ul className="divide-y divide-line">
                        {lines.map((it) => {
                          const k = keyOf(it);
                          const s = sel[k];
                          const amt = lineAmount(it);
                          return (
                            <li
                              key={k}
                              className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2.5 transition-colors duration-200 ${
                                s?.include ? "bg-brand-soft/40" : "hover:bg-surface-sunken"
                              }`}
                            >
                              {/* Name area is one big tap target; the reward
                                  controls wrap to their own right-aligned row
                                  on narrow screens instead of squeezing */}
                              <label className="flex min-w-0 flex-[1_1_15rem] cursor-pointer items-center gap-3 py-1">
                                <Checkbox
                                  checked={!!s?.include}
                                  onChange={(e) => updateSel(k, { include: e.target.checked })}
                                />
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-sm font-medium text-fg">{it.product_name}</p>
                                  <p className="text-xs text-fg-subtle">
                                    <span className="font-medium text-fg-muted">{it.qty_desc}</span>
                                    {" · "}{money(it.line_total)}
                                  </p>
                                </div>
                              </label>
                              <div className="ml-auto flex items-center gap-2">
                                <Segmented
                                  value={s?.type ?? "percent"}
                                  onChange={(v) => updateSel(k, { type: v as ItemSel["type"] })}
                                  options={[
                                    { value: "percent", label: "%" },
                                    { value: "fixed", label: "$" },
                                  ]}
                                />
                                {(s?.type ?? "percent") === "percent" ? (
                                  <InputNumber
                                    className="w-20!" min={0} max={100} step={0.5}
                                    placeholder="%" value={s?.pct ?? null}
                                    onChange={(v) => updateSel(k, { pct: v })}
                                  />
                                ) : (
                                  <InputNumber
                                    className="w-20!" min={0} step={0.5}
                                    placeholder="$" value={s?.amount ?? null}
                                    onChange={(v) => updateSel(k, { amount: v })}
                                  />
                                )}
                                <span className="tabular w-16 text-right text-sm">
                                  {!s?.include ? (
                                    <span className="text-fg-subtle">—</span>
                                  ) : amt > 0 ? (
                                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">{money(amt)}</span>
                                  ) : (
                                    <span className="text-xs text-amber-600 dark:text-amber-400">set value</span>
                                  )}
                                </span>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                    );
                  })
                )}
              </div>
            )}
          </section>

          {/* ── Invoice total bonus (optional second level) ── */}
          <section className={`rounded-xl border border-line bg-surface-raised p-4 shadow-card transition-opacity duration-200 ${invOn ? "" : "opacity-70"}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-soft text-brand-soft-foreground">
                  <ReceiptText className="h-4.5 w-4.5" />
                </span>
                <div>
                  <p className="font-semibold text-fg">Invoice total bonus</p>
                  <p className="text-xs text-fg-muted text-truncate">One reward on the sum of the selected invoices</p>
                </div>
              </div>
              <Switch checked={invOn} onChange={setInvOn} />
            </div>

            {invOn && (
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-[auto_1fr]">
                <div className="rounded-lg bg-surface-sunken px-4 py-3">
                  <p className="text-xs text-fg-muted">{invSel.length} invoice{invSel.length === 1 ? "" : "s"} selected</p>
                  <p className="tabular mt-0.5 text-xl font-semibold text-fg">{money(selTotal)}</p>
                </div>
                <div className="flex flex-col justify-center gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Segmented
                      value={invType}
                      onChange={(v) => setInvType(v as "percent" | "fixed")}
                      options={[
                        { value: "percent", label: "Percentage" },
                        { value: "fixed", label: "Fixed amount" },
                      ]}
                    />
                    {invType === "percent" ? (
                      <InputNumber
                        className="w-28!" min={0} max={100} step={0.5} placeholder="e.g. 2"
                        value={invPct} onChange={(v) => setInvPct(v)} suffix="%"
                      />
                    ) : (
                      <InputNumber
                        className="w-28!" min={0} step={0.5} placeholder="e.g. 50"
                        value={invAmt} onChange={(v) => setInvAmt(v)} prefix="$"
                      />
                    )}
                  </div>
                  <p className="text-sm text-fg">
                    {invoiceBonus > 0 ? (
                      invType === "percent" ? (
                        <>
                          {invPct}% × {money(selTotal)} = <span className="tabular font-semibold">{money(invoiceBonus)}</span>
                        </>
                      ) : (
                        <>Fixed reward: <span className="tabular font-semibold">{money(invoiceBonus)}</span></>
                      )
                    ) : (
                      <span className="text-fg-subtle">
                        {invType === "percent" ? "Enter a percentage to see the reward" : "Enter an amount"}
                      </span>
                    )}
                  </p>
                </div>
              </div>
            )}
          </section>

        </div>

        {/* ── Summary / save ── */}
        <aside className="rounded-xl border border-line bg-surface-raised p-4 shadow-card xl:sticky xl:top-20">
          <div className="mb-3 flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand text-brand-foreground">
              <Gift className="h-4.5 w-4.5" />
            </span>
            <div>
              <p className="font-semibold text-fg">Bonus summary</p>
              <p className="text-xs text-fg-muted">
                {fmtDate(from, "dd MMM yyyy")} – {fmtDate(to, "dd MMM yyyy")}
              </p>
            </div>
          </div>

          <dl className="space-y-1.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-fg-muted">Invoices selected</dt>
              <dd className="tabular font-medium text-fg">{invSel.length} · {money(selTotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-fg-muted">Item bonus ({pickedItems.length} line{pickedItems.length === 1 ? "" : "s"})</dt>
              <dd className="tabular font-medium text-fg">{itemsAmount > 0 ? money(itemsAmount) : <span className="text-fg-subtle">—</span>}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-fg-muted">Invoice total bonus</dt>
              <dd className="tabular font-medium text-fg">{invoiceBonus > 0 ? money(invoiceBonus) : <span className="text-fg-subtle">—</span>}</dd>
            </div>
          </dl>
          <div className="mt-3 flex items-baseline justify-between border-t border-line pt-3">
            <span className="font-medium text-fg">Total bonus</span>
            <span className="tabular text-2xl font-bold text-fg">{money(totalAmount)}</span>
          </div>

          {overlaps && (
            <p className="mt-3 flex items-start gap-1.5 rounded-lg bg-brand/10 p-2.5 text-xs text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
              <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              A past bonus already covers part of this period
            </p>
          )}

          <div className="mt-3">
            <span className="mb-1 block text-xs font-medium text-fg-muted">Note (shown on the paper)</span>
            <Input.TextArea
              rows={2}
              maxLength={500}
              placeholder="Optional message for the client"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          <Button type="primary" size="large" block className="mt-4!" loading={saving} disabled={totalAmount <= 0 || invSel.length === 0} onClick={save}>
            Save bonus & make paper
          </Button>
          <p className="mt-2 text-center text-[11px] text-fg-subtle">
            Saved as a record only: balances and the payment ledger are not touched.
          </p>
        </aside>
      </div>

      {/* ── Past bonuses (full width, below the working area) ── */}
      <section className="mt-4 rounded-xl border border-line bg-surface-raised p-4 shadow-card">
        <div className="mb-3 flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-soft text-brand-soft-foreground">
            <Trophy className="h-4.5 w-4.5" />
          </span>
          <div>
            <p className="font-semibold text-fg">Bonus history</p>
            <p className="text-xs text-fg-muted">All bonuses ever awarded to this partner</p>
          </div>
        </div>
        {detail.history.length === 0 ? (
          <p className="py-4 text-center text-sm text-fg-subtle">No bonus awarded yet</p>
        ) : (
          <ul className="divide-y divide-line">
            {detail.history.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-fg">
                    {fmtDate(b.period_from, "dd MMM yyyy")} – {fmtDate(b.period_to, "dd MMM yyyy")}
                    <span className="tabular ml-2 font-semibold text-emerald-600 dark:text-emerald-400">{money(b.total_amount)}</span>
                  </p>
                  <p className="text-xs text-fg-subtle">
                    {b.items?.length ?? 0} item line{(b.items?.length ?? 0) === 1 ? "" : "s"}
                    {" · "}
                    {b.level1_type
                      ? b.level1_type === "percent"
                        ? `invoice bonus ${Number(b.level1_pct)}%`
                        : "invoice bonus fixed"
                      : "no invoice bonus"}
                    {" · by "}{b.created_by || "—"}{", "}{fmtDate(b.created_at, "dd MMM yyyy")}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <Button icon={<ImageDown className="h-3.5 w-3.5" />} onClick={() => setPaperBonus(b)}>
                    Reciept
                  </Button>
                  <Popconfirm title="Delete this bonus record?" okText="Delete" okButtonProps={{ danger: true }} onConfirm={() => removeBonus(b.id)}>
                    <Button danger icon={<Trash2 className="h-3.5 w-3.5" />} aria-label="Delete bonus" />
                  </Popconfirm>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Floating save bar for tablet/phone: the summary card is below the
          fold there, so the running total and Save stay reachable while
          ticking lines. Sticky (not fixed) so it settles into the flow at
          the end of the page and never covers the sidebar. */}
      <div className="sticky bottom-3 z-20 mt-4 flex items-center justify-between gap-3 rounded-xl border border-line bg-surface-raised/95 p-3 shadow-lg backdrop-blur xl:hidden">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-wide text-fg-subtle">Total bonus</p>
          <p className="tabular text-xl font-bold leading-tight text-fg">{money(totalAmount)}</p>
          <p className="truncate text-[11px] text-fg-subtle">
            {invSel.length} invoice{invSel.length === 1 ? "" : "s"} · {pickedItems.length} item line{pickedItems.length === 1 ? "" : "s"}
            {invoiceBonus > 0 ? " · invoice bonus" : ""}
          </p>
        </div>
        <Button
          type="primary"
          size="large"
          loading={saving}
          disabled={totalAmount <= 0 || invSel.length === 0}
          onClick={save}
        >
          Save bonus
        </Button>
      </div>

      <BonusPaperModal bonus={paperBonus} onClose={() => setPaperBonus(null)} />
    </div>
  );
}
