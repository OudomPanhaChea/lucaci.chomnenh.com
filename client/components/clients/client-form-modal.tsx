"use client";
import { useEffect, useState } from "react";
import { Form, Input, Modal, Segmented, Select } from "antd";
import { toast } from "react-toastify";
import api, { apiError } from "@/services/api";
import type { Client } from "@/lib/types";

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
        toast.success("Client updated");
      } else {
        await api.post("/clients", values);
        toast.success("Client created");
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
      title={client ? `Edit ${client.name}` : "Add client"} okText={client ? "Save changes" : "Create client"}
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
  );
}
