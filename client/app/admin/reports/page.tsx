"use client";
import { useCallback, useEffect, useState } from "react";
import { DatePicker, Segmented } from "antd";
import { Button } from "@/components/ui/button";
import dayjs, { Dayjs } from "dayjs";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip,
  CartesianGrid, Legend,
} from "recharts";
import { DollarSign, ReceiptText, TrendingUp, Download, HandCoins } from "lucide-react";
import api from "@/services/api";
import { useRealtime } from "@/hooks/useRealtime";
import { SectionHeader } from "@/components/ui/section-header";
import { ChartTooltipContent, ChartLegendContent, type ChartConfig } from "@/components/ui/chart";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { money } from "@/lib/format";

const { RangePicker } = DatePicker;

interface Summary {
  totals: { invoice_count: number; revenue: number; collected: number; outstanding: number; tax: number; discount: number; profit: number; avg_sale: number; items_sold: number };
  series: { period: string; invoice_count: number; revenue: number; profit: number }[];
  payment_methods: { payment_method: string; invoice_count: number; revenue: number }[];
  top_products: { name: string; quantity: number; revenue: number }[];
  top_clients: { name: string; invoice_count: number; revenue: number }[];
  group: string;
}

// Profit is always a subset of revenue, so the two areas overlap rather
// than stack: the profit band reads inside the revenue band.
const REPORT_CHART: ChartConfig = {
  revenue: { label: "Revenue", color: "var(--chart-1)" },
  profit: { label: "Profit", color: "var(--chart-2)" },
};

const PRESETS = [
  { label: "Today", value: [dayjs(), dayjs()] as [Dayjs, Dayjs] },
  { label: "Last 7 days", value: [dayjs().subtract(6, "day"), dayjs()] as [Dayjs, Dayjs] },
  { label: "This month", value: [dayjs().startOf("month"), dayjs()] as [Dayjs, Dayjs] },
  { label: "Last month", value: [dayjs().subtract(1, "month").startOf("month"), dayjs().subtract(1, "month").endOf("month")] as [Dayjs, Dayjs] },
  { label: "This year", value: [dayjs().startOf("year"), dayjs()] as [Dayjs, Dayjs] },
];

