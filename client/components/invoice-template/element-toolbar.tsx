"use client";
import { Tooltip } from "antd";
import { Type, Tag, Image as ImageIcon, ImagePlus, QrCode, Table2, Calculator, Minus } from "lucide-react";
import type { ElementKind, TemplateElement } from "./types";
import { useT, type TKey } from "@/lib/i18n";

// Default box + style for each newly-added element kind (placed near the top;
// the user then drags it where they want).
const DEFAULTS: Record<ElementKind, Omit<TemplateElement, "id">> = {
  text: { kind: "text", x: 60, y: 60, w: 220, h: 28, fontSize: 14, color: "#142332", text: "New text" },
  field: { kind: "field", x: 60, y: 60, w: 200, h: 46, fontSize: 14, color: "#142332", binding: "invoice_number", label: "Invoice Number" },
  logo: { kind: "logo", x: 60, y: 60, w: 54, h: 54 },
  // Wide and short: the shape a signature is actually written in, so the
  // first thing dropped in fits its box instead of needing a resize.
  photo: { kind: "photo", x: 60, y: 60, w: 170, h: 80 },
  qr: { kind: "qr", x: 60, y: 60, w: 150, h: 186 },
  items: { kind: "items", x: 48, y: 300, w: 698, h: 300, fontSize: 13, color: "#142332" },
  totals: { kind: "totals", x: 446, y: 640, w: 300, h: 110, fontSize: 13, color: "#142332" },
  line: { kind: "line", x: 48, y: 130, w: 698, h: 0, color: "#e0e6ea" },
};

const ITEMS: { kind: ElementKind; label: TKey; icon: typeof Type }[] = [
  { kind: "text", label: "Text", icon: Type },
  { kind: "field", label: "Field", icon: Tag },
  { kind: "logo", label: "Logo", icon: ImageIcon },
  { kind: "photo", label: "Photo", icon: ImagePlus },
  { kind: "qr", label: "QR", icon: QrCode },
  { kind: "items", label: "Items", icon: Table2 },
  { kind: "totals", label: "Totals", icon: Calculator },
  { kind: "line", label: "Line", icon: Minus },
];

// Icon + name for a kind, shared with the property panel so the two always
// agree on what an element is called.
export const KIND_META = Object.fromEntries(
  ITEMS.map((i) => [i.kind, { label: i.label, icon: i.icon }]),
) as Record<ElementKind, { label: TKey; icon: typeof Type }>;

export function newElement(kind: ElementKind): TemplateElement {
  return { id: `e${Date.now()}${Math.floor(Math.random() * 1000)}`, ...DEFAULTS[kind] };
}

// Toolbar of "add element" buttons. Neutral by default, brand only on hover, so
// the toolbar never competes with the sheet it sits above.
export default function ElementToolbar({ onAdd }: { onAdd: (kind: ElementKind) => void }) {
  const { t } = useT();
  return (
    <div className="flex flex-wrap items-center gap-1">
      {ITEMS.map((it) => {
        const Icon = it.icon;
        return (
          <Tooltip key={it.kind} title={`${t("Add")}: ${t(it.label)}`} mouseEnterDelay={0.4}>
            <button
              type="button"
              onClick={() => onAdd(it.kind)}
              className="flex h-8 cursor-pointer items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-fg-muted transition-colors hover:bg-brand-soft hover:text-brand-soft-foreground"
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              {t(it.label)}
            </button>
          </Tooltip>
        );
      })}
    </div>
  );
}
