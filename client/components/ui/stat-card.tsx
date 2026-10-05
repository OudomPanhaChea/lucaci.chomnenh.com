import { ReactNode } from "react";
import { LucideIcon } from "lucide-react";

interface StatCardProps {
  title: string;
  value: ReactNode;
  icon: LucideIcon;
  hint?: ReactNode;
  /** Kept for call-site compatibility; every card uses the same neutral icon chip. */
  accent?: "brand" | "emerald" | "amber" | "rose";
  /** Extra classes on the card frame (e.g. col-span on responsive grids) */
  className?: string;
}

export function StatCard({ title, value, icon: Icon, hint, className }: StatCardProps) {
  return (
    <div className={`rounded-xl border border-line bg-surface-raised p-4 shadow-card ${className ?? ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-fg-muted">{title}</p>
          <p className="tabular mt-1 truncate text-2xl font-semibold text-fg">{value}</p>
          {hint ? <div className="mt-1 text-xs text-fg-subtle">{hint}</div> : null}
        </div>
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand-soft-foreground`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}
