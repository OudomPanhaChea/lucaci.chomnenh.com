"use client";
import { useEffect, useState } from "react";
import { Input, Modal, Segmented } from "antd";
import { InputNumber } from "@/components/ui/input-number";
import { toast } from "react-toastify";
import api, { apiError } from "@/services/api";
import { money } from "@/lib/format";
import type { Client, PaymentMethod } from "@/lib/types";

// Old owing: debt the client carried from before this system, entered as a
// plain amount (no items, no invoice). mode "add" records more of it
// (manager-only route); mode "pay" receives money against what remains.
export default function OwingModal({
  client, mode, onClose, onDone,
}: {
  client: Client | null;
  mode: "add" | "pay";
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
  }, [client, mode]);

  const remaining = Number(client?.opening_owing) || 0;
  const isPay = mode === "pay";

  const submit = async () => {
    if (!client || !amount || amount <= 0) return;
    setSaving(true);
    try {
      const url = isPay
        ? `/clients/${client.id}/owing-payments`
        : `/clients/${client.id}/owing`;
      const body = isPay
        ? { amount, method, note: note.trim() || null }
        : { amount, note: note.trim() || null };
      const { data } = await api.post(url, body);
      toast.success(
        isPay
          ? `Payment recorded, ${money(data.opening_owing)} old owing remains`
          : `Old owing recorded, now ${money(data.opening_owing)}`,
      );
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
      title={
        client
          ? isPay
            ? `Receive old owing from ${client.name}`
            : `Add old owing for ${client.name}`
          : ""
      }
      okText={
        amount
          ? isPay
            ? `Receive ${money(amount)}`
            : `Record ${money(amount)} owing`
          : isPay
            ? "Receive"
            : "Record owing"
      }
      onOk={submit}
      confirmLoading={saving}
      okButtonProps={{
        disabled: !amount || amount <= 0 || (isPay && amount > remaining),
      }}
      destroyOnHidden
    >
      {client && (
        <div className="space-y-4 py-2">
          <div className="rounded-lg bg-surface-sunken p-3 text-center text-sm">
            <p className="text-fg-subtle">Old owing remaining</p>
            <p className="tabular text-xl font-semibold text-fg">
              {money(remaining)}
            </p>
          </div>
          {!isPay && (
            <p className="rounded-lg bg-brand-soft px-3 py-2 text-xs text-brand-soft-foreground">
              For debt from before this system: only the amount is recorded, no
              items or invoice. Payments received against it are tracked in the
              client&apos;s ledger.
            </p>
          )}
          <div>
            <p className="mb-1 text-sm text-fg-muted">Amount</p>
            <InputNumber
              autoFocus size="large" className="!w-full" min={0.01}
              max={isPay ? remaining : undefined} prefix="$"
              value={amount} onChange={(v) => setAmount(v === null ? null : Number(v))}
            />
          </div>
          {isPay && (
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
          )}
          <Input
            placeholder="Note (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={255}
          />
        </div>
      )}
    </Modal>
  );
}
