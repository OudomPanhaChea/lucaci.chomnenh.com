"use client";
import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { Slider, Tooltip } from "antd";
import { Undo2, Redo2, Minus, Plus, Copy, ClipboardPaste } from "lucide-react";
import { toast } from "react-toastify";
import { useT, t as tNow } from "@/lib/i18n";
import {
  CANVAS_W,
  CANVAS_H,
  type ElementKind,
  type TemplateElement,
} from "./types";
import {
  DEFAULT_SAMPLE_PREVIEW,
  sampleInvoiceData,
  type InvoiceData,
  type SamplePreview,
} from "./bindings";
import type { Settings } from "@/lib/types";
import EditableElement from "./editable-element";
import ElementProperties from "./element-properties";
import ElementToolbar, { newElement } from "./element-toolbar";
import PreviewControls from "./preview-controls";
import GroupProperties from "./group-properties";
import { xRange, yRange } from "./use-drag-resize";
import {
  materialize,
  parse as parseClip,
  placeOnSheet,
  serializeAsync,
  serializeSync,
  warmImages,
} from "./template-clipboard";

const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));

// A rectangle on the canvas, in canvas coordinates.
type Rect = { x: number; y: number; w: number; h: number };
const rectOf = (ax: number, ay: number, bx: number, by: number): Rect => ({
  x: Math.min(ax, bx), y: Math.min(ay, by),
  w: Math.abs(bx - ax), h: Math.abs(by - ay),
});
// The marquee takes what it TOUCHES, not only what it fully encloses: on a
// sheet this dense, demanding full containment means lassoing around a
// full-width rule or items table is nearly impossible. A flat element (a
// divider, stored with h = 0) is given a sliver of height so it can be caught.
const touches = (el: TemplateElement, r: Rect) =>
  el.x < r.x + r.w && el.x + el.w > r.x &&
  el.y < r.y + r.h && el.y + Math.max(el.h, 2) > r.y;
const MIN_SCALE = 0.3;
const MAX_SCALE = 2;
const DEFAULT_SCALE = 0.72;
const HISTORY_LIMIT = 100;

// Toolbar icon button: neutral until it can act, brand-tinted on hover. One
// definition so undo/redo/zoom never drift apart in height or colour.
function IconButton({
  label,
  tip,
  disabled,
  onClick,
  children,
}: {
  label: string;
  tip?: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip title={tip ?? label}>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-fg-muted transition-colors enabled:cursor-pointer enabled:hover:bg-brand-soft enabled:hover:text-brand-soft-foreground disabled:opacity-35"
      >
        {children}
      </button>
    </Tooltip>
  );
}

