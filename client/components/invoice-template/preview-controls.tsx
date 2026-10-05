"use client";
import { Popover } from "antd";
import { SlidersHorizontal } from "lucide-react";
import { InputNumber } from "@/components/ui/input-number";
import { Button } from "@/components/ui/button";
import { DEFAULT_SAMPLE_PREVIEW, type SamplePreview } from "./bindings";
import { useT, type TKey } from "@/lib/i18n";

// Knobs for the invoice the EDITOR previews. They change nothing that is saved:
// a template stores layout, never figures. They exist because rows that only
// print on some invoices (discount, paid, previous owing) are invisible while
// designing against a plain unpaid sample, so there is no way to see where they
// land or how much room the block needs. Turning them on here shows exactly
// what the sheet will do.

const FIELDS: {
  key: keyof SamplePreview;
  label: TKey;
  min: number;
  max: number;
  prefix?: string;
  suffix?: string;
}[] = [
  { key: "itemCount", label: "Items", min: 1, max: 60 },
  { key: "discountPct", label: "Discount", min: 0, max: 100, suffix: "%" },
  { key: "paid", label: "Paid", min: 0, max: 1e9, prefix: "$" },
  { key: "previousOwing", label: "Previous owing", min: 0, max: 1e9, prefix: "$" },
  { key: "rate", label: "Rate", min: 0, max: 1e6, suffix: "៛" },
];

export default function PreviewControls({
  value, onChange,
}: {
  value: SamplePreview;
  onChange: (v: SamplePreview) => void;
}) {
  const { t } = useT();
  const changed = (Object.keys(DEFAULT_SAMPLE_PREVIEW) as (keyof SamplePreview)[]).some(
    (k) => value[k] !== DEFAULT_SAMPLE_PREVIEW[k],
  );

  // Caption on the left, figure on the right: the same shape as the totals rows
  // these knobs drive, and it fits five fields in the height the hints used to
  // take for two.
  const content = (
    <div className="w-60 max-w-[80vw] space-y-2">
      {FIELDS.map((f) => (
        <div key={f.key} className="flex items-center gap-2">
          <label className="w-24 shrink-0 text-xs text-fg-muted" htmlFor={`prev-${f.key}`}>
            {t(f.label)}
          </label>
          <InputNumber
            id={`prev-${f.key}`}
            size="small"
            className="min-w-0 flex-1"
            min={f.min}
            max={f.max}
            prefix={f.prefix}
            suffix={f.suffix}
            value={value[f.key]}
            onChange={(v) => onChange({ ...value, [f.key]: Number(v) || 0 })}
          />
        </div>
      ))}
      <div className="border-t border-line pt-1.5">
        <Button
          size="small" type="text" block disabled={!changed}
          onClick={() => onChange({ ...DEFAULT_SAMPLE_PREVIEW })}
        >
          {t("Reset")}
        </Button>
      </div>
    </div>
  );

  return (
    <Popover content={content} title={t("Preview")} trigger="click" placement="bottomLeft">
      <button
        type="button"
        className={`flex h-8 cursor-pointer items-center gap-1.5 rounded-lg px-2 text-xs font-medium transition-colors ${
          changed
            ? "bg-brand-soft text-brand-soft-foreground"
            : "text-fg-muted hover:bg-brand-soft hover:text-brand-soft-foreground"
        }`}
      >
        <SlidersHorizontal className="h-3.5 w-3.5 shrink-0" /> {t("Preview")}
        {changed && <span className="h-1.5 w-1.5 rounded-full bg-brand" aria-hidden />}
      </button>
    </Popover>
  );
}
