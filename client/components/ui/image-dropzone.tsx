"use client";
import { useRef, useState } from "react";
import type { DragEvent, ReactNode, Ref } from "react";
import { useImperativeHandle } from "react";
import { Popconfirm } from "antd";
import { ImagePlus, PencilLine, Trash2, UploadCloud } from "lucide-react";
import { toast } from "react-toastify";
import { Spinner } from "@/components/ui/spinner";
import { ImageCropModal } from "@/components/ui/image-crop-modal";
import { validateImageFile } from "@/lib/images";

export type ImageDropzoneHandle = {
  /** Open the file browser (same as clicking the frame). */
  browse: () => void;
  /** Open the crop editor on the current image. */
  editCurrent: () => void;
};

type EditorState = { src: string; type: string; name: string };

type Props = {
  /** Current image URL (server URL or object URL). Null/undefined = empty state. */
  value?: string | null;
  /** Receives the cropped File (from a new pick or from editing the current image). */
  onSelect: (file: File) => void | Promise<void>;
  /** Shows a remove action when provided. */
  onRemove?: () => void | Promise<void>;
  removeConfirm?: string;
  aspect?: number;
  cropShape?: "rect" | "round";
  /** Offer crop ratio presets in the editor (free-form images). */
  aspectSlider?: boolean;
  cropTitle?: string;
  busy?: boolean;
  disabled?: boolean;
  /** Sizes the drop area, e.g. "h-40 w-full", "h-28 w-28", "aspect-[3/1] w-full". */
  className?: string;
  rounded?: string;
  fit?: "cover" | "contain";
  label?: string;
  hint?: string;
  /** Text on the hover overlay of a filled preview. Empty string = icon only (small tiles). */
  overlayLabel?: string;
  /** Custom empty-state content (e.g. avatar initial). Position it absolute inset-0. */
  placeholder?: ReactNode;
  /** Hide the corner Edit/Remove buttons (round avatars clip them; use the ref instead). */
  cornerActions?: boolean;
  ref?: Ref<ImageDropzoneHandle>;
};

/** Drag-and-drop image uploader. Every image, new or already saved, goes
    through the crop/zoom/rotate editor (ImageCropModal) before onSelect.
    Empty: dashed drop target. Filled: preview with Edit + Remove corner
    actions; click or drop replaces. */
