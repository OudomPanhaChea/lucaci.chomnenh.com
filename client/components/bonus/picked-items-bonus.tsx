"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Input, Popconfirm } from "antd";
import { toast } from "react-toastify";
import { PackageOpen, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InputNumber } from "@/components/ui/input-number";
import api, { apiError } from "@/services/api";
import {
  readPicked,
  startBonusPick,
  writePicked,
  type PickedLine,
} from "@/lib/pos-cart";
import { money, num } from "@/lib/format";
import { useT } from "@/lib/i18n";
import type { Bonus, Client } from "@/lib/types";
import { Amount, Section, round2 } from "./reward-parts";

// The reward is a $ rate per unit, so loose pieces and boxes of the same
// product are separate lines, each with its own rate.
type UnitLine = {
  key: string;
  product_id: number;
  unit_id: number | null;
  unit_name: string;
  quantity: number;
};
// Grouped per product for display (name once, a row per unit beneath)
type ProductLine = {
  product_id: number;
  product_name: string;
  parts: PickedLine[];
  units: UnitLine[];
  line_total: number;
};

const unitKey = (productId: number, unitId: number | null) =>
  `${productId}:${unitId ?? 0}`;

// Bonus on items picked in the POS (the default tab). The items are only the
// basis to reward, not a sale: nothing here touches stock, invoices or money.
// The list lives in the browser per client until the bonus is saved.
// ONE reward kind (owner 2026-10-08): $ per unit × the quantity picked.
export default function PickedItemsBonus({
  client,
  onSaved,
}: {
  client: Client;
  onSaved: (bonus: Bonus) => void;
}) {
  const { t } = useT();
  const router = useRouter();
  const [picked, setPicked] = useState<PickedLine[]>([]);

  // $ per unit, keyed by product + unit
  const [rates, setRates] = useState<Record<string, number | null>>({});
  const [bulkRate, setBulkRate] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  // Read after mount: localStorage does not exist during server render
  useEffect(() => {
    setPicked(readPicked(client.id));
  }, [client.id]);

  const lines = useMemo(() => {
    const map = new Map<number, ProductLine>();
    for (const l of picked) {
      const line = map.get(l.product_id) ?? {
        product_id: l.product_id,
        product_name: l.product_name,
        parts: [],
        units: [],
        line_total: 0,
      };
      line.parts.push(l);
      line.line_total = round2(line.line_total + l.quantity * l.price);
      const key = unitKey(l.product_id, l.unit_id);
      const unit = line.units.find((u) => u.key === key);
      if (unit) unit.quantity += l.quantity;
      else
        line.units.push({
          key,
          product_id: l.product_id,
          unit_id: l.unit_id,
          unit_name: l.unit_name,
          quantity: l.quantity,
        });
      map.set(l.product_id, line);
    }
    return [...map.values()];
  }, [picked]);
  const unitLines = useMemo(() => lines.flatMap((l) => l.units), [lines]);
  const basis = round2(lines.reduce((s, l) => s + l.line_total, 0));

  const unitAmount = (u: UnitLine) => {
    const r = rates[u.key];
    return r && r > 0 ? round2(u.quantity * r) : 0;
  };
  const applyBulkRate = () => {
    if (!bulkRate || bulkRate <= 0) return;
    setRates(Object.fromEntries(unitLines.map((u) => [u.key, bulkRate])));
  };
  const rewarded = unitLines.filter((u) => unitAmount(u) > 0);
  const totalAmount = round2(rewarded.reduce((s, u) => s + unitAmount(u), 0));
  const canSave = totalAmount > 0;

  const openPos = () => {
    const ok = startBonusPick(
      {
        client_id: client.id,
        client_name: client.name,
        return_to: `/admin/bonus/${client.id}`,
      },
      picked,
    );
    if (!ok) {
      toast.error(t("Could not open the POS"));
      return;
    }
    router.push("/admin/pos");
  };

  const reset = () => {
    writePicked(client.id, []);
    setPicked([]);
    setRates({});
    setBulkRate(null);
    setNote("");
  };

  const save = () => {
    if (!canSave) return;
    setSaving(true);
    api
      .post("/bonuses", {
        client_id: client.id,
        lines: picked.map((l) => ({
          product_id: l.product_id,
          unit_id: l.unit_id,
          quantity: l.quantity,
          price: l.price,
        })),
        note: note.trim() || null,
        items: rewarded.map((u) => ({
          product_id: u.product_id,
          unit_id: u.unit_id,
          rate: rates[u.key],
        })),
      })
      .then(({ data }) => {
        toast.success(t("Saved"));
        reset();
        onSaved(data);
      })
      .catch((err) => toast.error(apiError(err)))
      .finally(() => setSaving(false));
  };

  return (
    <>
      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-4">
          {/* ── 1. Items picked in the POS ── */}
          <Section
            n={1}
            title={t("Items")}
            right={
              lines.length > 0 && (
                <div className="flex items-center gap-2">
                  <Popconfirm
                    title={t("Clear items?")}
                    okText={t("Clear")}
                    cancelText={t("Cancel")}
                    okButtonProps={{ danger: true }}
                    onConfirm={reset}
                  >
                    <Button>{t("Clear")}</Button>
                  </Popconfirm>
                  <Button
                    icon={<ShoppingCart className="h-4 w-4" aria-hidden />}
                    onClick={openPos}
                  >
                    {t("Edit")}
                  </Button>
                </div>
              )
            }
          >
            {lines.length === 0 ? (
              <div className="px-4 pt-4">
                <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-line px-4 py-10 text-center">
                  <PackageOpen className="h-8 w-8 text-fg-subtle" aria-hidden />
                  <p className="text-sm text-fg-muted">{t("No items yet")}</p>
                  <Button
                    type="primary"
                    size="large"
                    icon={<ShoppingCart className="h-4 w-4" aria-hidden />}
                    onClick={openPos}
                  >
                    {t("Pick in POS")}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="overflow-hidden border-b border-line">
                <ul className="divide-y divide-line">
                  {lines.map((l) => (
                    <li
                      key={l.product_id}
                      className="flex items-center gap-3 px-4 py-2.5"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-fg">
                          {l.product_name}
                        </p>
                        <p className="tabular text-xs text-fg-subtle">
                          {l.parts
                            .map(
                              (p) =>
                                `${num(p.quantity)} ${p.unit_name} × ${money(p.price)}`,
                            )
                            .join(" + ")}
                        </p>
                      </div>
                      <span className="tabular shrink-0 text-sm font-medium text-fg">
                        {money(l.line_total)}
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="flex items-center justify-between border-t border-line bg-surface-sunken px-4 py-2.5 text-sm">
                  <span className="font-medium text-fg-muted">
                    {t("Total")}
                  </span>
                  <span className="tabular font-semibold text-fg">
                    {money(basis)}
                  </span>
                </div>
              </div>
            )}
          </Section>

          {/* ── 2. Reward: $ per unit × the quantity picked ── */}
          <Section n={2} title={t("Reward")}>
            {lines.length === 0 ? (
              <div className="px-4 pt-4">
                <p className="rounded-lg border border-dashed border-line px-4 py-8 text-center text-sm text-fg-subtle">
                  {t("Pick items first.")}
                </p>
              </div>
            ) : (
              <div className="border-b border-line">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-surface-sunken px-4 py-3">
                  <span className="text-sm font-medium text-fg">
                    {t("All products")}
                  </span>
                  <div className="flex items-center gap-2">
                    <InputNumber
                      min={0}
                      step={0.05}
                      precision={2}
                      className="w-28! py-0.75!"
                      prefix="$"
                      placeholder="0.00"
                      value={bulkRate}
                      onChange={setBulkRate}
                      onPressEnter={applyBulkRate}
                      size="small"
                      aria-label={t("Bonus per unit for all products")}
                    />
                    <Button
                      type="primary"
                      size={"small"}
                      disabled={!bulkRate || bulkRate <= 0}
                      onClick={applyBulkRate}
                    >
                      {t("Apply")}
                    </Button>
                  </div>
                </div>
                <ul className="divide-y divide-line">
                  {lines.map((l) => (
                    <li
                      key={l.product_id}
                      className="flex flex-wrap items-start gap-x-3 gap-y-2 px-4 py-3"
                    >
                      <p className="min-w-0 flex-[1_1_12rem] truncate pt-2 text-sm font-medium text-fg">
                        {l.product_name}
                      </p>
                      <div className="ml-auto flex flex-col gap-2">
                        {l.units.map((u) => (
                          <div
                            key={u.key}
                            className="flex items-center justify-end gap-2"
                          >
                            <span className="tabular text-sm text-fg-muted">
                              {num(u.quantity)} {u.unit_name} ×
                            </span>
                            <InputNumber
                              min={0}
                              step={0.05}
                              precision={2}
                              className="w-28!"
                              prefix="$"
                              placeholder="0.00"
                              value={rates[u.key] ?? null}
                              onChange={(v) =>
                                setRates((prev) => ({ ...prev, [u.key]: v }))
                              }
                              aria-label={`${l.product_name}: ${t("per unit")} (${u.unit_name})`}
                            />
                            <Amount value={unitAmount(u)} />
                          </div>
                        ))}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Section>
        </div>

        {/* ── 3. Review and save ── */}
        <aside className="rounded-xl border border-line bg-surface-raised shadow-card xl:sticky xl:top-20">
          <header className="flex items-center gap-2.5 border-b border-line px-4 py-3">
            <span className="tabular flex h-6 w-6 items-center justify-center rounded-full bg-brand text-xs font-semibold text-brand-foreground">
              3
            </span>
            <h2 className="font-semibold text-fg">{t("Summary")}</h2>
          </header>
          <div className="p-4">
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-fg-muted">{t("Items")}</dt>
                <dd className="tabular text-fg">
                  {lines.length
                    ? `${num(lines.length)} · ${money(basis)}`
                    : "—"}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-fg-muted">{t("Rewarded")}</dt>
                <dd className="tabular text-fg">
                  {rewarded.length
                    ? `${num(rewarded.length)} / ${num(unitLines.length)}`
                    : "—"}
                </dd>
              </div>
            </dl>
            <div className="mt-3 flex items-baseline justify-between border-t border-line pt-3">
              <span className="font-medium text-fg">{t("Total bonus")}</span>
              <span className="tabular text-2xl font-bold text-fg">
                {money(totalAmount)}
              </span>
            </div>

            <label className="mt-4 block">
              <span className="mb-1 block text-xs font-medium text-fg-muted">
                {t("Note")}
              </span>
              <Input.TextArea
                rows={2}
                maxLength={500}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </label>

            <Button
              type="primary"
              size="large"
              block
              className="mt-4!"
              loading={saving}
              disabled={!canSave}
              onClick={save}
            >
              {t("Save")}
            </Button>
          </div>
        </aside>
      </div>

      {/* Tablet/phone: the summary is below the fold, keep total + Save in reach */}
      {lines.length > 0 && (
        <div className="sticky bottom-3 z-20 mt-4 flex items-center justify-between gap-3 rounded-xl border border-line bg-surface-raised/95 p-3 shadow-lg backdrop-blur xl:hidden">
          <div className="min-w-0">
            <p className="text-xs font-medium text-fg-subtle">
              {t("Total bonus")}
            </p>
            <p className="tabular text-xl font-bold leading-tight text-fg">
              {money(totalAmount)}
            </p>
          </div>
          <Button
            type="primary"
            size="large"
            loading={saving}
            disabled={!canSave}
            onClick={save}
          >
            {t("Save")}
          </Button>
        </div>
      )}
    </>
  );
}
