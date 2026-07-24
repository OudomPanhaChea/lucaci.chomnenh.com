"use client";
import { Type, Tag, Image as ImageIcon, QrCode, Table2, Calculator, Minus } from "lucide-react";
import type { ElementKind, TemplateElement } from "./types";

// Default box + style for each newly-added element kind (placed near the top;
// the user then drags it where they want).
const DEFAULTS: Record<ElementKind, Omit<TemplateElement, "id">> = {
  text: { kind: "text", x: 60, y: 60, w: 220, h: 28, fontSize: 14, color: "#142332", text: "New text" },
  field: { kind: "field", x: 60, y: 60, w: 200, h: 46, fontSize: 14, color: "#142332", binding: "invoice_number", label: "Invoice Number" },
  logo: { kind: "logo", x: 60, y: 60, w: 54, h: 54 },
  qr: { kind: "qr", x: 60, y: 60, w: 150, h: 186 },
  items: { kind: "items", x: 48, y: 300, w: 698, h: 300, fontSize: 13, color: "#142332" },
  totals: { kind: "totals", x: 446, y: 640, w: 300, h: 110, fontSize: 13, color: "#142332" },
  line: { kind: "line", x: 48, y: 130, w: 698, h: 0, color: "#e0e6ea" },
};

const ITEMS: { kind: ElementKind; label: string; icon: typeof Type }[] = [
  { kind: "text", label: "Text", icon: Type },
  { kind: "field", label: "Field", icon: Tag },
  { kind: "logo", label: "Logo", icon: ImageIcon },
  { kind: "qr", label: "QR", icon: QrCode },
  { kind: "items", label: "Items", icon: Table2 },
  { kind: "totals", label: "Totals", icon: Calculator },
  { kind: "line", label: "Line", icon: Minus },
];

export function newElement(kind: ElementKind): TemplateElement {
  return { id: `e${Date.now()}${Math.floor(Math.random() * 1000)}`, ...DEFAULTS[kind] };
}

// Toolbar of "add element" buttons.
export default function ElementToolbar({ onAdd }: { onAdd: (kind: ElementKind) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {ITEMS.map((it) => {
        const Icon = it.icon;
        return (
          <button
            key={it.kind}
            onClick={() => onAdd(it.kind)}
            className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs font-medium text-fg-muted transition-colors hover:border-brand hover:text-brand"
          >
            <Icon className="h-3.5 w-3.5" /> {it.label}
          </button>
        );
      })}
    </div>
  );
}
