"use client";
import { useEffect, useState } from "react";
import { Input, Modal, Segmented } from "antd";
import { InputNumber } from "@/components/ui/input-number";
import { toast } from "react-toastify";
import api, { apiError } from "@/services/api";
import { money } from "@/lib/format";
import type { Payment, PaymentMethod } from "@/lib/types";

// Correcting one standalone ledger row of a client: a deposit, recorded
// previous owing, or a payment against that owing. The server re-applies the
// difference to the client's balance, so a mistyped amount can be fixed
// without a compensating entry. Invoice payments are not editable here.
const TITLE: Record<string, string> = {
  deposit: "Edit deposit",
  owing_add: "Edit previous owing",
  owing_pay: "Edit owing payment",
};

export default function LedgerEditModal({
  clientId,
  payment,
  onClose,
  onDone,
}: {
  clientId: number;
  payment: Payment | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [amount, setAmount] = useState<number | null>(null);
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (payment) {
      setAmount(Number(payment.amount));
      setMethod((payment.method as PaymentMethod) || "cash");
      setNote(payment.note || "");
    }
  }, [payment]);

  // owing_add records a debt, not money moving, so it has no payment method.
  const hasMethod = payment?.type !== "owing_add";

  const submit = async () => {
    if (!payment || !amount || amount <= 0) return;
    setSaving(true);
    try {
      await api.put(`/clients/${clientId}/payments/${payment.id}`, {
        amount,
        ...(hasMethod ? { method } : {}),
        note: note.trim() || null,
      });
      toast.success("Ledger entry updated");
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
      open={!!payment}
      onCancel={onClose}
      centered
      width={420}
      title={payment ? TITLE[payment.type] || "Edit entry" : ""}
      okText={amount ? `Save ${money(amount)}` : "Save"}
      onOk={submit}
      confirmLoading={saving}
      okButtonProps={{ disabled: !amount || amount <= 0 }}
      destroyOnHidden
    >
      {payment && (
        <div className="space-y-4 py-2">
          <div className="rounded-lg bg-surface-sunken p-3 text-center text-sm">
            <p className="text-fg-subtle">Recorded amount</p>
            <p className="tabular text-xl font-semibold text-fg">
              {money(payment.amount)}
            </p>
          </div>
          <p className="rounded-lg bg-brand-soft px-3 py-2 text-xs text-brand-soft-foreground">
            Changing the amount updates the client&apos;s balance by the
            difference.
          </p>
          <div>
            <p className="mb-1 text-sm text-fg-muted">Amount</p>
            <InputNumber
              autoFocus
              size="large"
              className="!w-full"
              min={0.01}
              prefix="$"
              value={amount}
              onChange={(v) => setAmount(v === null ? null : Number(v))}
            />
          </div>
          {hasMethod && (
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
