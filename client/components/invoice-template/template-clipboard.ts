"use client";
import api from "@/services/api";
import { CANVAS_W, CANVAS_H, type ElementKind, type TemplateElement } from "./types";

// Copy and paste for the template editor, through the SYSTEM clipboard as plain
// text. That is what lets a layout travel between two different sites: copy on
// localhost, paste into the production editor (or the other way round), or
// into another template on the same site. Nothing is stored on either server.
//
// The one thing that does not travel by value is a Photo element's picture:
// its `/uploads/img/:id` URL means a different picture (or nothing) on another
// site. So the picture's bytes ride along as a data URL, and a paste on a
// different origin uploads them again and points the element at the new copy.

const TYPE = "chomnenh/invoice-template-elements";
const VERSION = 1;
const KINDS: ElementKind[] = ["text", "field", "logo", "photo", "qr", "items", "totals", "line"];

export interface ClipPayload {
  type: typeof TYPE;
  v: number;
  origin: string;
  // True when the copy was the WHOLE sheet (Ctrl+A, Ctrl+C). Pasting it over a
  // whole-sheet selection replaces the layout instead of stacking a second one.
  whole: boolean;
  elements: TemplateElement[];
  // imageUrl -> data URL, for the Photo elements in `elements`.
  images: Record<string, string>;
}

// Pictures already read, so the copy (which must write synchronously inside the
// browser's copy event) usually has them to hand. The editor warms this as soon
// as a Photo element shows up.
const imageCache = new Map<string, string>();

const isLocalUrl = (u: string) => u.startsWith("/");

async function toDataUrl(url: string): Promise<string | null> {
  if (imageCache.has(url)) return imageCache.get(url)!;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    const data = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
    imageCache.set(url, data);
    return data;
  } catch {
    return null;
  }
}

const photoUrls = (els: TemplateElement[]) =>
  [...new Set(els.flatMap((e) => (e.kind === "photo" && e.imageUrl && isLocalUrl(e.imageUrl) ? [e.imageUrl] : [])))];

export function warmImages(els: TemplateElement[]) {
  for (const u of photoUrls(els)) if (!imageCache.has(u)) void toDataUrl(u);
}

function build(els: TemplateElement[], whole: boolean, images: Record<string, string>): string {
  const payload: ClipPayload = {
    type: TYPE,
    v: VERSION,
    origin: window.location.origin,
    whole,
    elements: els,
    images,
  };
  return JSON.stringify(payload);
}

// Synchronous: returns null when a picture is not read yet (the caller then
// falls back to serializeAsync + navigator.clipboard).
export function serializeSync(els: TemplateElement[], whole: boolean): string | null {
  const images: Record<string, string> = {};
  for (const u of photoUrls(els)) {
    const d = imageCache.get(u);
    if (!d) return null;
    images[u] = d;
  }
  return build(els, whole, images);
}

export async function serializeAsync(els: TemplateElement[], whole: boolean): Promise<string> {
  const images: Record<string, string> = {};
  for (const u of photoUrls(els)) {
    const d = await toDataUrl(u);
    if (d) images[u] = d;
  }
  return build(els, whole, images);
}

const num = (v: unknown) => typeof v === "number" && Number.isFinite(v);

// Reads clipboard text back. Anything that is not our payload returns null, so
// a paste of ordinary text is simply not ours to handle.
export function parse(text: string): ClipPayload | null {
  if (!text || !text.includes(TYPE)) return null;
  try {
    const p = JSON.parse(text) as ClipPayload;
    if (p?.type !== TYPE || typeof p.v !== "number" || p.v > VERSION) return null;
    if (!Array.isArray(p.elements)) return null;
    const elements = p.elements.filter(
      (e) =>
        e && typeof e === "object" && KINDS.includes(e.kind) &&
        num(e.x) && num(e.y) && num(e.w) && num(e.h),
    );
    if (elements.length === 0) return null;
    return {
      ...p,
      whole: !!p.whole,
      elements,
      images: p.images && typeof p.images === "object" ? p.images : {},
    };
  } catch {
    return null;
  }
}

let seq = 0;
const freshId = () => `e${Date.now()}${(seq++ % 1000).toString().padStart(3, "0")}${Math.floor(Math.random() * 100)}`;

async function reupload(dataUrl: string): Promise<string | null> {
  try {
    const blob = await (await fetch(dataUrl)).blob();
    const ext = blob.type.split("/")[1] || "png";
    const fd = new FormData();
    fd.append("image", new File([blob], `pasted.${ext}`, { type: blob.type }));
    const { data } = await api.post<{ url: string }>("/invoice-templates/image", fd);
    imageCache.set(data.url, dataUrl);
    return data.url;
  } catch {
    return null;
  }
}

// Turns a payload into elements ready for this sheet: new ids (so a paste never
// collides with what is already there) and pictures that exist on THIS site.
// Returns how many pictures could not be brought across.
export async function materialize(
  p: ClipPayload,
): Promise<{ elements: TemplateElement[]; lostImages: number }> {
  const sameSite = p.origin === window.location.origin;
  const moved = new Map<string, string | null>();
  if (!sameSite) {
    for (const [url, data] of Object.entries(p.images)) {
      moved.set(url, await reupload(data));
    }
  }
  let lostImages = 0;
  const elements = p.elements.map((src) => {
    const el: TemplateElement = JSON.parse(JSON.stringify(src));
    el.id = freshId();
    if (el.kind === "photo" && el.imageUrl && !sameSite && isLocalUrl(el.imageUrl)) {
      const url = moved.get(el.imageUrl);
      if (url) el.imageUrl = url;
      else {
        delete el.imageUrl;
        lostImages++;
      }
    }
    return el;
  });
  return { elements, lostImages };
}

// Where a paste lands. Across templates it keeps the exact coordinates, which is
// the point. Pasting back onto the sheet it was copied from would land exactly
// on top of the originals and look like nothing happened, so in that case the
// copy steps down-right until it is visibly separate.
export function placeOnSheet(
  pasted: TemplateElement[],
  existing: TemplateElement[],
): TemplateElement[] {
  const sits = (dx: number) =>
    pasted.every((p) =>
      existing.some(
        (e) => e.kind === p.kind && e.x === p.x + dx && e.y === p.y + dx && e.w === p.w && e.h === p.h,
      ),
    );
  let d = 0;
  while (d < 16 * 20 && sits(d)) d += 16;
  if (d === 0) return pasted;
  const maxX = CANVAS_W, maxY = CANVAS_H;
  return pasted.map((e) => ({
    ...e,
    x: Math.min(e.x + d, maxX - 20),
    y: Math.min(e.y + d, maxY - 20),
  }));
}
