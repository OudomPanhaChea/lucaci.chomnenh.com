"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Checkbox, Divider, Input, Popconfirm } from "antd";
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
import {
  Amount,
  EMPTY_SEL,
  RewardInput,
  Section,
  rewardAmount,
  round2,
  type ItemSel,
  type RewardType,
} from "./reward-parts";

// One row per product: a product picked as loose pieces AND boxes is one
// product to reward, like on an invoice.
type ProductLine = {
  product_id: number;
  product_name: string;
  parts: PickedLine[];
  line_total: number;
};

// Bonus on items picked in the POS (the default tab). The items are only the
// basis to reward, not a sale: nothing here touches stock, invoices or money.
// The list lives in the browser per client until the bonus is saved.
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

  const [totType, setTotType] = useState<RewardType>("percent");
  const [totPct, setTotPct] = useState<number | null>(null);
  const [totAmt, setTotAmt] = useState<number | null>(null);
  const [sel, setSel] = useState<Record<number, ItemSel>>({});
  const [bulkPct, setBulkPct] = useState<number | null>(null);
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
        line_total: 0,
      };
      line.parts.push(l);
      line.line_total = round2(line.line_total + l.quantity * l.price);
      map.set(l.product_id, line);
    }
    return [...map.values()];
  }, [picked]);
  const basis = round2(lines.reduce((s, l) => s + l.line_total, 0));

  const updateSel = (id: number, patch: Partial<ItemSel>) =>
    setSel((prev) => ({
      ...prev,
      [id]: { ...(prev[id] ?? EMPTY_SEL), ...patch },
    }));
  const tickAll = (on: boolean) =>
    setSel((prev) => {
      const next = { ...prev };
      for (const l of lines)
        next[l.product_id] = {
          ...(next[l.product_id] ?? EMPTY_SEL),
          include: on,
        };
      return next;
    });
  const applyBulkPct = () => {
    if (!bulkPct || bulkPct <= 0 || bulkPct > 100) return;
    setSel((prev) => {
      const next = { ...prev };
      for (const [k, s] of Object.entries(next))
        if (s.include)
          next[Number(k)] = { ...s, type: "percent", pct: bulkPct };
      return next;
    });
  };

  const lineAmount = (l: ProductLine) => {
    const s = sel[l.product_id];
    return s?.include ? rewardAmount(s.type, s.pct, s.amount, l.line_total) : 0;
  };
  const ticked = lines.filter((l) => sel[l.product_id]?.include).length;
  const rewardedLines = lines.filter((l) => lineAmount(l) > 0);
  const itemsAmount = round2(
    rewardedLines.reduce((s, l) => s + lineAmount(l), 0),
  );
  const totalReward = lines.length
    ? rewardAmount(totType, totPct, totAmt, basis)
    : 0;
  const totalAmount = round2(itemsAmount + totalReward);
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
    setSel({});
    setTotPct(null);
    setTotAmt(null);
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
        level1:
          totalReward > 0
            ? {
                type: totType,
                pct: totType === "percent" ? totPct : null,
                amount: totType === "fixed" ? totAmt : null,
              }
            : null,
        note: note.trim() || null,
        items: rewardedLines.map((l) => {
          const s = sel[l.product_id];
          return {
            product_id: l.product_id,
            bonus_type: s.type,
            pct: s.type === "percent" ? s.pct : null,
            amount: s.type === "fixed" ? s.amount : null,
          };
        }),
      })
      .then(({ data }) => {
        toast.success(t("Saved"));
        reset();
        onSaved(data);
      })
      .catch((err) => toast.error(apiError(err)))
      .finally(() => setSaving(false));
  };

  const allTicked = lines.length > 0 && ticked === lines.length;

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

          {/* ── 2. Rewards: on the total and/or per product ── */}
          <Section n={2} title={t("Reward")}>
            {lines.length === 0 ? (
              <div className="px-4 pt-4">
                <p className="rounded-lg border border-dashed border-line px-4 py-8 text-center text-sm text-fg-subtle">
                  {t("Pick items first.")}
                </p>
              </div>
            ) : (
              <div>
                <div className="px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="min-w-0 text-lg font-semibold text-fg">
                      {t("On the total")}
                      <span className="tabular text-sm ml-1.5 font-normal text-fg-subtle">
                        ({money(basis)})
                      </span>
                    </p>
                    <div className="flex items-center gap-2">
                      <RewardInput
                        label={t("On the total")}
                        type={totType}
                        pct={totPct}
                        amount={totAmt}
                        onType={setTotType}
                        onPct={setTotPct}
                        onAmount={setTotAmt}
                      />
                      <Amount value={totalReward} />
                    </div>
                  </div>
                </div>

                <Divider className="my-0!">
                  <p className="w-full text-center text-sm text-fg-subtle">
                    {t("Or")}
                  </p>
                </Divider>

                <div className="border-b border-line">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
                    <label className="flex min-h-8 cursor-pointer items-center gap-2">
                      <Checkbox
                        checked={allTicked}
                        indeterminate={ticked > 0 && !allTicked}
                        onChange={(e) => tickAll(e.target.checked)}
                      />
                      <span className="text-lg font-semibold text-fg">
                        {t("Per product")}
                      </span>
                    </label>
                    <label className="flex items-center gap-2 text-sm text-fg-muted">
                      {t("All ticked")}
                      <InputNumber
                        min={0}
                        max={100}
                        step={0.5}
                        className="w-24!"
                        suffix="%"
                        placeholder="0"
                        value={bulkPct}
                        onChange={setBulkPct}
                      />
                      <Button
                        disabled={!bulkPct || ticked === 0}
                        onClick={applyBulkPct}
                        size="small"
                        type="primary"
                      >
                        {t("Apply")}
                      </Button>
                    </label>
                  </div>
                  <ul className="divide-y divide-line">
                    {lines.map((l) => {
                      const s = sel[l.product_id];
                      return (
                        <li
                          key={l.product_id}
                          className={`flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5 transition-colors duration-150 ${
                            s?.include ? "bg-brand-soft/30" : ""
                          }`}
                        >
                          <label className="flex min-h-10 min-w-0 flex-[1_1_14rem] cursor-pointer items-center gap-3">
                            <Checkbox
                              checked={!!s?.include}
                              onChange={(e) =>
                                updateSel(l.product_id, {
                                  include: e.target.checked,
                                })
                              }
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium text-fg">
                                {l.product_name}
                              </span>
                              <span className="tabular block text-xs text-fg-subtle">
                                {l.parts
                                  .map(
                                    (p) => `${num(p.quantity)} ${p.unit_name}`,
                                  )
                                  .join(" + ")}{" "}
                                · {money(l.line_total)}
                              </span>
                            </span>
                          </label>
                          {s?.include && (
                            <div className="ml-auto flex items-center gap-2">
                              <RewardInput
                                label={l.product_name}
                                type={s.type}
                                pct={s.pct}
                                amount={s.amount}
                                onType={(v) =>
                                  updateSel(l.product_id, { type: v })
                                }
                                onPct={(v) =>
                                  updateSel(l.product_id, { pct: v })
                                }
                                onAmount={(v) =>
                                  updateSel(l.product_id, { amount: v })
                                }
                              />
                              <Amount value={lineAmount(l)} />
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
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
                <dt className="text-fg-muted">{t("On the total")}</dt>
                <dd className="tabular text-fg">
                  {totalReward > 0 ? money(totalReward) : "—"}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-fg-muted">
                  {t("Per product")}
                  {rewardedLines.length ? ` (${rewardedLines.length})` : ""}
                </dt>
                <dd className="tabular text-fg">
                  {itemsAmount > 0 ? money(itemsAmount) : "—"}
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
