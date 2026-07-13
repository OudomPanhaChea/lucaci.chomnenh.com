const STYLES: Record<string, string> = {
  paid: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  partial: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  unpaid: "bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
  voided: "bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-300",
  deposit: "bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
  refund: "bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
  credit: "bg-brand-soft text-brand-soft-foreground",
  active: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  inactive: "bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-300",
  low: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  out: "bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
  cash: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  khqr: "bg-brand-soft text-brand-soft-foreground",
  card: "bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
  bank: "bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
  other: "bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-300",
  owner: "bg-brand-soft text-brand-soft-foreground",
  admin: "bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
  cashier: "bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-300",
};

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
        STYLES[status] || STYLES.other
      }`}
    >
      {label ?? status}
    </span>
  );
}
