"use client";
import { useEffect, useState } from "react";
import { Input, Modal, Segmented } from "antd";
import { InputNumber } from "@/components/ui/input-number";
import { toast } from "react-toastify";
import api, { apiError } from "@/services/api";
import { money } from "@/lib/format";
import type { Client, PaymentMethod } from "@/lib/types";
import { useT } from "@/lib/i18n";
import { useMethodOptions } from "@/components/ui/status-badge";

// Prepaid top-up: money the client leaves on their account, spent at checkout.
export default function DepositModal({
  client, onClose, onDone,
}: {
  client: Client | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useT();
  const methodOptions = useMethodOptions();
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
      await api.post(`/clients/${client.id}/deposits`, {
        amount, method, note: note.trim() || null,
      });
      toast.success(t("Saved"));
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
      title={t("Add prepaid")}
      okText={t("Save")}
      cancelText={t("Cancel")}
      onOk={submit}
      confirmLoading={saving}
      okButtonProps={{ disabled: !amount || amount <= 0 }}
      destroyOnHidden
    >
      {client && (
        <div className="space-y-4 py-2">
          <div className="rounded-lg bg-surface-sunken p-3 text-center text-sm">
            <p className="text-fg-subtle">{t("Prepaid")}</p>
            <p className="tabular text-xl font-semibold text-fg">{money(client.credit_balance)}</p>
          </div>
          <div>
            <p className="mb-1 text-sm text-fg-muted">{t("Amount")}</p>
            <InputNumber
              autoFocus size="large" className="!w-full" min={0.01} prefix="$"
              value={amount} onChange={(v) => setAmount(v === null ? null : Number(v))}
            />
          </div>
          <Segmented
            block
            value={method}
            onChange={(v) => setMethod(v as PaymentMethod)}
            options={methodOptions}
          />
          <Input placeholder={t("Note")} value={note} onChange={(e) => setNote(e.target.value)} maxLength={255} />
        </div>
      )}
    </Modal>
  );
}
