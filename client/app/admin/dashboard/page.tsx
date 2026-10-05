"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Segmented } from "antd";
import {
  DollarSign, ReceiptText, Package, TrendingUp, ArrowRight, HandCoins,
} from "lucide-react";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";
import api from "@/services/api";
import { useRealtime } from "@/hooks/useRealtime";
import { StatCard } from "@/components/ui/stat-card";
import { ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { StatusBadge, useStatusLabel } from "@/components/ui/status-badge";
import { SectionHeader } from "@/components/ui/section-header";
import { EmptyState } from "@/components/ui/empty-state";
import { money, num, fmtDate } from "@/lib/format";
import type { Sale } from "@/lib/types";
import { useT } from "@/lib/i18n";


interface DashboardData {
  today: { invoice_count: number; revenue: number; avg_sale: number; profit: number; items_sold: number };
  yesterday_revenue: number;
  receivables: { total: number; invoices: number };
  week_series: { period: string; revenue: number; invoice_count: number }[];
  recent_sales: Sale[];
  low_stock: { id: number; name: string; stock_qty: number; low_stock_alert: number }[];
  counts: { products: number; clients: number };
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [chartDays, setChartDays] = useState<7 | 14 | 30>(14);
  const { t: tr } = useT();
  const statusLabel = useStatusLabel();
  const revenueChart: ChartConfig = { revenue: { label: tr("Sales"), color: "var(--chart-1)" } };

  const load = useCallback(() => {
    api.get("/reports/dashboard", { params: { days: chartDays } })
      .then(({ data }) => setData(data)).catch(() => {});
  }, [chartDays]);

  useEffect(load, [load]);
  useRealtime(["sale:created", "sale:updated", "sale:voided", "product:changed"], load);

  const t = data?.today;
  const diff =
    data && Number(data.yesterday_revenue) > 0
      ? ((Number(t?.revenue) - Number(data.yesterday_revenue)) / Number(data.yesterday_revenue)) * 100
      : null;
  return (
    <div>
      <SectionHeader title={tr("Dashboard")} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard
          title={tr("Sales today")}
          value={money(t?.revenue)}
          icon={DollarSign}
          hint={diff === null ? null : tr("{pct} vs yesterday", { pct: `${diff >= 0 ? "+" : ""}${diff.toFixed(1)}%` })}
        />
        <StatCard title={tr("Invoices today")} value={num(t?.invoice_count)} icon={ReceiptText} />
        <StatCard title={tr("Items sold today")} value={num(t?.items_sold)} icon={Package} />
        <StatCard title={tr("Profit today")} value={money(t?.profit)} icon={TrendingUp} />
        <StatCard title={tr("Owing")} value={money(data?.receivables.total)} icon={HandCoins}
          hint={
            Number(data?.receivables.invoices) > 0
              ? tr("{n} invoices", { n: num(data?.receivables.invoices) })
              : null
          } />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="rounded-xl border border-line bg-surface-raised p-4 shadow-card xl:col-span-2">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="font-medium text-fg">{tr("Sales")}</h2>
            <Segmented
              size="small"
              value={chartDays}
              onChange={(v) => setChartDays(v as typeof chartDays)}
              options={[
                { label: tr("{n} days", { n: 7 }), value: 7 },
                { label: tr("{n} days", { n: 14 }), value: 14 },
                { label: tr("{n} days", { n: 30 }), value: 30 },
              ]}
            />
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data?.week_series ?? []} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="fillRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--chart-1)" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="var(--line)" />
                <XAxis dataKey="period" tickLine={false} axisLine={false}
                  tick={{ fontSize: 11, fill: "var(--fg-subtle)" }} tickMargin={8}
                  tickFormatter={(v: string) => v.slice(5)} />
                <YAxis tickLine={false} axisLine={false} width={48} tickMargin={4}
                  tick={{ fontSize: 11, fill: "var(--fg-subtle)" }}
                  tickFormatter={(v: number) => `$${num(v)}`} />
                <Tooltip
                  cursor={{ stroke: "var(--line-strong)", strokeDasharray: "3 3" }}
                  content={
                    <ChartTooltipContent config={revenueChart}
                      valueFormatter={(v) => money(v)} />
                  }
                />
                <Area type="monotone" dataKey="revenue" stroke="var(--chart-1)" strokeWidth={2}
                  fill="url(#fillRevenue)" dot={false}
                  activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--surface-raised)" }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl border border-line bg-surface-raised p-4 shadow-card">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-medium text-fg">{tr("Low stock")}</h2>
            <Link href="/admin/inventory?low_stock=1"
              className="flex items-center gap-1 text-sm text-brand transition-colors duration-200 hover:text-brand-hover dark:text-brand-soft-foreground">
              {tr("View all")} <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          {data && data.low_stock.length === 0 ? (
            <p className="py-8 text-center text-sm text-fg-muted">{tr("No low stock")}</p>
          ) : (
            <ul className="divide-y divide-line">
              {data?.low_stock.map((p) => (
                <li key={p.id} className="flex items-center justify-between py-2.5">
                  <span className="truncate pr-2 text-sm text-fg">{p.name}</span>
                  <StatusBadge status={p.stock_qty === 0 ? "out" : "low"}
                    label={p.stock_qty === 0 ? tr("Out") : tr("{n} left", { n: num(p.stock_qty) })} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-line bg-surface-raised shadow-card">
        <div className="flex items-center justify-between border-b border-line p-4">
          <h2 className="font-medium text-fg">{tr("Recent sales")}</h2>
          <Link href="/admin/invoices"
            className="flex items-center gap-1 text-sm text-brand transition-colors duration-200 hover:text-brand-hover dark:text-brand-soft-foreground">
            {tr("View all")} <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        {data && data.recent_sales.length === 0 ? (
          <div className="p-4">
            <EmptyState title={tr("No sales yet")} />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-260 w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-fg-subtle">
                  <th className="px-4 py-2.5 font-medium">{tr("Invoice")}</th>
                  <th className="px-4 py-2.5 font-medium">{tr("Client")}</th>
                  <th className="px-4 py-2.5 font-medium">{tr("Cashier")}</th>
                  <th className="px-4 py-2.5 font-medium">{tr("Method")}</th>
                  <th className="px-4 py-2.5 font-medium">{tr("Status")}</th>
                  <th className="px-4 py-2.5 text-right font-medium">{tr("Total")}</th>
                  <th className="px-4 py-2.5 text-right font-medium">{tr("Time")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data?.recent_sales.map((s) => (
                  <tr key={s.id} className="transition-colors duration-150 hover:bg-surface-sunken">
                    <td className="px-4 py-2.5 font-mono text-xs text-fg">{s.invoice_number}</td>
                    <td className="px-4 py-2.5 text-fg-muted">{s.client_name || "—"}</td>
                    <td className="px-4 py-2.5 text-fg-muted">{s.cashier_name}</td>
                    <td className="px-4 py-2.5 text-fg-muted">{statusLabel(s.payment_method)}</td>
                    <td className="px-4 py-2.5"><StatusBadge status={s.status} /></td>
                    <td className="tabular px-4 py-2.5 text-right font-medium text-fg">{money(s.total)}</td>
                    <td className="px-4 py-2.5 text-right text-fg-subtle">{fmtDate(s.created_at, "HH:mm, dd MMM")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
