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

// A flat element (a divider line is stored with h = 0) would otherwise have a
// zero-height hit box: unclickable, so it could never be selected, moved, styled
// or deleted. Such elements get an invisible grab strip this tall, centered on
// the box, WITHOUT changing where the element renders.
const MIN_HIT = 14;

// One element in EDIT mode: draggable body + resize handles + selection outline.
// Coordinates are canvas-space; `scale` only affects pointer math.
export default function EditableElement({
  el, data, scale, selected, grouped, onSelect, onDrag, onResize, onCommit, onDragStart,
}: {
  el: TemplateElement;
  data: InvoiceData;
  scale: number;
  selected: boolean;
  // True when this element is one of SEVERAL selected. Dragging it then moves
  // the whole selection, so it is outlined as a member of a group rather than
  // as the single element the property panel is describing.
  grouped: boolean;
  // additive = the ctrl/cmd modifier was held, i.e. add to or remove from the
  // selection rather than replace it.
  onSelect: (id: string, additive: boolean) => void;
  // Canvas-space delta since pointer-down. The editor applies it to every
  // selected element, so a group moves as one.
  onDrag: (dx: number, dy: number) => void;
  onResize: (id: string, box: Pick<TemplateElement, "x" | "y" | "w" | "h">) => void;
  onCommit: (id: string) => void;
  onDragStart?: () => void; // snapshot for undo, fired before a drag/resize begins
}) {
  // A line has no height to drag, only width, so its corner/edge N-S handles
  // would stack on top of each other at the same point.
  const handles = el.kind === "line" ? HANDLES.filter((h) => h.dir === "w" || h.dir === "e") : HANDLES;
  const thin = el.h < MIN_HIT;

  const { start } = useDragResize(
    scale,
    () => ({ x: el.x, y: el.y, w: el.w, h: el.h }),
    onDrag,
    (box) => onResize(el.id, box),
    () => onCommit(el.id),
  );

  return (
    <div
      // Unselected boxes sit at a whisper and firm up under the pointer: with
      // every outline at full strength the sheet read as a wireframe, not as
      // the invoice it is designing.
      className={
        selected
          ? undefined
          : "outline-1 outline-dashed outline-[rgba(48,74,89,0.12)] transition-[outline-color] hover:outline-[rgba(48,74,89,0.45)]"
      }
      style={{
        position: "absolute", left: el.x, top: el.y, width: el.w, height: el.h,
        outline: selected ? "1.5px solid #FFA040" : undefined,
        // A group member is tinted as well as outlined: with several elements
        // ringed at once the outline alone reads as hover, not as selection.
        background: grouped ? "rgba(255,160,64,0.10)" : undefined,
        outlineOffset: 0, cursor: "move", touchAction: "none",
      }}
      onPointerDown={(e) => {
        // The right button draws a selection marquee, which belongs to the
        // canvas: let it bubble untouched rather than starting a drag here.
        if (e.button === 2) return;
        const additive = e.ctrlKey || e.metaKey;
        onSelect(el.id, additive);
        if (additive) {
          // Ctrl+click adds or removes; it must not also drag, or a mis-aimed
          // click would move what it just selected.
          e.stopPropagation();
          return;
        }
        onDragStart?.();
        start(e, null);
      }}
    >
      {thin && (
        // Invisible grab strip: bubbles pointer events up to the wrapper above,
        // so a flat element drags, selects and deletes like any other.
        <div
          style={{
            position: "absolute", left: 0, right: 0,
            top: (el.h - MIN_HIT) / 2, height: MIN_HIT, cursor: "move",
          }}
        />
      )}
      <div style={{ width: "100%", height: "100%", pointerEvents: "none" }}>
        {/* The editor draws stand-ins for empty values so an element that
            happens to be blank is still visible and grabbable. */}
        <ElementView el={el} data={data} placeholders />
      </div>
      {/* Handles only on a lone selection: a group moves as one but does not
          resize as one, and eight handles per member would bury the sheet. */}
      {selected && !grouped && handles.map((h) => (
        <div
          key={h.dir}
          onPointerDown={(e) => {
            if (e.button === 2) return;
            onDragStart?.();
            start(e, h.dir);
          }}
          style={{
            position: "absolute", width: 10, height: 10, background: "#fff",
            border: "1.5px solid #FFA040", borderRadius: 999, zIndex: 2,
            boxShadow: "0 1px 2px rgba(20,35,50,0.18)", touchAction: "none", ...h.style,
          }}
        />
      ))}
    </div>
  );
}
