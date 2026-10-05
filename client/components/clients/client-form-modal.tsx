"use client";
import { useEffect, useState } from "react";
import { Form, Input, Modal, Segmented, Select } from "antd";
import { toast } from "react-toastify";
import api, { apiError } from "@/services/api";
import type { Client } from "@/lib/types";
import { useT } from "@/lib/i18n";

// Add/edit client form, shared by the clients list and the client details page.
export default function ClientFormModal({
  open,
  client,
  onClose,
  onSaved,
}: {
  open: boolean;
  client: Client | null; // null = create
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form] = Form.useForm();
  const { t } = useT();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (client) {
      form.setFieldsValue({ ...client, sex: client.sex ?? undefined });
    } else {
      form.resetFields();
      form.setFieldsValue({ client_type: "normal" });
    }
  }, [open, client, form]);

  const submit = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      if (client) {
        await api.put(`/clients/${client.id}`, values);
        toast.success(t("Saved"));
      } else {
        await api.post("/clients", values);
        toast.success(t("Client added"));
      }
      onClose();
      onSaved();
    } catch (err) {
      toast.error(apiError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onCancel={onClose} onOk={submit} confirmLoading={saving}
      title={client ? t("Edit client") : t("Add client")} okText={t("Save")} cancelText={t("Cancel")}
      width={560} centered>
      <Form form={form} layout="vertical" requiredMark={false} className="pt-2">
        <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
          <Form.Item label={t("Name")} name="name" rules={[{ required: true, message: t("Enter a name") }]}>
            <Input />
          </Form.Item>
          <Form.Item label={t("Phone")} name="phone">
            <Input inputMode="tel" />
          </Form.Item>
          <Form.Item label={t("Email")} name="email" rules={[{ type: "email", message: t("Enter a valid email") }]}>
            <Input type="email" />
          </Form.Item>
          <Form.Item label={t("Sex")} name="sex">
            <Select allowClear options={[
              { value: "male", label: t("Male") },
              { value: "female", label: t("Female") },
              { value: "other", label: t("Other") },
            ]} />
          </Form.Item>
          <Form.Item label={t("Type")} name="client_type" className="sm:col-span-2">
            <Segmented block options={[
              { value: "normal", label: t("Normal") },
              { value: "partner", label: t("Partner") },
            ]} />
          </Form.Item>
          <Form.Item label={t("ID card")} name="id_card">
            <Input />
          </Form.Item>
          <Form.Item label={t("Address")} name="address">
            <Input />
          </Form.Item>
          <Form.Item label={t("Note")} name="note" className="sm:col-span-2">
            <Input.TextArea rows={2} />
          </Form.Item>
        </div>
      </Form>
    </Modal>
  );
}
