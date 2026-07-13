"use client";

// shadcn/ui-style chart primitives for Recharts: a config map naming and
// coloring each series, plus tooltip/legend content that replicate the
// shadcn chart chrome on this app's surface tokens (the project itself is
// AntD + Tailwind, not shadcn).

export type ChartConfig = Record<string, { label: string; color: string }>;

// Recharts passes many more props to tooltip/legend content; only the
// fields used here are typed.
interface TooltipItem {
  dataKey?: string | number;
  name?: string | number;
  value?: number | string;
  color?: string;
}

export function ChartTooltipContent({
  active, payload, label, config, valueFormatter, labelFormatter,
}: {
  active?: boolean;
  payload?: TooltipItem[];
  label?: string | number;
  config: ChartConfig;
  valueFormatter?: (v: number) => string;
  labelFormatter?: (label: string) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="min-w-36 rounded-lg border border-line bg-surface-overlay px-2.5 py-2 text-xs shadow-pop">
      {label !== undefined && (
        <p className="mb-1.5 font-medium text-fg">
          {labelFormatter ? labelFormatter(String(label)) : label}
        </p>
      )}
      <div className="space-y-1">
        {payload.map((item) => {
          const key = String(item.dataKey ?? item.name);
          const series = config[key];
          return (
            <div key={key} className="flex items-center gap-1.5">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
                style={{ background: series?.color ?? item.color }}
              />
              <span className="text-fg-muted">{series?.label ?? key}</span>
              <span className="tabular ml-auto pl-4 font-medium text-fg">
                {valueFormatter ? valueFormatter(Number(item.value)) : item.value}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ChartLegendContent({ config }: { config: ChartConfig }) {
  return (
    <div className="flex items-center justify-center gap-4 pt-2 text-xs text-fg-muted">
      {Object.entries(config).map(([key, series]) => (
        <span key={key} className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: series.color }} />
          {series.label}
        </span>
      ))}
    </div>
  );
}