export default function ReportsPage() {
  const [range, setRange] = useState<[Dayjs, Dayjs]>([dayjs().subtract(29, "day"), dayjs()]);
  const [group, setGroup] = useState<"day" | "month" | "year">("day");
  const [data, setData] = useState<Summary | null>(null);

  const load = useCallback(() => {
    api
      .get("/reports/summary", {
        params: { from: range[0].format("YYYY-MM-DD"), to: range[1].format("YYYY-MM-DD"), group },
      })
      .then(({ data }) => setData(data))
      .catch(() => {});
  }, [range, group]);

  useEffect(load, [load]);
  useRealtime(["sale:created", "sale:updated", "sale:voided"], load);

  const exportCsv = () => {
    if (!data) return;
    const lines = [
      "period,invoices,revenue,profit",
      ...data.series.map((r) => `${r.period},${r.invoice_count},${r.revenue},${r.profit}`),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `chamnenh-report-${range[0].format("YYYYMMDD")}-${range[1].format("YYYYMMDD")}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const t = data?.totals;

  return (
    <div>
      <SectionHeader
        title="Reports"
        subtitle="Pick any date range and group it by day, month or year"
        actions={<Button icon={<Download className="h-4 w-4" />} onClick={exportCsv}>Export CSV</Button>}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <RangePicker
          allowClear={false}
          value={range}
          presets={PRESETS}
          onChange={(v) => v && setRange(v as [Dayjs, Dayjs])}
        />
        <Segmented
          value={group}
          onChange={(v) => setGroup(v as typeof group)}
          options={[
            { label: "By day", value: "day" },
            { label: "By month", value: "month" },
            { label: "By year", value: "year" },
          ]}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Revenue" value={money(t?.revenue)} icon={DollarSign} accent="brand"
          hint={`Tax collected ${money(t?.tax)}`} />
        <StatCard title="Collected" value={money(t?.collected)} icon={HandCoins} accent="emerald"
          hint={
            Number(t?.outstanding) > 0 ? (
              <span className="text-rose-600 dark:text-rose-400">{money(t?.outstanding)} still owing</span>
            ) : "All sales fully paid"
          } />
        <StatCard title="Profit" value={money(t?.profit)} icon={TrendingUp} accent="amber"
          hint={`Discounts given ${money(t?.discount)}`} />
        <StatCard title="Invoices" value={t?.invoice_count ?? 0} icon={ReceiptText} accent="rose"
          hint={`Average sale ${money(t?.avg_sale)}, ${t?.items_sold ?? 0} items`} />
      </div>

      <div className="mt-6 rounded-xl border border-line bg-surface-raised p-4 shadow-card">
        <h2 className="mb-3 font-medium text-fg">Revenue and profit</h2>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data?.series ?? []} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="fillReportRevenue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--chart-1)" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0.05} />
                </linearGradient>
                <linearGradient id="fillReportProfit" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--chart-2)" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="var(--chart-2)" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="var(--line)" />
              <XAxis dataKey="period" tickLine={false} axisLine={false}
                tick={{ fontSize: 11, fill: "var(--fg-subtle)" }} tickMargin={8}
                tickFormatter={(v: string) => (data?.group === "day" ? v.slice(5) : v)} />
              <YAxis tickLine={false} axisLine={false} width={54} tickMargin={4}
                tick={{ fontSize: 11, fill: "var(--fg-subtle)" }}
                tickFormatter={(v: number) => `$${v}`} />
              <Tooltip
                cursor={{ stroke: "var(--line-strong)", strokeDasharray: "3 3" }}
                content={
                  <ChartTooltipContent config={REPORT_CHART}
                    valueFormatter={(v) => money(v)} />
                }
              />
              <Legend content={<ChartLegendContent config={REPORT_CHART} />} />
              <Area type="monotone" dataKey="revenue" stroke="var(--chart-1)" strokeWidth={2}
                fill="url(#fillReportRevenue)" dot={false}
                activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--surface-raised)" }} />
              <Area type="monotone" dataKey="profit" stroke="var(--chart-2)" strokeWidth={2}
                fill="url(#fillReportProfit)" dot={false}
                activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--surface-raised)" }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="rounded-xl border border-line bg-surface-raised p-4 shadow-card">
          <h2 className="mb-3 font-medium text-fg">Payment methods</h2>
          {data?.payment_methods.length === 0 && <p className="py-6 text-center text-sm text-fg-muted">No data in this range.</p>}
          <ul className="space-y-2.5">
            {data?.payment_methods.map((m) => {
              const pct = t && Number(t.revenue) > 0 ? (Number(m.revenue) / Number(t.revenue)) * 100 : 0;
              return (
                <li key={m.payment_method}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <StatusBadge status={m.payment_method} />
                    <span className="tabular text-fg">{money(m.revenue)} <span className="text-fg-subtle">({pct.toFixed(0)}%)</span></span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-surface-sunken">
                    <div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="rounded-xl border border-line bg-surface-raised p-4 shadow-card">
          <h2 className="mb-3 font-medium text-fg">Top products</h2>
          {data?.top_products.length === 0 && <p className="py-6 text-center text-sm text-fg-muted">No data in this range.</p>}
          <ul className="divide-y divide-line">
            {data?.top_products.map((p, i) => (
              <li key={`${p.name}-${i}`} className="flex items-center justify-between py-2 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="tabular w-5 shrink-0 text-fg-subtle">{i + 1}.</span>
                  <span className="truncate text-fg">{p.name}</span>
                </span>
                <span className="tabular shrink-0 text-fg-muted">{p.quantity} × <span className="font-medium text-fg">{money(p.revenue)}</span></span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-xl border border-line bg-surface-raised p-4 shadow-card">
          <h2 className="mb-3 font-medium text-fg">Top clients</h2>
          {data?.top_clients.length === 0 && <p className="py-6 text-center text-sm text-fg-muted">No client-tagged sales in this range.</p>}
          <ul className="divide-y divide-line">
            {data?.top_clients.map((c, i) => (
              <li key={`${c.name}-${i}`} className="flex items-center justify-between py-2 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="tabular w-5 shrink-0 text-fg-subtle">{i + 1}.</span>
                  <span className="truncate text-fg">{c.name}</span>
                </span>
                <span className="tabular shrink-0 text-fg-muted">{c.invoice_count} inv · <span className="font-medium text-fg">{money(c.revenue)}</span></span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
