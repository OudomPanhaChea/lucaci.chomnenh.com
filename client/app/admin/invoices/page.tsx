"use client";
import { useCallback, useEffect, useState } from "react";
import { DatePicker, Input, Select, Table } from "antd";
import dayjs, { Dayjs } from "dayjs";
import api from "@/services/api";
import { useRealtime } from "@/hooks/useRealtime";
import { useAuth } from "@/hooks/useAuth";
import { SectionHeader } from "@/components/ui/section-header";
import { StatusBadge } from "@/components/ui/status-badge";
import InvoiceDetailModal from "@/components/invoice-detail-modal";
import InvoicePaperModal from "@/components/invoice-template/invoice-paper-modal";
import { money, fmtDate, num } from "@/lib/format";
import type { Sale } from "@/lib/types";

const { RangePicker } = DatePicker;

export default function InvoicesPage() {
  const { user } = useAuth();
  const isManager = user?.role === "owner" || user?.role === "admin";
  const [rows, setRows] = useState<Sale[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string | undefined>();
  const [method, setMethod] = useState<string | undefined>();
  const [range, setRange] = useState<[Dayjs, Dayjs] | null>(null);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [invoiceIds, setInvoiceIds] = useState<number[] | null>(null); // canvas invoice paper

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
  useRealtime(["sale:created", "sale:updated", "sale:voided"], load);

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
          options={[
            { value: "paid", label: "Paid" },
            { value: "partial", label: "Partial" },
            { value: "unpaid", label: "Unpaid" },
            { value: "voided", label: "Voided" },
          ]} />
        <Select allowClear placeholder="Payment" className="!w-32" value={method}
          onChange={(v) => { setPage(1); setMethod(v); }}
          options={["cash", "khqr", "card", "bank"].map((m) => ({ value: m, label: m.toUpperCase() }))} />
      </div>

      <div className="rounded-xl border border-line bg-surface-raised shadow-card">
        <Table<Sale>
          rowKey="id"
          loading={loading}
          dataSource={rows}
          scroll={{ x: 1200 }}
          pagination={{
            current: page, total, pageSize: 15, showSizeChanger: false,
            onChange: setPage,
          }}
          onRow={(s) => ({ onClick: () => setDetailId(s.id), className: "cursor-pointer" })}
          columns={[
            { title: "Invoice", dataIndex: "invoice_number", width: 180,
              render: (v) => <span className="font-mono text-xs text-fg">{v}</span> },
            { title: "Date", dataIndex: "created_at", width: 150,
              render: (v) => <span className="text-fg-muted">{fmtDate(v)}</span> },
            { title: "Client", dataIndex: "client_name", render: (v) => v || <span className="text-fg-subtle">Walk-in</span> },
            { title: "Cashier", dataIndex: "cashier_name", width: 120, render: (v) => <span className="text-fg-muted">{v}</span> },
            { title: "Items", dataIndex: "item_count", width: 120, align: "center",
              render: (v) => <span className="tabular">{num(v)}</span> },
            { title: "Payment", dataIndex: "payment_method", width: 100,
              render: (v) => <StatusBadge status={v} /> },
            { title: "Status", dataIndex: "status", width: 100, render: (v) => <StatusBadge status={v} /> },
            { title: "Total", dataIndex: "total", width: 160, align: "right",
              render: (v) => <span className="tabular font-medium">{money(v)}</span> },
            { title: "Balance", key: "balance", width: 100, align: "right",
              render: (_, s) => {
                const bal = Number(s.total) - Number(s.amount_paid);
                return s.status !== "voided" && bal > 0
                  ? <span className="tabular font-medium text-rose-600 dark:text-rose-400">{money(bal)}</span>
                  : <span className="text-fg-subtle">—</span>;
              } },
          ]}
        />
      </div>

      {/* Close the detail modal before opening the paper so it doesn't stack
          on top of the invoice preview */}
      <InvoiceDetailModal
        saleId={detailId}
        onClose={() => setDetailId(null)}
        onChanged={load}
        onPaper={(id) => {
          setDetailId(null);
          setInvoiceIds([id]);
        }}
      />

      <InvoicePaperModal
        open={!!invoiceIds}
        saleIds={invoiceIds}
        canEdit={isManager}
        onClose={() => setInvoiceIds(null)}
        onSaved={load}
      />
    </div>
  );
}
