"use client";
import { useRef, useCallback } from "react";
import { CANVAS_W, CANVAS_H, type TemplateElement } from "./types";

type Box = Pick<TemplateElement, "x" | "y" | "w" | "h">;
export type ResizeDir = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
const MIN = 16;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// Pointer-driven drag + resize in canvas coordinates. Screen deltas are divided
// by `scale` so dragging tracks the cursor even when the canvas is displayed
// shrunk. onChange fires continuously; onCommit once at pointerup (for undo/save).
export function useDragResize(
  scale: number,
  getBox: () => Box,
  onChange: (box: Box) => void,
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
      // drag
      onChange({
        ...b,
        x: clamp(b.x + dx, 0, CANVAS_W - b.w),
        y: clamp(b.y + dy, 0, CANVAS_H - b.h),
      });
      return;
    }
    // resize
    let { x, y, w, h } = b;
    const d = s.dir;
    if (d.includes("e")) w = clamp(b.w + dx, MIN, CANVAS_W - b.x);
    if (d.includes("s")) h = clamp(b.h + dy, MIN, CANVAS_H - b.y);
    if (d.includes("w")) { const nx = clamp(b.x + dx, 0, b.x + b.w - MIN); w = b.w + (b.x - nx); x = nx; }
    if (d.includes("n")) { const ny = clamp(b.y + dy, 0, b.y + b.h - MIN); h = b.h + (b.y - ny); y = ny; }
    onChange({ x, y, w, h });
  }, [scale, onChange]);

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
