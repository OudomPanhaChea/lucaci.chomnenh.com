"use client";
import { Input, InputNumber, Segmented, Select, Slider } from "antd";
import { AlignLeft, AlignCenter, AlignRight, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DEFAULT_ITEM_LABELS,
  DEFAULT_TOTALS_LABELS,
  FIELD_BINDINGS,
  type Align,
  type ItemLabels,
  type TemplateElement,
  type TotalsLabels,
} from "./types";

// A labeled control row. MUST live at module scope: defining it inside the
// component gives it a new identity on every render, so React unmounts and
// remounts its subtree on each keystroke, which stole focus from inputs after
// a single character and made sliders jump. Keeping it stable fixes both.
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <p className="mb-1 text-xs font-medium text-fg-muted">{label}</p>
      {children}
    </div>
  );
}

// Property panel for the selected element. Emits partial patches; the editor
// applies them. Controls adapt to the element kind.
export default function ElementProperties({
  el, onChange, onDelete,
}: {
  el: TemplateElement | null;
  onChange: (patch: Partial<TemplateElement>) => void;
  onDelete: () => void;
}) {
  if (!el) {
    return (
      <p className="px-1 py-6 text-center text-sm text-fg-subtle">
        Select an element on the sheet to edit it, or add one from the toolbar.
      </p>
    );
  }

  const hasType = ["text", "field", "totals", "items"].includes(el.kind);

  // Merge one key into a nested label object without dropping the others.
  const setItemLabel = (k: keyof ItemLabels, v: string) =>
    onChange({ itemLabels: { ...el.itemLabels, [k]: v } });
  const setTotalsLabel = (k: keyof TotalsLabels, v: string) =>
    onChange({ totalsLabels: { ...el.totalsLabels, [k]: v } });

  return (
    <div className="px-1">
      <div className="mb-3 flex items-center justify-between">
        <span className="rounded-md bg-brand-soft px-2 py-0.5 text-xs font-medium capitalize text-brand-soft-foreground">
          {el.kind}
        </span>
        <Button size="small" type="text" danger icon={<Trash2 className="h-4 w-4" />} onClick={onDelete}>
          Delete
        </Button>
      </div>

      {el.kind === "text" && (
        <Row label="Text">
          <Input.TextArea rows={2} value={el.text} onChange={(e) => onChange({ text: e.target.value })} />
        </Row>
      )}

      {el.kind === "field" && (
        <>
          <Row label="Data field">
            <Select
              value={el.binding} className="w-full" showSearch optionFilterProp="label"
              onChange={(v) => onChange({ binding: v })}
              options={FIELD_BINDINGS.map((b) => ({ value: b.key, label: b.label }))}
            />
          </Row>
          <Row label="Caption (leave empty for none)">
            <Input value={el.label} placeholder="e.g. Billed To" onChange={(e) => onChange({ label: e.target.value })} />
          </Row>
        </>
      )}

      {/* Editable column headings so the items table can be translated. */}
      {el.kind === "items" && (
        <Row label="Column headings">
          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(DEFAULT_ITEM_LABELS) as (keyof ItemLabels)[]).map((k) => (
              <Input
                key={k}
                size="small"
                value={el.itemLabels?.[k] ?? DEFAULT_ITEM_LABELS[k]}
                placeholder={DEFAULT_ITEM_LABELS[k]}
                onChange={(e) => setItemLabel(k, e.target.value)}
              />
            ))}
          </div>
        </Row>
      )}

      {/* Editable row captions so the totals block can be translated. */}
      {el.kind === "totals" && (
        <Row label="Row captions">
          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(DEFAULT_TOTALS_LABELS) as (keyof TotalsLabels)[]).map((k) => (
              <Input
                key={k}
                size="small"
                value={el.totalsLabels?.[k] ?? DEFAULT_TOTALS_LABELS[k]}
                placeholder={DEFAULT_TOTALS_LABELS[k]}
                onChange={(e) => setTotalsLabel(k, e.target.value)}
              />
            ))}
          </div>
        </Row>
      )}

      {hasType && (
        <>
          <Row label="Font size">
            <div className="flex items-center gap-2">
              <Slider
                className="flex-1" min={8} max={40} value={el.fontSize ?? 13}
                onChange={(v) => onChange({ fontSize: v })}
              />
              <InputNumber
                size="small" className="w-16" min={8} max={120} value={el.fontSize ?? 13}
                onChange={(v) => onChange({ fontSize: Number(v) || 13 })}
              />
            </div>
          </Row>
          <Row label="Weight">
            <Segmented
              block value={el.fontWeight ?? 400}
              onChange={(v) => onChange({ fontWeight: v as TemplateElement["fontWeight"] })}
              options={[
                { label: "Regular", value: 400 },
                { label: "Medium", value: 500 },
                { label: "Bold", value: 700 },
              ]}
            />
          </Row>
          <Row label="Align">
            <Segmented
              block value={el.align ?? "left"}
              onChange={(v) => onChange({ align: v as Align })}
              options={[
                { label: <AlignLeft className="inline h-4 w-4" />, value: "left" },
                { label: <AlignCenter className="inline h-4 w-4" />, value: "center" },
                { label: <AlignRight className="inline h-4 w-4" />, value: "right" },
              ]}
            />
          </Row>
        </>
      )}

      {(hasType || el.kind === "line") && (
        <Row label="Color">
          <div className="flex items-center gap-2">
            <input
              type="color" value={el.color ?? "#142332"}
              onChange={(e) => onChange({ color: e.target.value })}
              className="h-8 w-10 cursor-pointer rounded border border-line bg-transparent"
            />
            <Input value={el.color ?? "#142332"} onChange={(e) => onChange({ color: e.target.value })} className="w-28" />
          </div>
        </Row>
      )}

      <Row label="Position & size">
        <div className="grid grid-cols-2 gap-2">
          {(["x", "y", "w", "h"] as const).map((k) => (
            <div key={k} className="flex items-center gap-1">
              <span className="w-4 text-xs uppercase text-fg-subtle">{k}</span>
              <InputNumber
                size="small" className="w-full" value={Math.round(el[k])}
                onChange={(v) => onChange({ [k]: Number(v) || 0 })}
              />
            </div>
          ))}
        </div>
      </Row>
    </div>
  );
}
