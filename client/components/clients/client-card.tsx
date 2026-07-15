"use client";
import { useRouter } from "next/navigation";
import { Popconfirm, Tag } from "antd";
import { Button } from "@/components/ui/button";
import {
  ChevronRight,
  HandCoins,
  Pencil,
  ReceiptText,
  Trash2,
  Trophy,
  Wallet,
} from "lucide-react";
import { ClientAvatar } from "@/components/clients/client-avatar";
import { money, num, fmtDate } from "@/lib/format";
import type { Client } from "@/lib/types";

// One client as a card on the clients grid (same shape as the bonus page
// cards). The whole card opens the client details page; edit/delete live in
// the footer and stop the click from bubbling.
export function ClientCard({
  client: c,
  rank,
  canDelete,
  onEdit,
  onDelete,
}: {
  client: Client;
  rank: number;
  canDelete: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const router = useRouter();
  const owing = Number(c.outstanding ?? 0);
  const prepaid = Number(c.credit_balance ?? 0);
  const topRank = rank <= 3 && Number(c.total_spent ?? 0) > 0;

  return (
    <div
      role="link"
      tabIndex={0}
      aria-label={`Open ${c.name}`}
      onClick={() => router.push(`/admin/clients/${c.id}`)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && e.target === e.currentTarget) {
          router.push(`/admin/clients/${c.id}`);
        }
      }}
      className="group cursor-pointer rounded-xl border border-line bg-surface-raised p-4 shadow-card transition duration-200 hover:border-brand hover:shadow-md focus-visible:border-brand focus-visible:shadow-md focus-visible:outline-none"
    >
      <div className="flex items-center gap-3">
        <ClientAvatar client={c} />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 font-semibold text-fg">
            <span className="truncate">{c.name}</span>
            {c.client_type === "partner" && (
              <Tag color="blue" className="m-0!">
                Partner
              </Tag>
            )}
          </p>
          <p className="truncate text-xs text-fg-muted">
            {c.phone || c.email || `Client #${c.display_number}`}
          </p>
        </div>
        {topRank ? (
          <span className="tabular inline-flex shrink-0 items-center gap-1 rounded-full bg-brand-soft px-2 py-0.5 text-xs font-semibold text-brand-soft-foreground">
            <Trophy className="h-3.5 w-3.5" />
            {rank}
          </span>
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-fg-subtle transition-transform duration-200 group-hover:translate-x-0.5" />
        )}
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <div className="rounded-lg bg-surface-sunken px-2 py-2 text-center">
          <p className="flex items-center justify-center gap-1 text-[11px] text-fg-subtle">
            Purchases
          </p>
          <p className="tabular mt-0.5 text-sm font-semibold text-fg">
            {num(c.purchase_count)}
          </p>
        </div>
        <div className="rounded-lg bg-surface-sunken px-2 py-2 text-center">
          <p className="text-[11px] text-fg-subtle">Spent</p>
          <p className="tabular mt-0.5 text-sm font-semibold text-fg">
            {money(c.total_spent)}
          </p>
        </div>
        <div className="rounded-lg bg-surface-sunken px-2 py-2 text-center">
          <p className="flex items-center justify-center gap-1 text-[11px] text-fg-subtle">
            Owing
          </p>
          <p
            className={`tabular mt-0.5 text-sm font-semibold ${
              owing > 0 ? "text-rose-600 dark:text-rose-400" : "text-fg-subtle"
            }`}
          >
            {owing > 0 ? money(owing) : "—"}
          </p>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-line pt-2 text-xs">
        <span className="min-w-0 truncate text-fg-subtle flex items-center gap-4">
          {c.last_purchase_at
            ? `Last: ${fmtDate(c.last_purchase_at, "dd MMM yyyy")}`
            : "No purchases yet"}
          {prepaid > 0 && (
            <span className="mr-2 inline-flex items-center gap-1 font-medium text-emerald-600 dark:text-emerald-400">
              <Wallet className="h-3.5 w-3.5" />
              {money(prepaid)}
            </span>
          )}
        </span>
        <span
          className="flex shrink-0 gap-1"
          onClick={(e) => e.stopPropagation()}
        >
          <Button
            size="small"
            type="text"
            aria-label={`Edit ${c.name}`}
            icon={<Pencil className="h-4 w-4" />}
            onClick={onEdit}
          />
          {canDelete && (
            <Popconfirm
              title={`Delete "${c.name}"?`}
              description="Their invoices keep the name for history."
              onConfirm={onDelete}
            >
              <Button
                size="small"
                type="text"
                danger
                aria-label={`Delete ${c.name}`}
                icon={<Trash2 className="h-4 w-4" />}
              />
            </Popconfirm>
          )}
        </span>
      </div>
    </div>
  );
}
