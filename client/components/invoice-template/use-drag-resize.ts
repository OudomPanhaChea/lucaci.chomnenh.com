"use client";
import { useRef, useCallback } from "react";
import { CANVAS_W, CANVAS_H, type TemplateElement } from "./types";

type Box = Pick<TemplateElement, "x" | "y" | "w" | "h">;
export type ResizeDir = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
const MIN = 16;

// How much of an element must stay on the sheet. Positioning is otherwise free:
// an element may hang over an edge (a logo bled off the corner, a rule run past
// the margin), which the printed sheet then clips. This floor is what stops one
// being dragged clean off the canvas, where it could never be grabbed back.
export const KEEP_ON_SHEET = 20;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// The range a box's own origin may take, given how much of it must stay on the
// sheet. Exported so a group drag can clamp the shared delta instead of each
// member, which would shear the group apart at the edge.
export const xRange = (w: number) => [Math.min(0, KEEP_ON_SHEET - w), CANVAS_W - KEEP_ON_SHEET] as const;
export const yRange = (h: number) => [Math.min(0, KEEP_ON_SHEET - h), CANVAS_H - KEEP_ON_SHEET] as const;

// Pointer-driven drag + resize in canvas coordinates. Screen deltas are divided
// by `scale` so dragging tracks the cursor even when the canvas is displayed
// shrunk. Both callbacks fire continuously; onCommit once at pointerup (for
// undo/save).
//
// A drag reports the DELTA rather than a finished box, because the element under
// the pointer may not be the only one moving: the editor applies the same delta
// to every selected element, measured from the snapshot it took at pointer-down.
export function useDragResize(
  scale: number,
  getBox: () => Box,
  onDrag: (dx: number, dy: number) => void,
  onResize: (box: Box) => void,
  onCommit?: () => void,
) {
  const state = useRef<{ startX: number; startY: number; box: Box; dir: ResizeDir | null } | null>(null);

  const move = useCallback((e: PointerEvent) => {
    const s = state.current;
    if (!s) return;
    const dx = (e.clientX - s.startX) / scale;
    const dy = (e.clientY - s.startY) / scale;
    const b = s.box;

    if (!s.dir) {
      onDrag(dx, dy);
      return;
    }
    // resize
    let { x, y, w, h } = b;
    const d = s.dir;
    if (d.includes("e")) w = clamp(b.w + dx, MIN, CANVAS_W - b.x);
    if (d.includes("s")) h = clamp(b.h + dy, MIN, CANVAS_H - b.y);
    if (d.includes("w")) { const nx = clamp(b.x + dx, 0, b.x + b.w - MIN); w = b.w + (b.x - nx); x = nx; }
    if (d.includes("n")) { const ny = clamp(b.y + dy, 0, b.y + b.h - MIN); h = b.h + (b.y - ny); y = ny; }
    onResize({ x, y, w, h });
  }, [scale, onDrag, onResize]);

  const up = useCallback(() => {
    if (!state.current) return;
    state.current = null;
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    onCommit?.();
  }, [move, onCommit]);

  // start a drag (dir = null) or a resize (dir set)
  const start = useCallback((e: React.PointerEvent, dir: ResizeDir | null) => {
    e.preventDefault();
    e.stopPropagation();
    state.current = { startX: e.clientX, startY: e.clientY, box: getBox(), dir };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }, [getBox, move, up]);

  return { start };
}
