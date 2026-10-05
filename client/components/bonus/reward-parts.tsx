"use client";
import type { ReactNode } from "react";
import { Segmented } from "antd";
import { InputNumber } from "@/components/ui/input-number";
import { money } from "@/lib/format";

// Building blocks shared by both bonus flows (picked items and invoices).

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export type RewardType = "percent" | "fixed";

// Per-line reward choice for product lines. A line only counts once it is
// ticked AND has a usable value, so half-filled rows never block the save.
export type ItemSel = {
  include: boolean;
  type: RewardType;
  pct: number | null;
  amount: number | null;
};
export const EMPTY_SEL: ItemSel = {
  include: false,
  type: "percent",
  pct: null,
  amount: null,
};

// What a reward is worth on a basis amount (0 when not usable yet)
export function rewardAmount(
  type: RewardType,
  pct: number | null,
  amount: number | null,
  basis: number,
) {
  if (type === "fixed") return amount && amount > 0 ? round2(amount) : 0;
  return pct && pct > 0 && basis > 0 ? round2((basis * pct) / 100) : 0;
}

const TYPE_OPTIONS = [
  { value: "percent", label: "%" },
  { value: "fixed", label: "$" },
];

// A numbered card for each step of the page
export function Section({
  n,
  title,
  right,
  children,
}: {
  n: number;
  title: string;
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-line bg-surface-raised shadow-card">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="tabular flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand text-xs font-semibold text-brand-foreground">
            {n}
          </span>
          <h2 className="min-w-0 text-base font-semibold text-fg">{title}</h2>
        </div>
        {right}
      </header>
      <div className="pb-4">{children}</div>
    </section>
  );
}

// A reward value input: % or $ plus the number, used by both reward kinds
export function RewardInput({
  type,
  pct,
  amount,
  onType,
  onPct,
  onAmount,
  label,
}: {
  type: RewardType;
  pct: number | null;
  amount: number | null;
  onType: (t: RewardType) => void;
  onPct: (v: number | null) => void;
  onAmount: (v: number | null) => void;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <Segmented
        value={type}
        onChange={(v) => onType(v as RewardType)}
        options={TYPE_OPTIONS}
        aria-label={label}
      />
      {type === "percent" ? (
        <InputNumber
          className="w-24!"
          min={0}
          max={100}
          step={0.5}
          suffix="%"
          placeholder="0"
          value={pct}
          onChange={onPct}
          aria-label={label}
        />
      ) : (
        <InputNumber
          className="w-24!"
          min={0}
          step={0.5}
          prefix="$"
          placeholder="0.00"
          value={amount}
          onChange={onAmount}
          aria-label={label}
        />
      )}
    </div>
  );
}

export const Amount = ({ value }: { value: number }) => (
  <span className="tabular w-20 shrink-0 text-right text-sm">
    {value > 0 ? (
      <span className="font-semibold text-fg">{money(value)}</span>
    ) : (
      <span className="text-fg-subtle">—</span>
    )}
  </span>
);