// The freeform invoice editor: a scaled A4 sheet with draggable/resizable
// elements, an add-element toolbar, a property panel for the selection, undo/redo
// history, and Ctrl+scroll zoom / Shift+scroll pan on the canvas.
// Controlled: parent owns the elements array via value/onChange.
export default function TemplateEditor({
  value,
  onChange,
  data,
  previewSettings,
}: {
  value: TemplateElement[];
  onChange: (els: TemplateElement[]) => void;
  data: InvoiceData;
  // Set when the editor is designing a GLOBAL template, which has no invoice of
  // its own: the sheet then previews a sample the designer drives (see
  // preview-controls). Left undefined when customizing ONE real invoice, whose
  // own figures are the only honest preview.
  previewSettings?: Settings | null;
}) {
  // The selection is a LIST, not one id: ctrl+click and the right-drag marquee
  // both build groups, and a group drags, nudges and deletes as one. A lone
  // selection is just the one-member case, so there is no second code path.
  const { t } = useT();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [preview, setPreview] = useState<SamplePreview>({
    ...DEFAULT_SAMPLE_PREVIEW,
  });
  const [scale, setScale] = useState(DEFAULT_SCALE);
  // The rubber band, in canvas coordinates, while one is being dragged.
  const [band, setBand] = useState<Rect | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Always-current view of the controlled value, so history callbacks and drag
  // handlers never read a stale closure.
  const valueRef = useRef(value);
  valueRef.current = value;
  // Pointer handlers registered on `window` outlive the render that made them,
  // so they read the selection here rather than from a captured closure.
  const selRef = useRef(selectedIds);
  selRef.current = selectedIds;

  // Undo/redo stacks of full snapshots. force() re-renders so the buttons'
  // disabled state tracks the stack lengths.
  const past = useRef<TemplateElement[][]>([]);
  const future = useRef<TemplateElement[][]>([]);
  const [, force] = useReducer((x) => x + 1, 0);
  const dragSnap = useRef<TemplateElement[] | null>(null);
  // Coalescing: consecutive edits sharing a tag within a short window fold into a
  // single undo step, so dragging a slider or typing a word is one undo, not many.
  const lastTag = useRef<{ tag: string; t: number } | null>(null);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  // The property panel describes ONE element. With several selected there is no
  // single answer to "what font is this", so the group panel takes over.
  const selectedId = selectedIds.length === 1 ? selectedIds[0] : null;
  const selected = value.find((e) => e.id === selectedId) ?? null;

  // Everything on the sheet AND in the property panel reads this one object, so
  // changing a preview knob (or a line-item count) moves the totals in both at
  // the same time.
  const sampling = previewSettings !== undefined;
  const view = useMemo(
    () =>
      sampling ? sampleInvoiceData(previewSettings ?? null, preview) : data,
    [sampling, previewSettings, preview, data],
  );

  // Apply an edit and record its pre-change snapshot for undo. Pass a `tag` to
  // fold rapid repeats of the same edit (same field) into one history entry.
  const commit = useCallback(
    (next: TemplateElement[], tag?: string) => {
      const now = Date.now();
      const fold =
        !!tag && lastTag.current?.tag === tag && now - lastTag.current.t < 600;
      if (!fold) {
        past.current.push(valueRef.current);
        if (past.current.length > HISTORY_LIMIT) past.current.shift();
      }
      future.current = [];
      lastTag.current = tag ? { tag, t: now } : null;
      onChange(next);
      force();
    },
    [onChange],
  );

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
    setSelectedIds([el.id]);
  };

  // Pointer-down on an element. Ctrl/Cmd toggles it in or out of the selection;
  // a plain click on an element that is ALREADY part of a group keeps the group,
  // so the group can be dragged from any of its members. Collapsing that group
  // to the one element clicked happens at pointer-up instead, and only when the
  // click moved nothing (see endDrag).
  const selectElement = (id: string, additive: boolean) => {
    const cur = selRef.current;
    // Written through selRef as well as state: the drag that follows this
    // pointer-down reads the selection from the ref, and a fast flick must not
    // move whatever was selected a moment ago.
    const next = additive
      ? cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]
      : cur.includes(id) ? cur : [id];
    selRef.current = next;
    setSelectedIds(next);
    if (!additive) clickCandidate.current = id;
  };

  // Live resize: mutate without touching history (the snapshot was taken at
  // pointer-down; endDrag records it once at pointer-up).
  const setBox = (
    id: string,
    box: Pick<TemplateElement, "x" | "y" | "w" | "h">,
  ) =>
    onChange(valueRef.current.map((e) => (e.id === id ? { ...e, ...box } : e)));

  // Live drag. Every selected element moves by the SAME delta, measured from
  // the snapshot taken at pointer-down, so the group holds its shape. The delta
  // is clamped once against the whole selection rather than per element, which
  // would shear the group apart as its leading member hit an edge.
  const dragSelection = (dx: number, dy: number) => {
    const base = dragSnap.current ?? valueRef.current;
    const ids = selRef.current;
    if (ids.length === 0) return;
    let loX = -Infinity, hiX = Infinity, loY = -Infinity, hiY = Infinity;
    for (const id of ids) {
      const b = base.find((e) => e.id === id);
      if (!b) continue;
      const [xl, xh] = xRange(b.w);
      const [yl, yh] = yRange(b.h);
      loX = Math.max(loX, xl - b.x); hiX = Math.min(hiX, xh - b.x);
      loY = Math.max(loY, yl - b.y); hiY = Math.min(hiY, yh - b.y);
    }
    const ddx = Math.round(clamp(dx, loX, hiX));
    const ddy = Math.round(clamp(dy, loY, hiY));
    onChange(
      valueRef.current.map((e) => {
        if (!ids.includes(e.id)) return e;
        const b = base.find((x) => x.id === e.id);
        return b ? { ...e, x: b.x + ddx, y: b.y + ddy } : e;
      }),
    );
  };
  // Property-panel edit: tagged by element + field(s) so a slider drag or a burst
  // of typing collapses into one undo.
  const patch = (p: Partial<TemplateElement>) =>
    selectedId &&
    commit(
      valueRef.current.map((e) => (e.id === selectedId ? { ...e, ...p } : e)),
      `prop:${selectedId}:${Object.keys(p).join(",")}`,
    );
  // Deletes the whole selection: one undo step whether it holds one element or
  // eight, because that is what the user did.
  const del = () => {
    const ids = selRef.current;
    if (ids.length === 0) return;
    commit(valueRef.current.filter((e) => !ids.includes(e.id)));
    setSelectedIds([]);
  };

  // ---- Copy / paste -------------------------------------------------------
  // Through the system clipboard, so a layout copied on one site (localhost)
  // pastes into another (production), or into another template. See
  // template-clipboard.ts for what travels and how pictures come across.
  useEffect(() => {
    warmImages(value);
  }, [value]);

  // One clipboard toast at a time, always showing the latest message (a bare
  // toastId would suppress the new message and leave the old one up).
  const clipToast = (
    type: "success" | "info",
    msg: string,
    autoClose = 3500,
  ) => {
    const id = "tpl-clip";
    if (toast.isActive(id)) toast.update(id, { render: msg, type, autoClose });
    else toast[type](msg, { toastId: id, autoClose });
  };

  const copiedElements = () => {
    const ids = selRef.current;
    const els = valueRef.current.filter((e) => ids.includes(e.id));
    const whole = els.length > 0 && els.length === valueRef.current.length;
    return { els, whole };
  };
  const copiedToast = (n: number, whole: boolean, cut = false) =>
    clipToast(
      "success",
      cut ? tNow("Cut {n}", { n }) : tNow("Copied {n}", { n }),
    );

  // Button path (no copy event to write into): the async Clipboard API.
  const copyToClipboard = async (cut = false) => {
    const { els, whole } = copiedElements();
    if (els.length === 0) return;
    try {
      await navigator.clipboard.writeText(await serializeAsync(els, whole));
      copiedToast(els.length, whole, cut);
      if (cut) del();
    } catch {
      toast.error(tNow("Clipboard blocked. Use Ctrl+C."));
    }
  };

  const pasting = useRef(false);
  const pasteText = async (text: string) => {
    const payload = parseClip(text);
    if (!payload) {
      clipToast("info", tNow("Nothing to paste"));
      return;
    }
    if (pasting.current) return;
    pasting.current = true;
    const crossSite = payload.origin !== window.location.origin;
    const hasPictures = Object.keys(payload.images).length > 0;
    const busy = crossSite && hasPictures ? toast.loading(tNow("Copying pictures…")) : null;
    try {
      const { elements, lostImages } = await materialize(payload);
      const cur = valueRef.current;
      const sel = selRef.current;
      // A whole layout pasted over a whole-sheet selection (Ctrl+A, Ctrl+V)
      // REPLACES the layout, which is what "paste the same layout here" means.
      // Anywhere else a paste adds, and one Ctrl+Z takes it back either way.
      const replace =
        payload.whole && cur.length > 0 && sel.length === cur.length;
      const placed = replace || cur.length === 0 ? elements : placeOnSheet(elements, cur);
      commit(replace ? placed : [...cur, ...placed]);
      const ids = placed.map((e) => e.id);
      selRef.current = ids;
      setSelectedIds(ids);
      const n = placed.length;
      const msg = replace ? tNow("Layout replaced. Ctrl+Z to undo.") : tNow("Pasted {n}", { n });
      if (busy) toast.dismiss(busy);
      clipToast("success", msg);
      if (lostImages > 0) {
        toast.warn(tNow("{n} pictures could not be copied. Upload them again.", { n: lostImages }), {
          autoClose: false,
        });
      }
    } finally {
      if (busy) toast.dismiss(busy);
      pasting.current = false;
    }
  };

  const pasteFromClipboard = async () => {
    let text = "";
    try {
      text = await navigator.clipboard.readText();
    } catch {
      clipToast("info", tNow("Clipboard blocked. Use Ctrl+V."));
      return;
    }
    await pasteText(text);
  };

  // Keyboard path: the browser's own copy/cut/paste events, which need no
  // permission prompt. They stand aside while a field has focus or text is
  // highlighted, so copying a caption out of an input still works normally.
  useEffect(() => {
    const busyTyping = (t: EventTarget | null) => {
      const el = t as HTMLElement | null;
      const tag = el?.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || !!el?.isContentEditable;
    };
    const hasTextSelection = () => (window.getSelection()?.toString() ?? "") !== "";
    const onCopy = (e: ClipboardEvent, cut: boolean) => {
      if (busyTyping(e.target) || hasTextSelection()) return;
      const { els, whole } = copiedElements();
      if (els.length === 0) return;
      e.preventDefault();
      const text = serializeSync(els, whole);
      if (text !== null && e.clipboardData) {
        e.clipboardData.setData("text/plain", text);
        copiedToast(els.length, whole, cut);
        if (cut) del();
      } else {
        // A picture is not read yet: finish the copy asynchronously.
        void copyToClipboard(cut);
      }
    };
    const copy = (e: ClipboardEvent) => onCopy(e, false);
    const cut = (e: ClipboardEvent) => onCopy(e, true);
    const paste = (e: ClipboardEvent) => {
      if (busyTyping(e.target)) return;
      const text = e.clipboardData?.getData("text/plain") ?? "";
      if (!text) return;
      e.preventDefault();
      void pasteText(text);
    };
    window.addEventListener("copy", copy);
    window.addEventListener("cut", cut);
    window.addEventListener("paste", paste);
    return () => {
      window.removeEventListener("copy", copy);
      window.removeEventListener("cut", cut);
      window.removeEventListener("paste", paste);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commit]);

  const beginDrag = () => {
    dragSnap.current = valueRef.current;
  };
  // Set at pointer-down by a plain click on an already-grouped element; read at
  // pointer-up to decide whether that click was a drag or a plain re-selection.
  const clickCandidate = useRef<string | null>(null);
  const endDrag = (id: string) => {
    const snap = dragSnap.current;
    const candidate = clickCandidate.current;
    dragSnap.current = null;
    clickCandidate.current = null;
    if (!snap || snap === valueRef.current) {
      // Nothing moved, so this was a click, not a drag. A plain click on one
      // member of a group means "just this one" — the group was kept at
      // pointer-down only so it could be dragged from any member.
      if (candidate === id && selRef.current.length > 1) setSelectedIds([id]);
      return;
    }
    past.current.push(snap);
    if (past.current.length > HISTORY_LIMIT) past.current.shift();
    future.current = [];
    lastTag.current = null;
    force();
  };

  // Right-drag anywhere on the sheet, or left-drag from empty space, sweeps a
  // marquee. Holding ctrl/cmd adds what it touches to the current selection
  // instead of replacing it. Registered on window so the drag survives the
  // pointer leaving the sheet, which is exactly when a lasso is widest.
  const startBand = (e: React.PointerEvent, additive: boolean) => {
    const node = sheetRef.current;
    if (!node) return;
    e.preventDefault();
    const rect = node.getBoundingClientRect();
    const at = (cx: number, cy: number) => [
      (cx - rect.left) / scale,
      (cy - rect.top) / scale,
    ] as const;
    const [ox, oy] = at(e.clientX, e.clientY);
    const base = additive ? selRef.current : [];
    if (!additive) {
      selRef.current = [];
      setSelectedIds([]); // a click on empty space clears
    }
    setBand({ x: ox, y: oy, w: 0, h: 0 });

    const move = (ev: PointerEvent) => {
      const [px, py] = at(ev.clientX, ev.clientY);
      const r = rectOf(ox, oy, px, py);
      setBand(r);
      const hit = valueRef.current.filter((el) => touches(el, r)).map((el) => el.id);
      const next = [...base, ...hit.filter((id) => !base.includes(id))];
      selRef.current = next;
      setSelectedIds(next);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setBand(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
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
      if (typing) return;
      // Ctrl+A takes the whole sheet, which is the fastest way to start a group
      // and then ctrl+click the few elements out of it that should not move.
      if (meta && key === "a") {
        e.preventDefault();
        setSelectedIds(valueRef.current.map((el) => el.id));
        return;
      }
      if (e.key === "Escape") {
        setSelectedIds([]);
        return;
      }
      const ids = selRef.current;
      if (ids.length === 0) return;
      const step = e.shiftKey ? 10 : 1;
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        del();
        return;
      }
      const nudge: Record<string, [number, number]> = {
        ArrowUp: [0, -step],
        ArrowDown: [0, step],
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
      };
      if (nudge[e.key]) {
        e.preventDefault();
        const [dx, dy] = nudge[e.key];
        // The whole selection moves together, and the tag folds a held arrow
        // key into one undo step rather than one per repeat.
        commit(
          valueRef.current.map((el) =>
            ids.includes(el.id) ? { ...el, x: el.x + dx, y: el.y + dy } : el,
          ),
          `nudge:${ids.join(",")}`,
        );
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [undo, redo, commit]);

  // Ctrl/Cmd+scroll zooms the canvas; Shift+scroll pans horizontally. Registered
  // natively (non-passive) so preventDefault can stop the browser's page zoom.
  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        setScale(
          (s) =>
            Math.round(
              clamp(s - e.deltaY * 0.0015, MIN_SCALE, MAX_SCALE) * 100,
            ) / 100,
        );
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
  const zoomBy = (d: number) =>
    setScale((s) => Math.round(clamp(s + d, MIN_SCALE, MAX_SCALE) * 100) / 100);

  return (
    <div className="flex flex-col gap-3">
      {/* One toolbar bar spanning the whole editor: what you can add on the
          left, how you look at it on the right. Keeping it out of the canvas
          column is what lets the sheet and the property panel line up. */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-line bg-surface-raised px-1.5 py-1">
        <ElementToolbar onAdd={add} />
        <span className="h-5 w-px bg-line" aria-hidden />
        <IconButton label={`${t("Undo")} (Ctrl+Z)`} disabled={!canUndo} onClick={undo}>
          <Undo2 className="h-4 w-4" />
        </IconButton>
        <IconButton label={`${t("Redo")} (Ctrl+Y)`} disabled={!canRedo} onClick={redo}>
          <Redo2 className="h-4 w-4" />
        </IconButton>
        <span className="h-5 w-px bg-line" aria-hidden />
        <IconButton
          label={`${t("Copy")} (Ctrl+C)`}
          disabled={selectedIds.length === 0}
          onClick={() => void copyToClipboard()}
        >
          <Copy className="h-4 w-4" />
        </IconButton>
        <IconButton
          label={`${t("Paste")} (Ctrl+V)`}
          onClick={() => void pasteFromClipboard()}
        >
          <ClipboardPaste className="h-4 w-4" />
        </IconButton>
        {sampling && (
          <>
            <span className="h-5 w-px bg-line" aria-hidden />
            <PreviewControls value={preview} onChange={setPreview} />
          </>
        )}
        <div className="ml-auto flex items-center gap-1 pl-2">
          <IconButton
            label={t("Zoom out")}
            disabled={scale <= MIN_SCALE}
            onClick={() => zoomBy(-0.1)}
          >
            <Minus className="h-4 w-4" />
          </IconButton>
          <Slider
            className="w-20"
            min={MIN_SCALE}
            max={MAX_SCALE}
            step={0.02}
            value={scale}
            tooltip={{ formatter: (v) => `${Math.round((v ?? 0) * 100)}%` }}
            onChange={setScale}
          />
          <IconButton
            label={t("Zoom in")}
            disabled={scale >= MAX_SCALE}
            onClick={() => zoomBy(0.1)}
          >
            <Plus className="h-4 w-4" />
          </IconButton>
          <Tooltip title={t("Reset zoom")}>
            <button
              type="button"
              onClick={() => setScale(DEFAULT_SCALE)}
              className="tabular h-8 w-11 shrink-0 cursor-pointer rounded-lg text-xs text-fg-muted transition-colors hover:bg-brand-soft hover:text-brand-soft-foreground"
            >
              {Math.round(scale * 100)}%
            </button>
          </Tooltip>
        </div>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row">
        {/* Canvas */}
        <div
          ref={scrollRef}
          className="max-h-[64vh] min-w-0 flex-1 overflow-auto rounded-xl border border-line bg-surface-sunken p-4"
        >
          <div
            ref={stageRef}
            style={{
              width: CANVAS_W * scale,
              height: CANVAS_H * scale,
              position: "relative",
            }}
            className="mx-auto shadow-lg"
            // The right button sweeps a selection marquee here, so its menu
            // would land on top of every lasso.
            onContextMenu={(e) => e.preventDefault()}
            onPointerDown={(e) => {
              const empty =
                e.target === sheetRef.current || e.target === stageRef.current;
              // A finger on empty canvas must still SCROLL the sheet, so touch
              // never lassos; it only clears the selection, the way tapping
              // away from a thing does everywhere else.
              if (e.pointerType === "touch") {
                if (empty) setSelectedIds([]);
                return;
              }
              // Right button: lasso from anywhere, including over an element
              // (which is why EditableElement lets button 2 bubble). Left
              // button: only from empty space, or a click meant for an element
              // would start a lasso instead of moving it.
              if (e.button === 2 || (e.button === 0 && empty)) {
                startBand(e, e.ctrlKey || e.metaKey);
              }
            }}
          >
            <div
              ref={sheetRef}
              style={{
                width: CANVAS_W,
                height: CANVAS_H,
                background: "#fff",
                position: "absolute",
                left: 0,
                top: 0,
                transform: `scale(${scale})`,
                transformOrigin: "top left",
                fontFamily: "'Fira Sans', system-ui, sans-serif",
              }}
            >
              {value.map((el) => (
                <EditableElement
                  key={el.id}
                  el={el}
                  data={view}
                  scale={scale}
                  selected={selectedSet.has(el.id)}
                  grouped={selectedIds.length > 1 && selectedSet.has(el.id)}
                  onSelect={selectElement}
                  onDrag={dragSelection}
                  onResize={setBox}
                  onDragStart={beginDrag}
                  onCommit={endDrag}
                />
              ))}
              {band && (
                <div
                  aria-hidden
                  style={{
                    position: "absolute",
                    left: band.x, top: band.y, width: band.w, height: band.h,
                    border: "1px solid #FFA040",
                    background: "rgba(255,160,64,0.12)",
                    pointerEvents: "none",
                  }}
                />
              )}
            </div>
          </div>
        </div>

        {/* Property panel, capped at the canvas height so a long list (the
            totals rows) scrolls here instead of pushing Save off the modal.
            Padding lives inside the panel's own sections, so its sticky header
            can span the full width. */}
        <div className="w-full shrink-0 overflow-y-auto rounded-xl border border-line bg-surface-raised lg:max-h-[64vh] lg:w-[21rem]">
          {selectedIds.length > 1 ? (
            <GroupProperties
              elements={value.filter((e) => selectedSet.has(e.id))}
              onClear={() => setSelectedIds([])}
              onDelete={del}
            />
          ) : (
            <ElementProperties
              el={selected}
              data={view}
              onChange={patch}
              onDelete={del}
            />
          )}
        </div>
      </div>
    </div>
  );
}
