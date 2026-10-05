"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { DatePicker, Tabs } from "antd";
import { Button } from "@/components/ui/button";
import { Dayjs } from "dayjs";
import {
  ArrowLeft,
  BookPlus,
  CircleAlert,
  HandCoins,
  IdCard,
  Mail,
  MapPin,
  Pencil,
  Phone,
  StickyNote,
  Wallet,
} from "lucide-react";
import api from "@/services/api";
import { useRealtime } from "@/hooks/useRealtime";
import { useAuth } from "@/hooks/useAuth";
import { SectionHeader } from "@/components/ui/section-header";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty-state";
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
import { useT } from "@/lib/i18n";
import { rangePresets } from "@/lib/range-presets";

const { RangePicker } = DatePicker;

// Full account view of one client: contact info, owing/prepaid position,
// period summary, and the purchase/product/payment/bonus tabs (the former
// statement drawer, now a page). Owing invoices can be ticked in the purchase
// tab to print one A4 owing statement paper.
export default function ClientDetailsPage() {
  const params = useParams<{ id: string }>();
  const clientId = Number(params.id);
  const { user } = useAuth();
  const { t } = useT();
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
  // Subset of invoiceIds shown as a "previously billed" balance line only.
  const [owingOnlyIds, setOwingOnlyIds] = useState<number[]>([]);

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
  useRealtime(
    [
      "client:changed",
      "sale:created",
      "sale:updated",
      "sale:voided",
      "bonus:changed",
    ],
    load,
  );

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Spinner />
      </div>
    );
  }
  if (!statement) {
    return (
      <EmptyState
        icon={CircleAlert}
        title={t("Client not found")}
        action={
          <Link href="/admin/clients">
            <Button>{t("Back")}</Button>
          </Link>
        }
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
          <ArrowLeft className="h-4 w-4" /> {t("Clients")}
        </Link>
      </div>

      <SectionHeader
        title={cl.name}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {/* {cl.client_type === "partner" && <Tag color="blue" className="m-0!">Partner</Tag>} */}
            <Button
              icon={<Pencil className="h-4 w-4" />}
              onClick={() => setEditOpen(true)}
            >
              {t("Edit")}
            </Button>
            {/* {isManager && ( */}
            <Button
              icon={<BookPlus className="h-4 w-4" />}
              onClick={() => setOwingMode("add")}
            >
              {t("Add owing")}
            </Button>
            {/* )} */}
            {oldOwing > 0 && (
              <Button
                icon={<HandCoins className="h-4 w-4" />}
                onClick={() => setOwingMode("pay")}
              >
                {t("Receive owing")}
              </Button>
            )}
            <Button
              type="primary"
              icon={<Wallet className="h-4 w-4" />}
              onClick={() => setDepositOpen(true)}
            >
              {t("Add prepaid")}
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
            <div className="rounded-lg border border-line bg-surface-raised p-3">
              <p className="text-xs text-fg-subtle">{t("Owing")}</p>
              <p
                className={`tabular text-xl font-semibold ${
                  owingAll > 0 ? "text-rose-600 dark:text-rose-400" : "text-fg"
                }`}
              >
                {money(owingAll)}
              </p>
              {oldOwing > 0 && (
                <>
                  <p className="tabular mt-0.5 text-xs text-fg-muted">
                    {t("Incl. {amount} previous", { amount: money(oldOwing) })}
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
            <div className="rounded-lg border border-line bg-surface-raised p-3">
              <p className="text-xs text-fg-subtle">{t("Prepaid")}</p>
              <p className="tabular text-xl font-semibold text-fg">
                {money(prepaid)}
              </p>
            </div>
          </div>

          {(cl.phone || cl.email || cl.id_card || cl.address || cl.note) && (
          <div className="rounded-xl border border-line bg-surface-raised p-4 shadow-card">
            <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2 xl:grid-cols-1">
              <ContactItem
                icon={<Phone className="h-4 w-4" />}
                label={t("Phone")}
                value={cl.phone}
              />
              <ContactItem
                icon={<Mail className="h-4 w-4" />}
                label={t("Email")}
                value={cl.email}
              />
              <ContactItem
                icon={<IdCard className="h-4 w-4" />}
                label={t("ID card")}
                value={cl.id_card}
              />
              <ContactItem
                icon={<MapPin className="h-4 w-4" />}
                label={t("Address")}
                value={cl.address}
              />
              {cl.note && (
                <div className="sm:col-span-2 xl:col-span-1">
                  <ContactItem
                    icon={<StickyNote className="h-4 w-4" />}
                    label={t("Note")}
                    value={cl.note}
                  />
                </div>
              )}
            </div>
          </div>
          )}
        </aside>

        {/* ── Period filter + summary + tabs ── */}
        <div className="rounded-xl border border-line bg-surface-raised p-4 shadow-card">
          <div className="flex flex-wrap items-center gap-2">
            <RangePicker
              value={range}
              onChange={(v) => setRange(v as [Dayjs, Dayjs] | null)}
              presets={rangePresets(t)}
              placeholder={[t("All time"), t("All time")]}
            />
          </div>

          <div className="mt-4 grid grid-cols-3 gap-3 rounded-lg bg-surface-sunken/50 p-3 text-center text-sm sm:grid-cols-5">
            <div>
              <p className="text-xs text-fg-subtle">{t("Invoices")}</p>
              <p className="tabular font-semibold text-fg">
                {num(statement.period.invoice_count)}
              </p>
            </div>
            <div>
              <p className="text-xs text-fg-subtle">{t("Items")}</p>
              <p className="tabular font-semibold text-fg">
                {num(statement.period.total_items)}
              </p>
            </div>
            <div>
              <p className="text-xs text-fg-subtle">{t("Bought")}</p>
              <p className="tabular font-semibold text-fg">
                {money(statement.period.purchased)}
              </p>
            </div>
            <div>
              <p className="text-xs text-fg-subtle">{t("Paid")}</p>
              <p className="tabular font-semibold text-fg">
                {money(statement.period.paid)}
              </p>
            </div>
            <div>
              <p className="text-xs text-fg-subtle">{t("Owing")}</p>
              <p
                className={`tabular font-semibold ${
                  statement.period.outstanding > 0
                    ? "text-rose-600 dark:text-rose-400"
                    : "text-fg"
                }`}
              >
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
                label: `${t("Invoices")} (${num(statement.period.invoice_count)})`,
                children: (
                  <PurchaseHistory
                    sales={statement.sales}
                    loading={stmtLoading}
                    hasRange={!!range}
                    canPaperAlone={oldOwing > 0}
                    onOpenInvoice={setDetailId}
                    onPay={(s) =>
                      setPaySale({ ...s, client_id: clientId } as Sale)
                    }
                    onCreatePaper={(ids, owingOnly) => {
                      setOwingOnlyIds(owingOnly ?? []);
                      setInvoiceIds(ids);
                    }}
                  />
                ),
              },
              {
                key: "products",
                label: `${t("Products")} (${num(statement.products.length)})`,
                children: (
                  <ProductsRank
                    products={statement.products}
                    loading={stmtLoading}
                    hasRange={!!range}
                  />
                ),
              },
              {
                key: "payments",
                label: `${t("Payments")} (${num(statement.payments.length)})`,
                children: (
                  <PaymentsList
                    payments={statement.payments}
                    loading={stmtLoading}
                    clientId={clientId}
                    canManage={isManager}
                    onOpenInvoice={setDetailId}
                    onChanged={load}
                  />
                ),
              },
              // Manager-only (the server omits bonuses for cashiers); shown
              // for partners, or any client that already has past awards.
              ...(isManager &&
              (cl.client_type === "partner" ||
                (statement.bonuses?.length ?? 0) > 0)
                ? [
                    {
                      key: "bonuses",
                      label: `${t("Bonus")} (${num(statement.bonuses?.length ?? 0)})`,
                      children: (
                        <BonusesList
                          bonuses={statement.bonuses ?? []}
                          loading={stmtLoading}
                          hasRange={!!range}
                          onPaper={setPaperBonus}
                        />
                      ),
                    },
                  ]
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

      <ReceivePaymentModal
        sale={paySale}
        onClose={() => setPaySale(null)}
        onDone={load}
      />

      {/* Owns the single-invoice A4 paper (it closes itself first so the
          paper never stacks under it), editing and bonus marking. */}
      <InvoiceDetailModal
        saleId={detailId}
        onClose={() => setDetailId(null)}
        onChanged={load}
      />

      <BonusPaperModal bonus={paperBonus} client={cl} onClose={() => setPaperBonus(null)} />

      {/* Selected invoices print as template invoices, each editable individually.
          saleIds = [] prints an owing-only statement on the same canvas. */}
      <InvoicePaperModal
        open={!!invoiceIds}
        saleIds={invoiceIds}
        owingOnlyIds={owingOnlyIds}
        client={cl}
        canEdit={isManager}
        onClose={() => setInvoiceIds(null)}
        onSaved={load}
      />
    </div>
  );
}

function ContactItem({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | null | undefined;
}) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 text-fg-subtle">{icon}</span>
      <div className="min-w-0">
        <p className="text-xs text-fg-subtle">{label}</p>
        <p className="break-words text-fg">{value}</p>
      </div>
    </div>
  );
}