export function ImageDropzone({
  value,
  onSelect,
  onRemove,
  removeConfirm = "Remove this image?",
  aspect = 1,
  cropShape = "rect",
  aspectSlider = false,
  cropTitle = "Edit image",
  busy = false,
  disabled = false,
  className = "",
  rounded = "rounded-xl",
  fit = "cover",
  label = "Drop an image, or click to browse",
  hint,
  overlayLabel = "Replace image",
  placeholder,
  cornerActions = true,
  ref,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const [dragOver, setDragOver] = useState(false);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const filled = !!value;
  const inactive = disabled || busy;

  const openEditor = (src: string, type: string, name: string) =>
    setEditor({ src, type, name });

  const closeEditor = () => {
    if (editor?.src.startsWith("blob:")) URL.revokeObjectURL(editor.src);
    setEditor(null);
  };

  const pick = (file: File) => {
    if (!validateImageFile(file)) return;
    openEditor(URL.createObjectURL(file), file.type, file.name);
  };

  const browse = () => {
    if (!inactive) inputRef.current?.click();
  };

  const editCurrent = async () => {
    if (!value || inactive) return;
    try {
      const res = await fetch(value);
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const name = value.startsWith("blob:") ? "image" : (value.split("/").pop() || "image");
      openEditor(URL.createObjectURL(blob), blob.type || "image/jpeg", name);
    } catch {
      toast.error("Could not load the image to edit");
    }
  };

  useImperativeHandle(ref, () => ({ browse, editCurrent }));

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    dragDepth.current = 0;
    setDragOver(false);
    if (inactive) return;
    const file = e.dataTransfer.files?.[0];
    if (file) pick(file);
  };

  const showHoverOverlay = filled || placeholder;

  return (
    <>
      <div
        role="button"
        tabIndex={inactive ? -1 : 0}
        aria-label={filled ? "Replace image" : "Upload image"}
        onClick={browse}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            browse();
          }
        }}
        onDragEnter={(e) => {
          e.preventDefault();
          dragDepth.current += 1;
          if (!inactive) setDragOver(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = inactive ? "none" : "copy";
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          dragDepth.current = Math.max(0, dragDepth.current - 1);
          if (dragDepth.current === 0) setDragOver(false);
        }}
        onDrop={onDrop}
        className={`group relative select-none overflow-hidden border outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-surface ${rounded} ${className} ${
          dragOver
            ? "border-solid border-brand bg-brand-soft"
            : filled || placeholder
              ? "border-line bg-surface-sunken"
              : "border-dashed border-line-strong hover:border-brand"
        } ${inactive ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
      >
        {filled ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={value!}
            alt=""
            className={`absolute inset-0 h-full w-full transition-[transform,opacity] duration-300 ${fit === "cover" ? "object-cover" : "object-contain"} ${dragOver ? "scale-[1.03] opacity-40" : "group-hover:scale-[1.03]"}`}
          />
        ) : placeholder ? (
          placeholder
        ) : (
          <>
            {/* Faint dot grid so the empty target reads as a canvas, not a hole */}
            <div
              aria-hidden
              className="absolute inset-0 bg-[radial-gradient(var(--line)_1px,transparent_1px)] [background-size:12px_12px] [background-position:center]"
            />
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 p-3 text-center">
              <span
                className={`flex h-9 w-9 items-center justify-center rounded-full transition-all duration-200 ${
                  dragOver
                    ? "scale-110 bg-brand text-brand-foreground"
                    : "bg-brand-soft text-brand-soft-foreground group-hover:-translate-y-0.5 group-hover:bg-brand group-hover:text-brand-foreground"
                }`}
              >
                <UploadCloud className="h-4.5 w-4.5" />
              </span>
              <p className="text-xs font-medium text-fg-muted">
                {dragOver ? "Drop to add" : label}
              </p>
              {hint && <p className="text-[11px] leading-snug text-fg-subtle">{hint}</p>}
            </div>
          </>
        )}

        {/* Hover / drag-over hint on an existing image */}
        {showHoverOverlay && !inactive && (
          <div
            className={`pointer-events-none absolute inset-0 flex items-center justify-center bg-ink/55 transition-opacity duration-200 ${dragOver ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
          >
            {overlayLabel ? (
              <span className="flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-sm">
                <ImagePlus className="h-3.5 w-3.5" />
                {dragOver ? "Drop to replace" : overlayLabel}
              </span>
            ) : (
              <ImagePlus className="h-5 w-5 text-white" />
            )}
          </div>
        )}

        {busy && (
          <div className="absolute inset-0 flex items-center justify-center bg-surface/70 backdrop-blur-[2px]">
            <Spinner />
          </div>
        )}

        {filled && cornerActions && !inactive && (
          <div className="absolute right-1.5 top-1.5 flex gap-1">
            <button
              type="button"
              aria-label="Edit image"
              title="Crop or rotate"
              onClick={(e) => {
                e.stopPropagation();
                editCurrent();
              }}
              className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full bg-black/50 text-white shadow-sm backdrop-blur-sm transition-colors duration-200 hover:bg-black/75"
            >
              <PencilLine className="h-3.5 w-3.5" />
            </button>
            {onRemove && (
              <span onClick={(e) => e.stopPropagation()}>
                <Popconfirm title={removeConfirm} onConfirm={() => onRemove()}>
                  <button
                    type="button"
                    aria-label="Remove image"
                    className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full bg-black/50 text-white shadow-sm backdrop-blur-sm transition-colors duration-200 hover:bg-rose-600"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </Popconfirm>
              </span>
            )}
          </div>
        )}
      </div>

      {/* Inline display:none because antd's Form styles force
          input[type="file"] to display:block, beating the .hidden class */}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) pick(file);
        }}
      />

      <ImageCropModal
        open={!!editor}
        src={editor?.src ?? null}
        title={cropTitle}
        aspect={aspect}
        aspectSlider={aspectSlider}
        cropShape={cropShape}
        fileName={editor?.name}
        fileType={editor?.type}
        onCancel={closeEditor}
        onApply={(file) => {
          closeEditor();
          void onSelect(file);
        }}
      />
    </>
  );
}
