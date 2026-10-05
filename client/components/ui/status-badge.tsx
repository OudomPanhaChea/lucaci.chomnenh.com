"use client";
import { useT, type TKey } from "@/lib/i18n";

// Color only where it carries meaning (money owed, stock running out);
// everything else is a neutral pill.
const STYLES: Record<string, string> = {
  paid: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  partial: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  unpaid: "bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
  low: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  out: "bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
};
const NEUTRAL = "bg-surface-sunken text-fg-muted";

export const STATUS_LABELS: Record<string, TKey> = {
  paid: "Paid",
  partial: "Part paid",
  unpaid: "Unpaid",
  voided: "Refunded",
  deposit: "Prepaid",
  refund: "Refund",
  sale: "Payment",
  credit: "Prepaid",
  active: "Active",
  inactive: "Inactive",
  low: "Low",
  out: "Out",
  owing_add: "Owing",
  owing_pay: "Owing paid",
  cash: "Cash",
  khqr: "KHQR",
  card: "Card",
  bank: "Bank",
  other: "Other",
  owner: "Owner",
  admin: "Manager",
  cashier: "Cashier",
};

export function useStatusLabel() {
  const { t } = useT();
  return (status: string) => (STATUS_LABELS[status] ? t(STATUS_LABELS[status]) : status);
}

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  const statusLabel = useStatusLabel();
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${
        STYLES[status] || NEUTRAL
      }`}
    >
      {label ?? statusLabel(status)}
    </span>
  );
}

// Options for the payment-method Segmented used across payment dialogs.
export function useMethodOptions() {
  const { t } = useT();
  return [
    { label: t("Cash"), value: "cash" },
    { label: t("KHQR"), value: "khqr" },
    { label: t("Card"), value: "card" },
    { label: t("Bank"), value: "bank" },
  ];
}
