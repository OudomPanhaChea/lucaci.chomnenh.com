"use client";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { Slider, Tooltip } from "antd";
import { Undo2, Redo2 } from "lucide-react";
import { CANVAS_W, CANVAS_H, type ElementKind, type TemplateElement } from "./types";
import type { InvoiceData } from "./bindings";
import EditableElement from "./editable-element";
import ElementProperties from "./element-properties";
import ElementToolbar, { newElement } from "./element-toolbar";

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const MIN_SCALE = 0.3;
const MAX_SCALE = 2;
const HISTORY_LIMIT = 100;

// The freeform invoice editor: a scaled A4 sheet with draggable/resizable
// elements, an add-element toolbar, a property panel for the selection, undo/redo
// history, and Ctrl+scroll zoom / Shift+scroll pan on the canvas.
// Controlled: parent owns the elements array via value/onChange.
export default function TemplateEditor({
  value, onChange, data,
}: {
  value: TemplateElement[];
  onChange: (els: TemplateElement[]) => void;
  data: InvoiceData;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [scale, setScale] = useState(0.72);
  const stageRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Always-current view of the controlled value, so history callbacks and drag
  // handlers never read a stale closure.
  const valueRef = useRef(value);
  valueRef.current = value;

  // Undo/redo stacks of full snapshots. force() re-renders so the buttons'
  // disabled state tracks the stack lengths.
  const past = useRef<TemplateElement[][]>([]);
  const future = useRef<TemplateElement[][]>([]);
  const [, force] = useReducer((x) => x + 1, 0);
  const dragSnap = useRef<TemplateElement[] | null>(null);
  // Coalescing: consecutive edits sharing a tag within a short window fold into a
  // single undo step, so dragging a slider or typing a word is one undo, not many.
  const lastTag = useRef<{ tag: string; t: number } | null>(null);

  const selected = value.find((e) => e.id === selectedId) ?? null;

  // Apply an edit and record its pre-change snapshot for undo. Pass a `tag` to
  // fold rapid repeats of the same edit (same field) into one history entry.
  const commit = useCallback((next: TemplateElement[], tag?: string) => {
    const now = Date.now();
    const fold = !!tag && lastTag.current?.tag === tag && now - lastTag.current.t < 600;
    if (!fold) {
      past.current.push(valueRef.current);
      if (past.current.length > HISTORY_LIMIT) past.current.shift();
    }
    future.current = [];
    lastTag.current = tag ? { tag, t: now } : null;
    onChange(next);
    force();
  }, [onChange]);

  const undo = useCallback(() => {
    if (past.current.length === 0) return;
    lastTag.current = null;
    future.current.push(valueRef.current);
    onChange(past.current.pop()!);
    force();
  }, [onChange]);
  const redo = useCallback(() => {
    if (future.current.length === 0) return;
    lastTag.current = null;
    past.current.push(valueRef.current);
    onChange(future.current.pop()!);
    force();
  }, [onChange]);

  const add = (kind: ElementKind) => {
    const el = newElement(kind);
    commit([...valueRef.current, el]);
    setSelectedId(el.id);
  };
  // Live drag/resize: mutate without touching history (the snapshot was taken at
  // pointer-down; endDrag records it once at pointer-up).
  const setBox = (id: string, box: Pick<TemplateElement, "x" | "y" | "w" | "h">) =>
    onChange(valueRef.current.map((e) => (e.id === id ? { ...e, ...box } : e)));
  // Property-panel edit: tagged by element + field(s) so a slider drag or a burst
  // of typing collapses into one undo.
  const patch = (p: Partial<TemplateElement>) =>
    selectedId && commit(
      valueRef.current.map((e) => (e.id === selectedId ? { ...e, ...p } : e)),
      `prop:${selectedId}:${Object.keys(p).join(",")}`,
    );
  const del = () => {
    if (!selectedId) return;
    commit(valueRef.current.filter((e) => e.id !== selectedId));
    setSelectedId(null);
  };

  const beginDrag = () => { dragSnap.current = valueRef.current; };
  const endDrag = () => {
    const snap = dragSnap.current;
    dragSnap.current = null;
    if (!snap || snap === valueRef.current) return; // a click that moved nothing
    past.current.push(snap);
    if (past.current.length > HISTORY_LIMIT) past.current.shift();
    future.current = [];
    lastTag.current = null;
    force();
  };

  // Keyboard: undo/redo, arrow-nudge, Delete. Undo/redo pass through to the
  // browser while typing in a field (so text edits undo natively).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const typing = tag === "INPUT" || tag === "TEXTAREA";
      const meta = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (meta && key === "z") {
        if (typing) return;
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (meta && key === "y") {
        if (typing) return;
        e.preventDefault();
        redo();
        return;
      }
      if (!selectedId || typing) return;
      const cur = valueRef.current.find((x) => x.id === selectedId);
      if (!cur) return;
      const step = e.shiftKey ? 10 : 1;
      if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); del(); return; }
      const nudge: Record<string, [number, number]> = {
        ArrowUp: [0, -step], ArrowDown: [0, step], ArrowLeft: [-step, 0], ArrowRight: [step, 0],
      };
      if (nudge[e.key]) {
        e.preventDefault();
        const [dx, dy] = nudge[e.key];
        commit(
          valueRef.current.map((el) => (el.id === selectedId ? { ...el, x: el.x + dx, y: el.y + dy } : el)),
          `nudge:${selectedId}`,
        );
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, undo, redo, commit]);

  // Ctrl/Cmd+scroll zooms the canvas; Shift+scroll pans horizontally. Registered
  // natively (non-passive) so preventDefault can stop the browser's page zoom.
  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        setScale((s) => Math.round(clamp(s - e.deltaY * 0.0015, MIN_SCALE, MAX_SCALE) * 100) / 100);
      } else if (e.shiftKey) {
        e.preventDefault();
        node.scrollLeft += e.deltaY || e.deltaX;
      }
    };
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, []);

  const canUndo = past.current.length > 0;
  const canRedo = future.current.length > 0;

  return (
    <div className="flex flex-col gap-3 lg:flex-row">
      {/* Canvas + toolbar */}
      <div className="min-w-0 flex-1">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ElementToolbar onAdd={add} />
            <div className="flex items-center gap-1 border-l border-line pl-2">
              <Tooltip title="Undo (Ctrl+Z)">
                <button
                  type="button" onClick={undo} disabled={!canUndo} aria-label="Undo"
                  className="flex h-7 w-7 items-center justify-center rounded-lg border border-line bg-surface text-fg-muted transition-colors enabled:cursor-pointer enabled:hover:border-brand enabled:hover:text-brand disabled:opacity-40"
                >
                  <Undo2 className="h-4 w-4" />
                </button>
              </Tooltip>
              <Tooltip title="Redo (Ctrl+Y)">
                <button
                  type="button" onClick={redo} disabled={!canRedo} aria-label="Redo"
                  className="flex h-7 w-7 items-center justify-center rounded-lg border border-line bg-surface text-fg-muted transition-colors enabled:cursor-pointer enabled:hover:border-brand enabled:hover:text-brand disabled:opacity-40"
                >
                  <Redo2 className="h-4 w-4" />
                </button>
              </Tooltip>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-fg-subtle">Zoom</span>
            <Slider
              className="w-24" min={MIN_SCALE} max={MAX_SCALE} step={0.02} value={scale}
              tooltip={{ formatter: (v) => `${Math.round((v ?? 0) * 100)}%` }}
              onChange={setScale}
            />
            <span className="w-9 text-right text-xs tabular text-fg-subtle">{Math.round(scale * 100)}%</span>
          </div>
        </div>
        <div
          ref={scrollRef}
          className="max-h-[64vh] overflow-auto rounded-xl border border-line bg-surface-sunken p-4"
          title="Ctrl+scroll to zoom · Shift+scroll to pan"
        >
          <div
            ref={stageRef}
            style={{ width: CANVAS_W * scale, height: CANVAS_H * scale, position: "relative" }}
            className="mx-auto shadow-lg"
            onPointerDown={(e) => { if (e.target === stageRef.current) setSelectedId(null); }}
          >
            <div
              style={{
                width: CANVAS_W, height: CANVAS_H, background: "#fff", position: "absolute",
                left: 0, top: 0, transform: `scale(${scale})`, transformOrigin: "top left",
                fontFamily: "'Fira Sans', system-ui, sans-serif",
              }}
            >
              {value.map((el) => (
                <EditableElement
                  key={el.id} el={el} data={data} scale={scale}
                  selected={el.id === selectedId}
                  onSelect={setSelectedId} onChange={setBox}
                  onDragStart={beginDrag} onCommit={endDrag}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Property panel */}
      <div className="w-full shrink-0 rounded-xl border border-line bg-surface-raised p-3 lg:w-72">
        <ElementProperties el={selected} onChange={patch} onDelete={del} />
      </div>
    </div>
  );
}
