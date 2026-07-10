"use client";
import { useCallback, useEffect, useState } from "react";
import { Button, Form, Input, Modal, Popconfirm, Select, Switch, Table } from "antd";
import { toast } from "react-toastify";
import { Plus, Pencil, Trash2 } from "lucide-react";
import api, { apiError } from "@/services/api";
import { SectionHeader } from "@/components/ui/section-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { fmtDate } from "@/lib/format";
import type { User } from "@/lib/types";

export default function StaffPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const load = useCallback(() => {
    api.get("/users").then(({ data }) => setUsers(data)).catch(() => {}).finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ role: "cashier", is_active: true });
    setFormOpen(true);
  };
  const openEdit = (u: User) => {
    setEditing(u);
    form.setFieldsValue({ ...u, is_active: !!u.is_active, password: undefined });
    setFormOpen(true);
  };

  const submit = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      if (editing) {
        await api.put(`/users/${editing.id}`, values);
        toast.success("Staff updated");
      } else {
        await api.post("/users", values);
        toast.success("Staff account created");
      }
      setFormOpen(false);
      load();
    } catch (err) {
      toast.error(apiError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <SectionHeader
        title="Staff"
        subtitle="Accounts that can log in to this POS"
        actions={
          <Button type="primary" icon={<Plus className="h-4 w-4" />} onClick={openCreate}>
            Add staff
          </Button>
        }
      />

      <div className="rounded-xl border border-line bg-surface-raised shadow-card">
        <Table<User>
          rowKey="id"
          loading={loading}
          dataSource={users}
          pagination={false}
          scroll={{ x: 700 }}
          columns={[
            { title: "Name", dataIndex: "name", render: (v, u) => (
              <div>
                <p className="font-medium text-fg">{v}</p>
                <p className="text-xs text-fg-subtle">{u.email}</p>
              </div>
            ) },
            { title: "Role", dataIndex: "role", width: 110,
              render: (v) => <span className="capitalize text-fg-muted">{v}</span> },
            { title: "Phone", dataIndex: "phone", width: 130, render: (v) => v || <span className="text-fg-subtle">None</span> },
            { title: "Status", dataIndex: "is_active", width: 100,
              render: (v) => <StatusBadge status={v ? "active" : "inactive"} /> },
            { title: "Last login", dataIndex: "last_login_at", width: 160,
              render: (v) => <span className="text-fg-muted">{v ? fmtDate(v) : "Never"}</span> },
            {
              title: "", key: "actions", width: 100, align: "right",
              render: (_, u) => (
                <div className="flex justify-end gap-1">
                  <Button size="small" type="text" icon={<Pencil className="h-4 w-4" />} onClick={() => openEdit(u)} />
                  {u.role !== "owner" && (
                    <Popconfirm title={`Delete ${u.name}?`} onConfirm={async () => {
                      try { await api.delete(`/users/${u.id}`); toast.success("Staff deleted"); load(); }
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
        title={editing ? `Edit ${editing.name}` : "Add staff"} okText={editing ? "Save changes" : "Create account"}>
        <Form form={form} layout="vertical" requiredMark={false} className="pt-2">
          <Form.Item label="Name" name="name" rules={[{ required: true, message: "Name is required" }]}>
            <Input placeholder="Full name" />
          </Form.Item>
          {!editing && (
            <Form.Item label="Email" name="email" rules={[{ required: true, type: "email", message: "Valid email required" }]}>
              <Input placeholder="Login email" />
            </Form.Item>
          )}
          <Form.Item label="Phone" name="phone">
            <Input placeholder="Phone (optional)" />
          </Form.Item>
          {editing?.role !== "owner" && (
            <Form.Item label="Role" name="role">
              <Select options={[
                { value: "admin", label: "Admin (manage products, reports, void invoices)" },
                { value: "cashier", label: "Cashier (sell and view only)" },
              ]} />
            </Form.Item>
          )}
          <Form.Item label={editing ? "New password (leave empty to keep current)" : "Password"} name="password"
            rules={editing ? [] : [{ required: true, min: 8, message: "At least 8 characters" }]}>
            <Input.Password placeholder="At least 8 characters" autoComplete="new-password" />
          </Form.Item>
          {editing && (
            <Form.Item label="Active" name="is_active" valuePropName="checked">
              <Switch />
            </Form.Item>
          )}
        </Form>
      </Modal>
    </div>
  );
}
