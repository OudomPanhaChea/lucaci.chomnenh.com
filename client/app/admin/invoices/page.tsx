"use client";
import { useCallback, useEffect, useState } from "react";
import { DatePicker, Input, Select, Table } from "antd";
import { Dayjs } from "dayjs";
import api from "@/services/api";
import { useRealtime } from "@/hooks/useRealtime";
import { SectionHeader } from "@/components/ui/section-header";
import { StatusBadge, useStatusLabel, useMethodOptions } from "@/components/ui/status-badge";
import InvoiceDetailModal from "@/components/invoice-detail-modal";
import { money, fmtDate, num } from "@/lib/format";
import type { Sale } from "@/lib/types";
import { useT } from "@/lib/i18n";
import { rangePresets } from "@/lib/range-presets";

const { RangePicker } = DatePicker;

export default function InvoicesPage() {
  const { t } = useT();
  const statusLabel = useStatusLabel();
  const methodOptions = useMethodOptions();
  const [rows, setRows] = useState<Sale[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string | undefined>();
  const [method, setMethod] = useState<string | undefined>();
  const [range, setRange] = useState<[Dayjs, Dayjs] | null>(null);
  const [detailId, setDetailId] = useState<number | null>(null);

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
      <SectionHeader title={t("Invoices")} />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input allowClear className="!w-64" placeholder={t("Search")}
          value={search} onChange={(e) => { setPage(1); setSearch(e.target.value); }} />
        <RangePicker value={range} onChange={(v) => { setPage(1); setRange(v as [Dayjs, Dayjs] | null); }}
          presets={rangePresets(t)} />
        <Select allowClear placeholder={t("Status")} className="!w-32" value={status}
          onChange={(v) => { setPage(1); setStatus(v); }}
          options={["paid", "partial", "unpaid", "voided"].map((s) => ({ value: s, label: statusLabel(s) }))} />
        <Select allowClear placeholder={t("Method")} className="!w-32" value={method}
          onChange={(v) => { setPage(1); setMethod(v); }}
          options={methodOptions} />
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
            { title: t("Invoice"), dataIndex: "invoice_number", width: 180,
              render: (v) => <span className="font-mono text-xs text-fg">{v}</span> },
            { title: t("Date"), dataIndex: "created_at", width: 150,
              render: (v) => <span className="text-fg-muted">{fmtDate(v)}</span> },
            { title: t("Client"), dataIndex: "client_name", render: (v) => v || <span className="text-fg-subtle">{t("Walk-in")}</span> },
            { title: t("Cashier"), dataIndex: "cashier_name", width: 120, render: (v) => <span className="text-fg-muted">{v}</span> },
            // Different products on the invoice (a, b and c = 3), not summed qty
            { title: t("Items"), dataIndex: "item_count", width: 120, align: "center",
              render: (v) => <span className="tabular">{num(v)}</span> },
            { title: t("Method"), dataIndex: "payment_method", width: 100,
              render: (v) => <span className="text-fg-muted">{statusLabel(v)}</span> },
            { title: t("Status"), dataIndex: "status", width: 110, render: (v) => <StatusBadge status={v} /> },
            { title: t("Total"), dataIndex: "total", width: 160, align: "right",
              render: (v) => <span className="tabular font-medium">{money(v)}</span> },
            { title: t("Owing"), key: "balance", width: 110, align: "right",
              render: (_, s) => {
                const bal = Number(s.total) - Number(s.amount_paid);
                return s.status !== "voided" && bal > 0
                  ? <span className="tabular font-medium text-rose-600 dark:text-rose-400">{money(bal)}</span>
                  : <span className="text-fg-subtle">—</span>;
              } },
          ]}
        />
      </div>

      {/* Owns the A4 invoice paper, editing and bonus marking itself */}
      <InvoiceDetailModal
        saleId={detailId}
        onClose={() => setDetailId(null)}
        onChanged={load}
      />
    </div>
  );
}
