"use client";
import { useCallback, useEffect, useState } from "react";
import { Button, DatePicker, Drawer, Input, Popconfirm, Select, Table } from "antd";
import dayjs, { Dayjs } from "dayjs";
import { toast } from "react-toastify";
import { Printer, Ban, ReceiptText } from "lucide-react";
import api, { apiError } from "@/services/api";
import { useRealtime } from "@/hooks/useRealtime";
import { useAuth } from "@/hooks/useAuth";
import { SectionHeader } from "@/components/ui/section-header";
import { StatusBadge } from "@/components/ui/status-badge";
import Receipt from "@/components/receipt";
import { money, fmtDate } from "@/lib/format";
import type { Sale, Settings } from "@/lib/types";

const { RangePicker } = DatePicker;

export default function InvoicesPage() {
  const { user } = useAuth();
  const canVoid = user?.role === "owner" || user?.role === "admin";
  const [rows, setRows] = useState<Sale[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string | undefined>();
  const [method, setMethod] = useState<string | undefined>();
  const [range, setRange] = useState<[Dayjs, Dayjs] | null>(null);
  const [detail, setDetail] = useState<Sale | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    api
      .get("/sales", {
        params: {
          page, page_size: 15,
          search: search || undefined,
          status, payment_method: method,
          from: range?.[0]?.format("YYYY-MM-DD"),
          to: range?.[1]?.format("YYYY-MM-DD"),
        },
      })
      .then(({ data }) => {
        setRows(data.rows);
        setTotal(data.total);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [page, search, status, method, range]);

  useEffect(load, [load]);
  useEffect(() => {
    api.get("/settings").then(({ data }) => setSettings(data)).catch(() => {});
  }, []);
  useRealtime(["sale:created", "sale:voided"], load);

  const openDetail = async (sale: Sale) => {
    try {
      const { data } = await api.get(`/sales/${sale.id}`);
      setDetail(data);
    } catch (err) {
      toast.error(apiError(err));
    }
  };

  const voidSale = async (sale: Sale) => {
    try {
      const { data } = await api.post(`/sales/${sale.id}/void`);
      toast.success(`${sale.invoice_number} voided, stock restored`);
      setDetail((d) => (d?.id === sale.id ? data : d));
      load();
    } catch (err) {
      toast.error(apiError(err));
    }
  };

  return (
    <div>
      <SectionHeader title="Invoices" subtitle={`${total} invoices`} />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input allowClear className="!w-64" placeholder="Search invoice number or client"
          value={search} onChange={(e) => { setPage(1); setSearch(e.target.value); }} />
        <RangePicker value={range} onChange={(v) => { setPage(1); setRange(v as [Dayjs, Dayjs] | null); }}
          presets={[
            { label: "Today", value: [dayjs(), dayjs()] },
            { label: "This week", value: [dayjs().startOf("week"), dayjs()] },
            { label: "This month", value: [dayjs().startOf("month"), dayjs()] },
          ]} />
        <Select allowClear placeholder="Status" className="!w-32" value={status}
          onChange={(v) => { setPage(1); setStatus(v); }}
          options={[{ value: "paid", label: "Paid" }, { value: "voided", label: "Voided" }]} />
        <Select allowClear placeholder="Payment" className="!w-32" value={method}
          onChange={(v) => { setPage(1); setMethod(v); }}
          options={["cash", "khqr", "card", "bank"].map((m) => ({ value: m, label: m.toUpperCase() }))} />
      </div>

      <div className="rounded-xl border border-line bg-surface-raised shadow-card">
        <Table<Sale>
          rowKey="id"
          loading={loading}
          dataSource={rows}
          scroll={{ x: 860 }}
          pagination={{
            current: page, total, pageSize: 15, showSizeChanger: false,
            onChange: setPage,
          }}
          onRow={(s) => ({ onClick: () => openDetail(s), className: "cursor-pointer" })}
          columns={[
            { title: "Invoice", dataIndex: "invoice_number", width: 170,
              render: (v) => <span className="font-mono text-xs text-fg">{v}</span> },
            { title: "Date", dataIndex: "created_at", width: 150,
              render: (v) => <span className="text-fg-muted">{fmtDate(v)}</span> },
            { title: "Client", dataIndex: "client_name", render: (v) => v || <span className="text-fg-subtle">Walk-in</span> },
            { title: "Cashier", dataIndex: "cashier_name", width: 120, render: (v) => <span className="text-fg-muted">{v}</span> },
            { title: "Items", dataIndex: "item_count", width: 80, align: "center",
              render: (v) => <span className="tabular">{v}</span> },
            { title: "Payment", dataIndex: "payment_method", width: 100,
              render: (v) => <StatusBadge status={v} /> },
            { title: "Status", dataIndex: "status", width: 100, render: (v) => <StatusBadge status={v} /> },
            { title: "Total", dataIndex: "total", width: 110, align: "right",
              render: (v) => <span className="tabular font-medium">{money(v)}</span> },
          ]}
        />
      </div>

      <Drawer open={!!detail} onClose={() => setDetail(null)} size={480}
        title={
          detail && (
            <div className="flex items-center gap-2">
              <ReceiptText className="h-4.5 w-4.5" />
              <span className="font-mono text-sm">{detail.invoice_number}</span>
              <StatusBadge status={detail.status} />
            </div>
          )
        }
        extra={
          detail && (
            <div className="flex gap-2">
              <Button size="small" icon={<Printer className="h-4 w-4" />} onClick={() => window.print()}>
                Print
              </Button>
              {canVoid && detail.status === "paid" && (
                <Popconfirm title="Void this invoice?" description="Stock will be restored. This cannot be undone."
                  onConfirm={() => voidSale(detail)}>
                  <Button size="small" danger icon={<Ban className="h-4 w-4" />}>Void</Button>
                </Popconfirm>
              )}
            </div>
          )
        }>
        {detail && (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-3 rounded-lg bg-surface-sunken p-3">
              <div><p className="text-fg-subtle">Date</p><p className="text-fg">{fmtDate(detail.created_at)}</p></div>
              <div><p className="text-fg-subtle">Cashier</p><p className="text-fg">{detail.cashier_name}</p></div>
              <div><p className="text-fg-subtle">Client</p><p className="text-fg">{detail.client_name || "Walk-in"}</p></div>
              <div><p className="text-fg-subtle">Payment</p><p className="uppercase text-fg">{detail.payment_method}</p></div>
              {detail.status === "voided" && (
                <div className="col-span-2">
                  <p className="text-fg-subtle">Voided</p>
                  <p className="text-fg">{fmtDate(detail.voided_at ?? "")} by {detail.voided_by}</p>
                </div>
              )}
            </div>

            <table className="w-full">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase text-fg-subtle">
                  <th className="pb-2 font-medium">Item</th>
                  <th className="pb-2 text-center font-medium">Qty</th>
                  <th className="pb-2 text-right font-medium">Price</th>
                  <th className="pb-2 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {detail.items?.map((it) => (
                  <tr key={it.id}>
                    <td className="py-2 text-fg">{it.name_snapshot}
                      {it.discount_pct > 0 && <span className="ml-1 text-xs text-rose-500">-{it.discount_pct}%</span>}
                    </td>
                    <td className="tabular py-2 text-center text-fg-muted">{it.quantity}</td>
                    <td className="tabular py-2 text-right text-fg-muted">{money(it.price)}</td>
                    <td className="tabular py-2 text-right font-medium text-fg">{money(it.line_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="space-y-1 border-t border-line pt-3">
              <div className="flex justify-between text-fg-muted"><span>Subtotal</span><span className="tabular">{money(detail.subtotal)}</span></div>
              {Number(detail.discount_amount) > 0 && (
                <div className="flex justify-between text-fg-muted">
                  <span>Discount ({detail.discount_pct}%)</span><span className="tabular">-{money(detail.discount_amount)}</span>
                </div>
              )}
              {Number(detail.tax_amount) > 0 && (
                <div className="flex justify-between text-fg-muted">
                  <span>Tax ({detail.tax_rate}%)</span><span className="tabular">{money(detail.tax_amount)}</span>
                </div>
              )}
              <div className="flex justify-between text-base font-semibold text-fg">
                <span>Total</span><span className="tabular">{money(detail.total)}</span>
              </div>
              {detail.amount_received !== null && (
                <>
                  <div className="flex justify-between text-fg-muted"><span>Received</span><span className="tabular">{money(detail.amount_received)}</span></div>
                  <div className="flex justify-between text-fg-muted"><span>Change</span><span className="tabular">{money(detail.change_due)}</span></div>
                </>
              )}
            </div>
            {detail.note && <p className="rounded-lg bg-surface-sunken p-3 text-fg-muted">{detail.note}</p>}
          </div>
        )}
      </Drawer>

      <div className="hidden print:block">
        {detail && <Receipt sale={detail} settings={settings} />}
      </div>
    </div>
  );
}
