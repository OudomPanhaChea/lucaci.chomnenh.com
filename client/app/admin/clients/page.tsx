"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DatePicker, Drawer, Form, Input, InputNumber, Modal, Popconfirm,
  Segmented, Select, Table, Tabs, Tag,
} from "antd";
import { Button } from "@/components/ui/button";
import dayjs, { Dayjs } from "dayjs";
import { toast } from "react-toastify";
import {
  Plus, Pencil, Trash2, UserRound, Wallet, HandCoins, Handshake,
  ChevronRight, ReceiptText, Phone, Mail, IdCard, MapPin, StickyNote,
} from "lucide-react";
import api, { apiError } from "@/services/api";
import { useRealtime } from "@/hooks/useRealtime";
import { useAuth } from "@/hooks/useAuth";
import { SectionHeader } from "@/components/ui/section-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty-state";
import ReceivePaymentModal from "@/components/receive-payment-modal";
import InvoiceDetailModal from "@/components/invoice-detail-modal";
import { money, fmtDate } from "@/lib/format";
import type { Client, ClientStatement, PaymentMethod, Sale } from "@/lib/types";

const { RangePicker } = DatePicker;

export default function ClientsPage() {
  const { user } = useAuth();
  const canDelete = user?.role === "owner" || user?.role === "admin";
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "normal" | "partner" | "owing">("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  // Statement drawer
  const [viewing, setViewing] = useState<Client | null>(null);
  const [statement, setStatement] = useState<ClientStatement | null>(null);
  const [stmtLoading, setStmtLoading] = useState(false);
  const [stmtRange, setStmtRange] = useState<[Dayjs, Dayjs] | null>(null);
  const [paySale, setPaySale] = useState<Sale | null>(null);
  const [depositOpen, setDepositOpen] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null); // invoice opened from the statement

  const load = useCallback(() => {
    api.get("/clients").then(({ data }) => setClients(data)).catch(() => {}).finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  const loadStatement = useCallback(() => {
    if (!viewing) return;
    setStmtLoading(true);
    api
      .get(`/clients/${viewing.id}/statement`, {
        params: {
          from: stmtRange?.[0]?.format("YYYY-MM-DD"),
          to: stmtRange?.[1]?.format("YYYY-MM-DD"),
        },
      })
      .then(({ data }) => setStatement(data))
      .catch(() => setStatement(null))
      .finally(() => setStmtLoading(false));
  }, [viewing, stmtRange]);
  useEffect(loadStatement, [loadStatement]);

  useRealtime(["client:changed", "sale:created", "sale:updated", "sale:voided"], () => {
    load();
    loadStatement();
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return clients.filter(
      (c) =>
        (typeFilter === "all" ||
          (typeFilter === "owing" ? Number(c.outstanding) > 0 : c.client_type === typeFilter)) &&
        (!q ||
          c.name.toLowerCase().includes(q) || c.phone?.includes(q) ||
          c.email?.toLowerCase().includes(q) || c.id_card?.toLowerCase().includes(q))
    );
  }, [clients, search, typeFilter]);
  const partnerCount = useMemo(
    () => clients.filter((c) => c.client_type === "partner").length,
    [clients]
  );
  const owingCount = useMemo(
    () => clients.filter((c) => Number(c.outstanding) > 0).length,
    [clients]
  );

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ client_type: "normal" });
    setFormOpen(true);
  };
  const openEdit = (c: Client) => {
    setEditing(c);
    form.setFieldsValue({ ...c, sex: c.sex ?? undefined });
    setFormOpen(true);
  };

  const submit = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      if (editing) {
        await api.put(`/clients/${editing.id}`, values);
        toast.success("Client updated");
      } else {
        await api.post("/clients", values);
        toast.success("Client created");
      }
      setFormOpen(false);
      load();
    } catch (err) {
      toast.error(apiError(err));
    } finally {
      setSaving(false);
    }
  };

  const openView = (c: Client) => {
    setStatement(null);
    setStmtRange(null);
    setViewing(c);
  };

  const cl = statement?.client ?? viewing;

  return (
    <div>
      <SectionHeader
        title="Clients"
        subtitle={`${clients.length} saved customers`}
        actions={
          <Button type="primary" icon={<Plus className="h-4 w-4" />} onClick={openCreate}>
            Add client
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input allowClear className="!w-72" placeholder="Search name, phone, email, ID"
          value={search} onChange={(e) => setSearch(e.target.value)} />
        <Segmented
          value={typeFilter}
          onChange={(v) => setTypeFilter(v as typeof typeFilter)}
          options={[
            { label: `All (${clients.length})`, value: "all" },
            { label: `Normal (${clients.length - partnerCount})`, value: "normal" },
            { label: `Partners (${partnerCount})`, value: "partner" },
            { label: `Owing (${owingCount})`, value: "owing" },
          ]}
        />
      </div>

      <div className="rounded-xl border border-line bg-surface-raised shadow-card">
        <Table<Client>
          rowKey="id"
          loading={loading}
          dataSource={filtered}
          pagination={{ pageSize: 12, showSizeChanger: false }}
          scroll={{ x: 1000 }}
          onRow={(c) => ({ onClick: () => openView(c), className: "cursor-pointer" })}
          columns={[
            { title: "#", dataIndex: "display_number", width: 60,
              render: (n) => <span className="tabular text-fg-subtle">{n}</span> },
            {
              title: "Client", dataIndex: "name",
              render: (_, c) => (
                <div className="flex items-center gap-3">
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                    c.client_type === "partner"
                      ? "bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300"
                      : "bg-brand-soft text-brand-soft-foreground"
                  }`}>
                    {c.client_type === "partner"
                      ? <Handshake className="h-4.5 w-4.5" />
                      : <UserRound className="h-4.5 w-4.5" />}
                  </span>
                  <div>
                    <p className="font-medium text-fg">
                      {c.name}
                      {c.client_type === "partner" && (
                        <Tag color="orange" className="!ml-2 !mr-0">Partner</Tag>
                      )}
                    </p>
                    <p className="text-xs text-fg-subtle">{c.phone || c.email || ""}</p>
                  </div>
                </div>
              ),
            },
            { title: "Purchases", dataIndex: "purchase_count", width: 100, align: "center",
              render: (v) => <span className="tabular">{v}</span> },
            { title: "Total spent", dataIndex: "total_spent", width: 115, align: "right",
              sorter: (a, b) => Number(a.total_spent) - Number(b.total_spent),
              render: (v) => <span className="tabular font-medium">{money(v)}</span> },
            { title: "Owing", dataIndex: "outstanding", width: 105, align: "right",
              sorter: (a, b) => Number(a.outstanding) - Number(b.outstanding),
              render: (v) =>
                Number(v) > 0
                  ? <span className="tabular font-medium text-rose-600 dark:text-rose-400">{money(v)}</span>
                  : <span className="text-fg-subtle">—</span> },
            { title: "Prepaid", dataIndex: "credit_balance", width: 105, align: "right",
              sorter: (a, b) => Number(a.credit_balance) - Number(b.credit_balance),
              render: (v) =>
                Number(v) > 0
                  ? <span className="tabular font-medium text-emerald-600 dark:text-emerald-400">{money(v)}</span>
                  : <span className="text-fg-subtle">—</span> },
            { title: "Last purchase", dataIndex: "last_purchase_at", width: 140,
              render: (v) => <span className="text-fg-muted">{v ? fmtDate(v, "dd MMM yyyy") : "Never"}</span> },
            {
              title: "", key: "actions", width: 110, align: "right",
              render: (_, c) => (
                <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                  <Button size="small" type="text" icon={<Pencil className="h-4 w-4" />} onClick={() => openEdit(c)} />
                  {canDelete && (
                    <Popconfirm title={`Delete "${c.name}"?`} description="Their invoices keep the name for history."
                      onConfirm={async () => {
                        try { await api.delete(`/clients/${c.id}`); toast.success("Client deleted"); load(); }
                        catch (err) { toast.error(apiError(err)); }
                      }}>
                      <Button size="small" type="text" danger icon={<Trash2 className="h-4 w-4" />} />
                    </Popconfirm>
                  )}
                </div>
              ),
            },
          ]}
        />
      </div>

      <Modal open={formOpen} onCancel={() => setFormOpen(false)} onOk={submit} confirmLoading={saving}
        title={editing ? `Edit ${editing.name}` : "Add client"} okText={editing ? "Save changes" : "Create client"}
        width={560} centered>
        <Form form={form} layout="vertical" requiredMark={false} className="pt-2">
          <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
            <Form.Item label="Name" name="name" rules={[{ required: true, message: "Client name is required" }]}>
              <Input placeholder="Full name" />
            </Form.Item>
            <Form.Item label="Phone" name="phone">
              <Input placeholder="Phone number" />
            </Form.Item>
            <Form.Item label="Email" name="email" rules={[{ type: "email", message: "Invalid email" }]}>
              <Input placeholder="Email (optional)" />
            </Form.Item>
            <Form.Item label="Sex" name="sex">
              <Select allowClear placeholder="Select" options={[
                { value: "male", label: "Male" },
                { value: "female", label: "Female" },
                { value: "other", label: "Other" },
              ]} />
            </Form.Item>
            <Form.Item label="Type" name="client_type" className="sm:col-span-2"
              tooltip="Partners buy stock in bulk units (boxes, cases) at wholesale prices">
              <Segmented block options={[
                { value: "normal", label: "Normal (online, walk-in)" },
                { value: "partner", label: "Partner (stock consumer)" },
              ]} />
            </Form.Item>
            <Form.Item label="ID card" name="id_card">
              <Input placeholder="National ID (optional)" />
            </Form.Item>
            <Form.Item label="Address" name="address">
              <Input placeholder="Address (optional)" />
            </Form.Item>
            <Form.Item label="Note" name="note" className="sm:col-span-2">
              <Input.TextArea rows={2} placeholder="Anything to remember about this customer" />
            </Form.Item>
          </div>
        </Form>
      </Modal>

      {/* ── Client statement drawer ── */}
      <Drawer open={!!viewing} onClose={() => setViewing(null)} size={720}
        title={
          cl && (
            <span className="flex items-center gap-3">
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                cl.client_type === "partner"
                  ? "bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300"
                  : "bg-brand-soft text-brand-soft-foreground"
              }`}>
                {cl.client_type === "partner"
                  ? <Handshake className="h-4.5 w-4.5" />
                  : <UserRound className="h-4.5 w-4.5" />}
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-2">
                  <span className="truncate">{cl.name}</span>
                  {cl.client_type === "partner" && <Tag color="orange" className="!m-0">Partner</Tag>}
                </span>
                <span className="block text-xs font-normal text-fg-subtle">
                  Client #{cl.display_number}{cl.phone ? `, ${cl.phone}` : ""}
                </span>
              </span>
            </span>
          )
        }
        extra={
          <div className="flex gap-2">
            <Button size="small" icon={<Pencil className="h-4 w-4" />}
              onClick={() => viewing && openEdit(cl ?? viewing)}>
              Edit
            </Button>
            <Button size="small" type="primary" icon={<Wallet className="h-4 w-4" />} onClick={() => setDepositOpen(true)}>
              Add deposit
            </Button>
          </div>
        }>
        {viewing && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-x-3 gap-y-3 rounded-xl bg-surface-sunken p-3.5 text-sm">
              <ContactItem icon={<Phone className="h-4 w-4" />} label="Phone" value={cl?.phone} />
              <ContactItem icon={<Mail className="h-4 w-4" />} label="Email" value={cl?.email} />
              <ContactItem icon={<IdCard className="h-4 w-4" />} label="ID card" value={cl?.id_card} />
              <ContactItem icon={<MapPin className="h-4 w-4" />} label="Address" value={cl?.address} />
              {cl?.note && (
                <div className="col-span-2">
                  <ContactItem icon={<StickyNote className="h-4 w-4" />} label="Note" value={cl.note} />
                </div>
              )}
            </div>

            {/* Account position (all time) */}
            <div className="grid grid-cols-2 gap-3">
              <div className={`rounded-lg border p-3 ${
                Number(statement?.overall.outstanding) > 0
                  ? "border-rose-200 bg-rose-50 dark:border-rose-500/30 dark:bg-rose-500/10"
                  : "border-line bg-surface-raised"
              }`}>
                <p className="text-xs text-fg-subtle">Owing (all time)</p>
                <p className={`tabular text-xl font-semibold ${
                  Number(statement?.overall.outstanding) > 0
                    ? "text-rose-600 dark:text-rose-400" : "text-fg"
                }`}>
                  {money(statement?.overall.outstanding)}
                </p>
                {Number(statement?.overall.outstanding) === 0 && (
                  <p className="text-xs text-emerald-600 dark:text-emerald-400">Fully paid</p>
                )}
              </div>
              <div className={`rounded-lg border p-3 ${
                Number(cl?.credit_balance) > 0
                  ? "border-emerald-200 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/10"
                  : "border-line bg-surface-raised"
              }`}>
                <p className="text-xs text-fg-subtle">Prepaid balance</p>
                <p className={`tabular text-xl font-semibold ${
                  Number(cl?.credit_balance) > 0
                    ? "text-emerald-600 dark:text-emerald-400" : "text-fg"
                }`}>
                  {money(cl?.credit_balance)}
                </p>
              </div>
            </div>

            {/* Period filter + summary */}
            <div className="flex flex-wrap items-center gap-2">
              <RangePicker
                value={stmtRange}
                onChange={(v) => setStmtRange(v as [Dayjs, Dayjs] | null)}
                presets={[
                  { label: "Today", value: [dayjs(), dayjs()] },
                  { label: "This week", value: [dayjs().startOf("week"), dayjs()] },
                  { label: "This month", value: [dayjs().startOf("month"), dayjs()] },
                  { label: "This year", value: [dayjs().startOf("year"), dayjs()] },
                ]}
              />
              <span className="text-xs text-fg-subtle">{stmtRange ? "Selected period" : "All time"}</span>
            </div>

            {statement && (
              <div className="grid grid-cols-2 gap-3 rounded-lg bg-surface-sunken p-3 text-center text-sm sm:grid-cols-4">
                <div>
                  <p className="text-xs text-fg-subtle">Purchases</p>
                  <p className="tabular font-semibold text-fg">{statement.period.invoice_count}</p>
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
            )}

            <Tabs
              defaultActiveKey="purchases"
              items={[
                {
                  key: "purchases",
                  label: "Purchase history",
                  children: stmtLoading ? (
                    <div className="flex justify-center py-10"><Spinner /></div>
                  ) : (statement?.sales.length ?? 0) === 0 ? (
                    <EmptyState
                      icon={ReceiptText}
                      title="No purchases yet"
                      description={stmtRange
                        ? "Nothing was bought in the selected period. Try a wider date range."
                        : "Invoices will show up here after this client's first sale at the POS."}
                    />
                  ) : (
                    <div>
                      <p className="mb-1.5 text-xs text-fg-subtle">Click a purchase to see the full invoice.</p>
                      <ul className="space-y-1">
                        {statement?.sales.map((s) => {
                          const bal = Number(s.total) - Number(s.amount_paid);
                          return (
                            <li
                              key={s.id}
                              onClick={() => setDetailId(s.id)}
                              className="group flex cursor-pointer items-center gap-3 rounded-lg border border-transparent px-2.5 py-2.5 text-sm transition-colors duration-150 hover:border-line hover:bg-surface-sunken"
                            >
                              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand-soft-foreground">
                                <ReceiptText className="h-4.5 w-4.5" />
                              </span>
                              <div className="min-w-0 flex-1">
                                <p className="flex items-center gap-2 font-medium text-fg">
                                  <span className="truncate">{fmtDate(s.created_at, "dd MMM yyyy")}</span>
                                  <StatusBadge status={s.status} />
                                </p>
                                <p className="truncate font-mono text-xs text-fg-subtle">
                                  {s.invoice_number}{s.item_count ? `, ${s.item_count} items` : ""}
                                </p>
                              </div>
                              <div className="text-right">
                                <p className="tabular font-medium text-fg">{money(s.total)}</p>
                                {s.status !== "voided" && bal > 0 && (
                                  <p className="tabular text-xs text-rose-600 dark:text-rose-400">{money(bal)} owing</p>
                                )}
                              </div>
                              {s.status !== "voided" && bal > 0 && (
                                <Button size="small" icon={<HandCoins className="h-3.5 w-3.5" />}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setPaySale({ ...s, client_id: viewing.id } as Sale);
                                  }}>
                                  Pay
                                </Button>
                              )}
                              <ChevronRight className="h-4 w-4 shrink-0 text-fg-subtle transition-colors duration-150 group-hover:text-fg" />
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ),
                },
                {
                  key: "payments",
                  label: "Payments and deposits",
                  children: stmtLoading ? (
                    <div className="flex justify-center py-10"><Spinner /></div>
                  ) : (statement?.payments.length ?? 0) === 0 ? (
                    <EmptyState
                      icon={Wallet}
                      title="No payments yet"
                      description="Money received for invoices and prepaid deposits will be listed here."
                    />
                  ) : (
                    <ul className="space-y-1">
                      {statement?.payments.map((p) => (
                        <li
                          key={p.id}
                          onClick={p.sale_id ? () => setDetailId(p.sale_id!) : undefined}
                          className={`flex items-center justify-between gap-2 rounded-lg border border-transparent px-2.5 py-2.5 text-sm ${
                            p.sale_id
                              ? "group cursor-pointer transition-colors duration-150 hover:border-line hover:bg-surface-sunken"
                              : ""
                          }`}
                        >
                          <div className="min-w-0">
                            <p className="flex items-center gap-2">
                              <StatusBadge status={p.type === "sale" ? p.method : p.type} />
                              {p.invoice_number && <span className="font-mono text-xs text-fg-subtle">{p.invoice_number}</span>}
                            </p>
                            <p className="mt-0.5 text-xs text-fg-subtle">
                              {fmtDate(p.created_at)}
                              {p.received_by ? `, by ${p.received_by}` : ""}
                              {p.note ? `, ${p.note}` : ""}
                            </p>
                          </div>
                          <span className="flex items-center gap-2">
                            <span className={`tabular font-medium ${
                              Number(p.amount) < 0 ? "text-rose-600 dark:text-rose-400" : "text-fg"
                            }`}>
                              {Number(p.amount) < 0 ? "" : "+"}{money(p.amount)}
                            </span>
                            {p.sale_id && (
                              <ChevronRight className="h-4 w-4 shrink-0 text-fg-subtle transition-colors duration-150 group-hover:text-fg" />
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ),
                },
              ]}
            />
          </div>
        )}
      </Drawer>

      <ReceivePaymentModal
        sale={paySale}
        onClose={() => setPaySale(null)}
        onDone={() => { load(); loadStatement(); }}
      />

      <InvoiceDetailModal
        saleId={detailId}
        onClose={() => setDetailId(null)}
        onChanged={() => { load(); loadStatement(); }}
      />

      <DepositModal
        client={depositOpen ? cl : null}
        onClose={() => setDepositOpen(false)}
        onDone={() => { load(); loadStatement(); }}
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

// Prepaid top-up: money the client leaves on their account, spent at checkout.
function DepositModal({
  client, onClose, onDone,
}: {
  client: Client | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [amount, setAmount] = useState<number | null>(null);
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (client) {
      setAmount(null);
      setMethod("cash");
      setNote("");
    }
  }, [client]);

  const submit = async () => {
    if (!client || !amount || amount <= 0) return;
    setSaving(true);
    try {
      const { data } = await api.post(`/clients/${client.id}/deposits`, {
        amount, method, note: note.trim() || null,
      });
      toast.success(`Deposit recorded, prepaid balance is now ${money(data.credit_balance)}`);
      onDone();
      onClose();
    } catch (err) {
      toast.error(apiError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={!!client}
      onCancel={onClose}
      centered
      width={420}
      title={client ? `Add deposit for ${client.name}` : ""}
      okText={amount ? `Deposit ${money(amount)}` : "Deposit"}
      onOk={submit}
      confirmLoading={saving}
      okButtonProps={{ disabled: !amount || amount <= 0 }}
      destroyOnHidden
    >
      {client && (
        <div className="space-y-4 py-2">
          <div className="rounded-lg bg-surface-sunken p-3 text-center text-sm">
            <p className="text-fg-subtle">Current prepaid balance</p>
            <p className="tabular text-xl font-semibold text-fg">{money(client.credit_balance)}</p>
          </div>
          <div>
            <p className="mb-1 text-sm text-fg-muted">Amount</p>
            <InputNumber
              autoFocus size="large" className="!w-full" min={0.01} prefix="$"
              value={amount} onChange={(v) => setAmount(v === null ? null : Number(v))}
            />
          </div>
          <Segmented
            block
            value={method}
            onChange={(v) => setMethod(v as PaymentMethod)}
            options={[
              { label: "Cash", value: "cash" },
              { label: "KHQR", value: "khqr" },
              { label: "Card", value: "card" },
              { label: "Bank", value: "bank" },
            ]}
          />
          <Input placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={255} />
        </div>
      )}
    </Modal>
  );
}
