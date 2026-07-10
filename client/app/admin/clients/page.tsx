"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button, Drawer, Form, Input, Modal, Popconfirm, Select, Table } from "antd";
import { toast } from "react-toastify";
import { Plus, Pencil, Trash2, UserRound } from "lucide-react";
import api, { apiError } from "@/services/api";
import { useRealtime } from "@/hooks/useRealtime";
import { useAuth } from "@/hooks/useAuth";
import { SectionHeader } from "@/components/ui/section-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { money, fmtDate } from "@/lib/format";
import type { Client, Sale } from "@/lib/types";

export default function ClientsPage() {
  const { user } = useAuth();
  const canDelete = user?.role === "owner" || user?.role === "admin";
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [saving, setSaving] = useState(false);
  const [viewing, setViewing] = useState<Client | null>(null);
  const [purchases, setPurchases] = useState<Sale[]>([]);
  const [form] = Form.useForm();

  const load = useCallback(() => {
    api.get("/clients").then(({ data }) => setClients(data)).catch(() => {}).finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);
  useRealtime(["client:changed", "sale:created", "sale:voided"], load);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter(
      (c) =>
        c.name.toLowerCase().includes(q) || c.phone?.includes(q) ||
        c.email?.toLowerCase().includes(q) || c.id_card?.toLowerCase().includes(q)
    );
  }, [clients, search]);

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
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

  const openView = async (c: Client) => {
    setViewing(c);
    try {
      const { data } = await api.get(`/clients/${c.id}/purchases`);
      setPurchases(data);
    } catch {
      setPurchases([]);
    }
  };

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

      <Input allowClear className="!mb-4 !w-72" placeholder="Search name, phone, email, ID"
        value={search} onChange={(e) => setSearch(e.target.value)} />

      <div className="rounded-xl border border-line bg-surface-raised shadow-card">
        <Table<Client>
          rowKey="id"
          loading={loading}
          dataSource={filtered}
          pagination={{ pageSize: 12, showSizeChanger: false }}
          scroll={{ x: 800 }}
          onRow={(c) => ({ onClick: () => openView(c), className: "cursor-pointer" })}
          columns={[
            { title: "#", dataIndex: "display_number", width: 60,
              render: (n) => <span className="tabular text-fg-subtle">{n}</span> },
            {
              title: "Client", dataIndex: "name",
              render: (_, c) => (
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-soft text-brand-soft-foreground">
                    <UserRound className="h-4.5 w-4.5" />
                  </span>
                  <div>
                    <p className="font-medium text-fg">{c.name}</p>
                    <p className="text-xs text-fg-subtle">{c.phone || c.email || ""}</p>
                  </div>
                </div>
              ),
            },
            { title: "Sex", dataIndex: "sex", width: 90, render: (v) => <span className="capitalize">{v || ""}</span> },
            { title: "Purchases", dataIndex: "purchase_count", width: 110, align: "center",
              render: (v) => <span className="tabular">{v}</span> },
            { title: "Total spent", dataIndex: "total_spent", width: 120, align: "right",
              sorter: (a, b) => Number(a.total_spent) - Number(b.total_spent),
              render: (v) => <span className="tabular font-medium">{money(v)}</span> },
            { title: "Last purchase", dataIndex: "last_purchase_at", width: 150,
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
        width={560}>
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

      <Drawer open={!!viewing} onClose={() => setViewing(null)} size={460}
        title={viewing?.name}>
        {viewing && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 rounded-lg bg-surface-sunken p-3 text-sm">
              <div><p className="text-fg-subtle">Phone</p><p className="text-fg">{viewing.phone || "None"}</p></div>
              <div><p className="text-fg-subtle">Email</p><p className="text-fg">{viewing.email || "None"}</p></div>
              <div><p className="text-fg-subtle">Sex</p><p className="capitalize text-fg">{viewing.sex || "None"}</p></div>
              <div><p className="text-fg-subtle">ID card</p><p className="text-fg">{viewing.id_card || "None"}</p></div>
              <div className="col-span-2"><p className="text-fg-subtle">Address</p><p className="text-fg">{viewing.address || "None"}</p></div>
              {viewing.note && (
                <div className="col-span-2"><p className="text-fg-subtle">Note</p><p className="text-fg">{viewing.note}</p></div>
              )}
            </div>
            <div>
              <h3 className="mb-2 font-medium text-fg">Purchase history</h3>
              {purchases.length === 0 ? (
                <p className="py-4 text-center text-sm text-fg-muted">No purchases yet.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {purchases.map((s) => (
                    <li key={s.id} className="flex items-center justify-between py-2.5 text-sm">
                      <div>
                        <Link href="/admin/invoices" className="font-mono text-xs text-brand dark:text-brand-soft-foreground">
                          {s.invoice_number}
                        </Link>
                        <p className="text-xs text-fg-subtle">{fmtDate(s.created_at)}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusBadge status={s.status} />
                        <span className="tabular font-medium text-fg">{money(s.total)}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
