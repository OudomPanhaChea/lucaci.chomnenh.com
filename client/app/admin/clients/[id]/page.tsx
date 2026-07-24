"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { DatePicker, Tabs, Tag } from "antd";
import { Button } from "@/components/ui/button";
import dayjs, { Dayjs } from "dayjs";
import {
  ArrowLeft, BookPlus, CircleAlert, HandCoins, IdCard, Mail, MapPin, Pencil, Phone, StickyNote, Wallet,
} from "lucide-react";
import api from "@/services/api";
import { useRealtime } from "@/hooks/useRealtime";
import { useAuth } from "@/hooks/useAuth";
import { SectionHeader } from "@/components/ui/section-header";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty-state";
import { ClientAvatar } from "@/components/clients/client-avatar";
import ClientFormModal from "@/components/clients/client-form-modal";
import DepositModal from "@/components/clients/deposit-modal";
import OwingModal from "@/components/clients/owing-modal";
import PurchaseHistory from "@/components/clients/purchase-history";
import ProductsRank from "@/components/clients/products-rank";
import PaymentsList from "@/components/clients/payments-list";
import BonusesList from "@/components/clients/bonuses-list";
import InvoicePaperModal from "@/components/invoice-template/invoice-paper-modal";
import ReceivePaymentModal from "@/components/receive-payment-modal";
import InvoiceDetailModal from "@/components/invoice-detail-modal";
import BonusPaperModal from "@/components/bonus/bonus-paper-modal";
import { money, num } from "@/lib/format";
import type { Bonus, ClientStatement, Sale } from "@/lib/types";

const { RangePicker } = DatePicker;

