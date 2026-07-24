"use client";
import type { CSSProperties } from "react";
import { type TemplateElement } from "./types";
import type { InvoiceData } from "./bindings";
import ElementView from "./element-view";
import { useDragResize, type ResizeDir } from "./use-drag-resize";

const HANDLES: { dir: ResizeDir; style: CSSProperties }[] = [
  { dir: "nw", style: { left: -5, top: -5, cursor: "nwse-resize" } },
  { dir: "n", style: { left: "50%", top: -5, marginLeft: -5, cursor: "ns-resize" } },
  { dir: "ne", style: { right: -5, top: -5, cursor: "nesw-resize" } },
  { dir: "e", style: { right: -5, top: "50%", marginTop: -5, cursor: "ew-resize" } },
  { dir: "se", style: { right: -5, bottom: -5, cursor: "nwse-resize" } },
  { dir: "s", style: { left: "50%", bottom: -5, marginLeft: -5, cursor: "ns-resize" } },
  { dir: "sw", style: { left: -5, bottom: -5, cursor: "nesw-resize" } },
  { dir: "w", style: { left: -5, top: "50%", marginTop: -5, cursor: "ew-resize" } },
];

// One element in EDIT mode: draggable body + eight resize handles + selection
// outline. Coordinates are canvas-space; `scale` only affects pointer math.
export default function EditableElement({
  el, data, scale, selected, onSelect, onChange, onCommit, onDragStart,
}: {
  el: TemplateElement;
  data: InvoiceData;
  scale: number;
  selected: boolean;
  onSelect: (id: string) => void;
  onChange: (id: string, box: Pick<TemplateElement, "x" | "y" | "w" | "h">) => void;
  onCommit: () => void;
  onDragStart?: () => void; // snapshot for undo, fired before a drag/resize begins
}) {
  const { start } = useDragResize(
    scale,
    () => ({ x: el.x, y: el.y, w: el.w, h: el.h }),
    (box) => onChange(el.id, box),
    onCommit,
  );

  return (
    <div
      style={{
        position: "absolute", left: el.x, top: el.y, width: el.w, height: el.h,
        outline: selected ? "1.5px solid #FFA040" : "1px dashed rgba(48,74,89,0.25)",
        outlineOffset: 0, cursor: "move", touchAction: "none",
      }}
      onPointerDown={(e) => { onSelect(el.id); onDragStart?.(); start(e, null); }}
    >
      <div style={{ width: "100%", height: "100%", pointerEvents: "none" }}>
        <ElementView el={el} data={data} />
      </div>
      {selected && HANDLES.map((h) => (
        <div
          key={h.dir}
          onPointerDown={(e) => { onDragStart?.(); start(e, h.dir); }}
          style={{
            position: "absolute", width: 10, height: 10, background: "#fff",
            border: "1.5px solid #FFA040", borderRadius: 2, zIndex: 2, touchAction: "none", ...h.style,
          }}
        />
      ))}
    </div>
  );
}
