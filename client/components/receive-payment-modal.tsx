"use client";
import { useEffect, useState } from "react";
import { Input, Modal, Segmented } from "antd";
import { InputNumber } from "@/components/ui/input-number";
import { toast } from "react-toastify";
import api, { apiError } from "@/services/api";
import { money } from "@/lib/format";
import type { LedgerMethod, Sale } from "@/lib/types";
import { useT } from "@/lib/i18n";
import { useMethodOptions } from "@/components/ui/status-badge";

// Take money against an invoice that still has a balance. Used from the
// invoices drawer and the client statement drawer. "Prepaid balance" is only
// offered when the invoice has a client attached.
export default function ReceivePaymentModal({
  sale, onClose, onDone,
}: {
  sale: Sale | null;
  onClose: () => void;
  onDone?: (updated: Sale) => void;
}) {
  const balance = sale ? Math.round((Number(sale.total) - Number(sale.amount_paid)) * 100) / 100 : 0;
  const { t } = useT();
  const methodOptions = useMethodOptions();
  const [amount, setAmount] = useState<number | null>(null);
  const [method, setMethod] = useState<LedgerMethod>("cash");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (sale) {
      setAmount(balance);
      setMethod("cash");
      setNote("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sale?.id]);

  const submit = async () => {
    if (!sale || !amount || amount <= 0) return;
    setSaving(true);
    try {
      const { data } = await api.post(`/sales/${sale.id}/payments`, {
        amount, method, note: note.trim() || null,
      });
      toast.success(
        Number(data.amount_paid) >= Number(data.total)
          ? t("Paid in full")
          : t("Saved, {amount} still owing", { amount: money(Number(data.total) - Number(data.amount_paid)) })
      );
      onDone?.(data);
      onClose();
    } catch (err) {
      toast.error(apiError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={!!sale}
      onCancel={onClose}
      centered
      width={420}
      title={sale ? `${t("Receive payment")} · ${sale.invoice_number}` : ""}
      okText={t("Save")}
      cancelText={t("Cancel")}
      onOk={submit}
      confirmLoading={saving}
      okButtonProps={{ disabled: !amount || amount <= 0 || amount > balance }}
      destroyOnHidden
    >
      {sale && (
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-3 gap-2 rounded-lg bg-surface-sunken p-3 text-center text-sm">
            <div>
              <p className="text-fg-subtle">{t("Total")}</p>
              <p className="tabular font-medium text-fg">{money(sale.total)}</p>
            </div>
            <div>
              <p className="text-fg-subtle">{t("Paid")}</p>
              <p className="tabular font-medium text-fg">{money(sale.amount_paid)}</p>
            </div>
            <div>
              <p className="text-fg-subtle">{t("Owing")}</p>
              <p className="tabular font-semibold text-rose-600 dark:text-rose-400">{money(balance)}</p>
            </div>
          </div>

          <div>
            <p className="mb-1 text-sm text-fg-muted">{t("Amount")}</p>
            <InputNumber
              autoFocus size="large" className="!w-full" min={0.01} max={balance} prefix="$"
              value={amount} onChange={(v) => setAmount(v === null ? null : Number(v))}
            />
            {amount !== null && amount > balance && (
              <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">{t("More than owing")}</p>
            )}
          </div>

          <Segmented
            block
            value={method}
            onChange={(v) => setMethod(v as LedgerMethod)}
            options={[
              ...methodOptions,
              ...(sale.client_id ? [{ label: t("Prepaid"), value: "credit" }] : []),
            ]}
          />

          <Input
            className="mt-4!"
            placeholder={t("Note")}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={255}
          />
        </div>
      )}
    </Modal>
  );
}