// Full account view of one client: contact info, owing/prepaid position,
// period summary, and the purchase/product/payment/bonus tabs (the former
// statement drawer, now a page). Owing invoices can be ticked in the purchase
// tab to print one A4 owing statement paper.
export default function ClientDetailsPage() {
  const params = useParams<{ id: string }>();
  const clientId = Number(params.id);
  const { user } = useAuth();
  const isManager = user?.role === "owner" || user?.role === "admin";

  const [statement, setStatement] = useState<ClientStatement | null>(null);
  const [loading, setLoading] = useState(true);
  const [stmtLoading, setStmtLoading] = useState(true);
  const [range, setRange] = useState<[Dayjs, Dayjs] | null>(null);

  const [editOpen, setEditOpen] = useState(false);
  const [depositOpen, setDepositOpen] = useState(false);
  const [owingMode, setOwingMode] = useState<"add" | "pay" | null>(null);
  const [paySale, setPaySale] = useState<Sale | null>(null);
  const [detailId, setDetailId] = useState<number | null>(null); // invoice modal
  const [paperBonus, setPaperBonus] = useState<Bonus | null>(null);
  // Canvas invoice paper: one or many invoices, or [] = owing-only statement
  // (previous owing rendered on the same canvas as a synthetic invoice).
  const [invoiceIds, setInvoiceIds] = useState<number[] | null>(null);

  const load = useCallback(() => {
    setStmtLoading(true);
    api
      .get(`/clients/${clientId}/statement`, {
        params: {
          from: range?.[0]?.format("YYYY-MM-DD"),
          to: range?.[1]?.format("YYYY-MM-DD"),
        },
      })
      .then(({ data }) => setStatement(data))
      .catch(() => setStatement(null))
      .finally(() => {
        setLoading(false);
        setStmtLoading(false);
      });
  }, [clientId, range]);
  useEffect(load, [load]);
  useRealtime(["client:changed", "sale:created", "sale:updated", "sale:voided", "bonus:changed"], load);

  if (loading) {
    return <div className="flex justify-center py-24"><Spinner /></div>;
  }
  if (!statement) {
    return (
      <EmptyState
        icon={CircleAlert}
        title="Client not found"
        action={<Link href="/admin/clients"><Button>Back to clients</Button></Link>}
      />
    );
  }

  const cl = statement.client;
  const owingAll = Number(statement.overall.outstanding);
  const oldOwing = Number(statement.overall.opening_owing) || 0;
  const prepaid = Number(cl.credit_balance);

  return (
    <div>
      <div className="mb-3">
        <Link
          href="/admin/clients"
          className="inline-flex cursor-pointer items-center gap-1.5 text-sm text-fg-muted transition-colors duration-200 hover:text-fg"
        >
          <ArrowLeft className="h-4 w-4" /> All clients
        </Link>
      </div>

      <SectionHeader
        title={cl.name}
        subtitle={cl.phone || cl.email || `Client #${cl.display_number}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {/* {cl.client_type === "partner" && <Tag color="blue" className="m-0!">Partner</Tag>} */}
            <Button icon={<Pencil className="h-4 w-4" />} onClick={() => setEditOpen(true)}>
              Edit
            </Button>
            {isManager && (
              <Button icon={<BookPlus className="h-4 w-4" />} onClick={() => setOwingMode("add")}>
                Add owing
              </Button>
            )}
            {oldOwing > 0 && (
              <Button icon={<HandCoins className="h-4 w-4" />} onClick={() => setOwingMode("pay")}>
                Receive owing
              </Button>
            )}
            <Button type="primary" icon={<Wallet className="h-4 w-4" />} onClick={() => setDepositOpen(true)}>
              Add deposit
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
        {/* ── Account position + contact (stays in view while scrolling).
            The owing/prepaid cards come first: they are what staff check
            most, and on phones the contact card would push them below
            the fold. ── */}
        <aside className="space-y-4 xl:sticky xl:top-20">
          {/* Account position (all time) */}
          <div className="grid grid-cols-2 gap-3">
            <div className={`rounded-lg border p-3 ${
              owingAll > 0
                ? "border-rose-200 bg-rose-50 dark:border-rose-500/30 dark:bg-rose-500/10"
                : "border-line bg-surface-raised"
            }`}>
              <p className="text-xs text-fg-subtle">Owing (all time)</p>
              <p className={`tabular text-xl font-semibold ${
                owingAll > 0 ? "text-rose-600 dark:text-rose-400" : "text-fg"
              }`}>
                {money(owingAll)}
              </p>
              {owingAll === 0 && (
                <p className="text-xs text-emerald-600 dark:text-emerald-400">Fully paid</p>
              )}
              {oldOwing > 0 && (
                <>
                  <p className="tabular mt-0.5 text-xs text-fg-muted">
                    incl. {money(oldOwing)} prev. owing
                  </p>
                  {/* <Button
                    block
                    size="small"
                    className="mt-2"
                    icon={<HandCoins className="h-3.5 w-3.5" />}
                    onClick={() => setOwingMode("pay")}
                  >
                    Receive
                  </Button> */}
                </>
              )}
            </div>
            <div className={`rounded-lg border p-3 ${
              prepaid > 0
                ? "border-emerald-200 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/10"
                : "border-line bg-surface-raised"
            }`}>
              <p className="text-xs text-fg-subtle">Prepaid balance</p>
              <p className={`tabular text-xl font-semibold ${
                prepaid > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-fg"
              }`}>
                {money(prepaid)}
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-line bg-surface-raised p-4 shadow-card">
            <div className="mb-3 flex items-center gap-3">
              <ClientAvatar client={cl} size="lg" />
              <div className="min-w-0">
                <p className="truncate font-semibold text-fg">{cl.name}</p>
                <p className="text-xs text-fg-subtle">Client #{cl.display_number}</p>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 rounded-xl bg-surface-sunken/50 p-3.5 text-sm sm:grid-cols-2 xl:grid-cols-1">
              <ContactItem icon={<Phone className="h-4 w-4" />} label="Phone" value={cl.phone} />
              <ContactItem icon={<Mail className="h-4 w-4" />} label="Email" value={cl.email} />
              <ContactItem icon={<IdCard className="h-4 w-4" />} label="ID card" value={cl.id_card} />
              <ContactItem icon={<MapPin className="h-4 w-4" />} label="Address" value={cl.address} />
              {cl.note && (
                <div className="sm:col-span-2 xl:col-span-1">
                  <ContactItem icon={<StickyNote className="h-4 w-4" />} label="Note" value={cl.note} />
                </div>
              )}
            </div>
          </div>
        </aside>

        {/* ── Period filter + summary + tabs ── */}
        <div className="rounded-xl border border-line bg-surface-raised p-4 shadow-card">
          <div className="flex flex-wrap items-center gap-2">
            <RangePicker
              value={range}
              onChange={(v) => setRange(v as [Dayjs, Dayjs] | null)}
              presets={[
                { label: "Today", value: [dayjs(), dayjs()] },
                { label: "This week", value: [dayjs().startOf("week"), dayjs()] },
                { label: "This month", value: [dayjs().startOf("month"), dayjs()] },
                { label: "This year", value: [dayjs().startOf("year"), dayjs()] },
              ]}
            />
            <span className="text-xs text-fg-subtle">{range ? "Selected period" : "All time"}</span>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-3 rounded-lg bg-surface-sunken/50 p-3 text-center text-sm sm:grid-cols-5">
            <div>
              <p className="text-xs text-fg-subtle">Invoices</p>
              <p className="tabular font-semibold text-fg">{num(statement.period.invoice_count)}</p>
            </div>
            <div>
              <p className="text-xs text-fg-subtle">Total Items</p>
              <p className="tabular font-semibold text-fg">{num(statement.period.total_items)}</p>
            </div>
            <div>
              <p className="text-xs text-fg-subtle">Purchased</p>
              <p className="tabular font-semibold text-fg">{money(statement.period.purchased)}</p>
            </div>
            <div>
              <p className="text-xs text-fg-subtle">Paid</p>
              <p className="tabular font-semibold text-emerald-600 dark:text-emerald-400">{money(statement.period.paid)}</p>
            </div>
            <div>
              <p className="text-xs text-fg-subtle">Owing</p>
              <p className={`tabular font-semibold ${
                statement.period.outstanding > 0 ? "text-rose-600 dark:text-rose-400" : "text-fg"
              }`}>
                {money(statement.period.outstanding)}
              </p>
            </div>
          </div>

          <Tabs
            defaultActiveKey="purchases"
            className="mt-2"
            items={[
              {
                key: "purchases",
                label: `Purchase history (${num(statement.period.invoice_count)})`,
                children: (
                  <PurchaseHistory
                    sales={statement.sales}
                    loading={stmtLoading}
                    hasRange={!!range}
                    canPaperAlone={oldOwing > 0}
                    onOpenInvoice={setDetailId}
                    onPay={(s) => setPaySale({ ...s, client_id: clientId } as Sale)}
                    onCreatePaper={setInvoiceIds}
                  />
                ),
              },
              {
                key: "products",
                label: `Products (${num(statement.products.length)})`,
                children: (
                  <ProductsRank products={statement.products} loading={stmtLoading} hasRange={!!range} />
                ),
              },
              {
                key: "payments",
                label: `Payments and deposits (${num(statement.payments.length)})`,
                children: (
                  <PaymentsList payments={statement.payments} loading={stmtLoading} onOpenInvoice={setDetailId} />
                ),
              },
              // Manager-only (the server omits bonuses for cashiers); shown
              // for partners, or any client that already has past awards.
              ...(isManager && (cl.client_type === "partner" || (statement.bonuses?.length ?? 0) > 0)
                ? [{
                    key: "bonuses",
                    label: `Bonuses (${num(statement.bonuses?.length ?? 0)})`,
                    children: (
                      <BonusesList
                        bonuses={statement.bonuses ?? []}
                        loading={stmtLoading}
                        hasRange={!!range}
                        onPaper={setPaperBonus}
                      />
                    ),
                  }]
                : []),
            ]}
          />
        </div>
      </div>

      <ClientFormModal
        open={editOpen}
        client={cl}
        onClose={() => setEditOpen(false)}
        onSaved={load}
      />

      <DepositModal
        client={depositOpen ? cl : null}
        onClose={() => setDepositOpen(false)}
        onDone={load}
      />

      <OwingModal
        client={owingMode ? cl : null}
        mode={owingMode ?? "add"}
        onClose={() => setOwingMode(null)}
        onDone={load}
      />

      <ReceivePaymentModal sale={paySale} onClose={() => setPaySale(null)} onDone={load} />

      {/* Close the invoice modal before opening the paper, or it stays
          stacked on top of the invoice preview. A single invoice prints as a
          template invoice (canvas), editable individually. */}
      <InvoiceDetailModal
        saleId={detailId}
        onClose={() => setDetailId(null)}
        onChanged={load}
        onPaper={(id) => {
          setDetailId(null);
          setInvoiceIds([id]);
        }}
      />

      <BonusPaperModal bonus={paperBonus} onClose={() => setPaperBonus(null)} />

      {/* Selected invoices print as template invoices, each editable individually.
          saleIds = [] prints an owing-only statement on the same canvas. */}
      <InvoicePaperModal
        open={!!invoiceIds}
        saleIds={invoiceIds}
        client={cl}
        canEdit={isManager}
        onClose={() => setInvoiceIds(null)}
        onSaved={load}
      />
    </div>
  );
}

function ContactItem({
  icon, label, value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 text-fg-subtle">{icon}</span>
      <div className="min-w-0">
        <p className="text-xs text-fg-subtle">{label}</p>
        <p className={value ? "text-fg" : "text-fg-subtle"}>{value || "Not set"}</p>
      </div>
    </div>
  );
}
