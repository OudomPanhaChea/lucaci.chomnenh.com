"use client";
import { useCallback, useEffect, useState } from "react";
import { Form, Input, Modal, Popconfirm, Select, Switch, Table } from "antd";
import { Button } from "@/components/ui/button";
import { toast } from "react-toastify";
import { Plus, Pencil, Trash2 } from "lucide-react";
import api, { apiError } from "@/services/api";
import { SectionHeader } from "@/components/ui/section-header";
import { useStatusLabel } from "@/components/ui/status-badge";
import { fmtDate } from "@/lib/format";
import type { User } from "@/lib/types";
import { useT } from "@/lib/i18n";

export default function StaffPage() {
  const { t } = useT();
  const statusLabel = useStatusLabel();
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
        toast.success(t("Saved"));
      } else {
        await api.post("/users", values);
        toast.success(t("Added"));
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
        title={t("Staff")}
        actions={
          <Button type="primary" icon={<Plus className="h-4 w-4" />} onClick={openCreate}>
            {t("Add staff")}
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
            { title: t("Name"), dataIndex: "name", render: (v, u) => (
              <div>
                <p className="font-medium text-fg">{v}</p>
                <p className="text-xs text-fg-subtle">{u.email}</p>
              </div>
            ) },
            { title: t("Role"), dataIndex: "role", width: 130,
              render: (v) => <span className="text-fg-muted">{statusLabel(v)}</span> },
            { title: t("Phone"), dataIndex: "phone", width: 130, render: (v) => v || <span className="text-fg-subtle">—</span> },
            { title: t("Status"), dataIndex: "is_active", width: 100,
              render: (v) => (v ? t("Active") : <span className="text-fg-subtle">{t("Inactive")}</span>) },
            { title: t("Last login"), dataIndex: "last_login_at", width: 160,
              render: (v) => <span className="text-fg-muted">{v ? fmtDate(v) : "—"}</span> },
            {
              title: "", key: "actions", width: 100, align: "right",
              render: (_, u) => (
                <div className="flex justify-end gap-1">
                  <Button size="small" type="text" icon={<Pencil className="h-4 w-4" />} onClick={() => openEdit(u)} />
                  {u.role !== "owner" && (
                    <Popconfirm title={t("Delete {name}?", { name: u.name })} okText={t("Delete")} cancelText={t("Cancel")} onConfirm={async () => {
                      try { await api.delete(`/users/${u.id}`); toast.success(t("Deleted")); load(); }
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

      <Modal open={formOpen} onCancel={() => setFormOpen(false)} onOk={submit} confirmLoading={saving} centered
        title={editing ? t("Edit staff") : t("Add staff")} okText={t("Save")} cancelText={t("Cancel")}>
        <Form form={form} layout="vertical" requiredMark={false} className="pt-2">
          <Form.Item label={t("Name")} name="name" rules={[{ required: true, message: t("Enter a name") }]}>
            <Input />
          </Form.Item>
          {!editing && (
            <Form.Item label={t("Email")} name="email" rules={[{ required: true, type: "email", message: t("Enter a valid email") }]}>
              <Input type="email" autoComplete="off" />
            </Form.Item>
          )}
          <Form.Item label={t("Phone")} name="phone">
            <Input inputMode="tel" />
          </Form.Item>
          {editing?.role !== "owner" && (
            <Form.Item label={t("Role")} name="role">
              <Select options={[
                { value: "admin", label: t("Manager") },
                { value: "cashier", label: t("Cashier") },
              ]} />
            </Form.Item>
          )}
          <Form.Item label={editing ? t("New password") : t("Password")} name="password"
            extra={editing ? t("Leave empty to keep it.") : undefined}
            rules={editing ? [] : [{ required: true, min: 8, message: t("At least 8 characters") }]}>
            <Input.Password autoComplete="new-password" />
          </Form.Item>
          {editing && (
            <Form.Item label={t("Active")} name="is_active" valuePropName="checked">
              <Switch />
            </Form.Item>
          )}
        </Form>
      </Modal>
    </div>
  );
}
