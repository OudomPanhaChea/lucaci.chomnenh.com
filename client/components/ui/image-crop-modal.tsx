"use client";
import { useEffect, useState } from "react";
import { Modal, Segmented, Slider } from "antd";
import Cropper from "react-easy-crop";
import type { Area } from "react-easy-crop";
import { RotateCcw, RotateCw, ZoomIn, ZoomOut } from "lucide-react";
import { toast } from "react-toastify";
import { Button } from "@/components/ui/button";

const ASPECT_PRESETS = [
  { label: "1:1", value: 1 },
  { label: "4:3", value: 4 / 3 },
  { label: "3:2", value: 3 / 2 },
  { label: "16:9", value: 16 / 9 },
  { label: "3:1", value: 3 },
];

// Server rejects >5MB; also nothing in the app renders larger than this
const MAX_OUTPUT_SIDE = 2048;

type Props = {
  open: boolean;
  /** Object URL or same-origin image URL to edit. */
  src: string | null;
  title?: string;
  aspect?: number;
  /** Offer ratio presets instead of one fixed aspect (free-form images). */
  aspectSlider?: boolean;
  cropShape?: "rect" | "round";
  /** Name + preferred type for the produced File. */
  fileName?: string;
  fileType?: string;
  onCancel: () => void;
  onApply: (file: File) => void;
};

/** Crop/zoom/rotate editor used by ImageDropzone for new picks and for
    re-editing already saved images. Exports through a canvas, capped at
    2048px on the long side, as JPEG (or PNG when the source was PNG). */
export function ImageCropModal({
  open,
  src,
  title = "Edit image",
  aspect = 1,
  aspectSlider = false,
  cropShape = "rect",
  fileName = "image",
  fileType = "image/jpeg",
  onCancel,
  onApply,
}: Props) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [aspectVal, setAspectVal] = useState(aspect);
  const [areaPixels, setAreaPixels] = useState<Area | null>(null);
  const [processing, setProcessing] = useState(false);

  // Fresh editor state every time it opens (or opens for another image)
  useEffect(() => {
    if (open) {
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setRotation(0);
      setAspectVal(aspect);
      setAreaPixels(null);
    }
  }, [open, src, aspect]);

  const reset = () => {
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setRotation(0);
  };

  const apply = async () => {
    if (!src || !areaPixels) return;
    setProcessing(true);
    try {
      const file = await cropImageToFile(src, areaPixels, rotation, fileType, fileName);
      onApply(file);
    } catch {
      toast.error("Could not process the image");
    } finally {
      setProcessing(false);
    }
  };

  return (
    <Modal
      open={open}
      onCancel={onCancel}
      title={title}
      centered
      width={560}
      destroyOnHidden
      footer={
        <div className="flex items-center justify-between">
          <Button type="text" icon={<RotateCcw className="h-4 w-4" />} onClick={reset}>
            Reset
          </Button>
          <div className="flex gap-2">
            <Button onClick={onCancel}>Cancel</Button>
            <Button type="primary" loading={processing} onClick={apply}>
              Apply
            </Button>
          </div>
        </div>
      }
    >
      {/* Editor canvas: dark checkerboard so edges and transparency read clearly */}
      <div className="relative h-80 overflow-hidden rounded-xl border border-line bg-[repeating-conic-gradient(#16222f_0%_25%,#0d1722_0%_50%)] bg-[length:16px_16px]">
        {src && (
          <Cropper
            image={src}
            crop={crop}
            zoom={zoom}
            rotation={rotation}
            aspect={aspectVal}
            cropShape={cropShape}
            showGrid={cropShape !== "round"}
            minZoom={1}
            maxZoom={4}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onRotationChange={setRotation}
            onCropComplete={(_, px) => setAreaPixels(px)}
          />
        )}
      </div>

      <div className="mt-3 space-y-2.5 rounded-xl bg-surface-sunken p-3.5">
        {aspectSlider && (
          <div className="flex items-center gap-3">
            <span className="w-16 shrink-0 text-xs font-medium text-fg-muted">Ratio</span>
            <Segmented
              block
              size="small"
              className="flex-1"
              value={aspectVal}
              onChange={(v) => setAspectVal(v as number)}
              options={ASPECT_PRESETS}
            />
          </div>
        )}
        <div className="flex items-center gap-3">
          <span className="w-16 shrink-0 text-xs font-medium text-fg-muted">Zoom</span>
          <ZoomOut className="h-4 w-4 shrink-0 text-fg-subtle" />
          <Slider className="!m-0 flex-1" min={1} max={4} step={0.01} value={zoom}
            onChange={setZoom} tooltip={{ open: false }} />
          <ZoomIn className="h-4 w-4 shrink-0 text-fg-subtle" />
          <span className="tabular w-9 shrink-0 text-right text-xs text-fg-muted">
            {zoom.toFixed(1)}×
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="w-16 shrink-0 text-xs font-medium text-fg-muted">Straighten</span>
          <Slider className="!m-0 flex-1" min={-180} max={180} step={1} value={rotation}
            onChange={setRotation} tooltip={{ open: false }} />
          <button
            type="button"
            title="Rotate 90°"
            aria-label="Rotate 90 degrees"
            onClick={() => setRotation((r) => ((r + 90 + 180) % 360) - 180)}
            className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-fg-muted transition-colors duration-200 hover:bg-surface-raised hover:text-fg"
          >
            <RotateCw className="h-4 w-4" />
          </button>
          <span className="tabular w-9 shrink-0 text-right text-xs text-fg-muted">{rotation}°</span>
        </div>
      </div>
    </Modal>
  );
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Image failed to load"));
    img.src = src;
  });
}

async function cropImageToFile(
  src: string,
  area: Area,
  rotation: number,
  type: string,
  name: string
): Promise<File> {
  const image = await loadImage(src);
  const rad = (rotation * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));

  // Draw the rotated image on a canvas big enough for its bounding box,
  // then cut the selected area out of it
  const rotated = document.createElement("canvas");
  rotated.width = Math.round(image.width * cos + image.height * sin);
  rotated.height = Math.round(image.width * sin + image.height * cos);
  const rctx = rotated.getContext("2d");
  if (!rctx) throw new Error("Canvas unavailable");
  rctx.translate(rotated.width / 2, rotated.height / 2);
  rctx.rotate(rad);
  rctx.translate(-image.width / 2, -image.height / 2);
  rctx.drawImage(image, 0, 0);

  const scale = Math.min(1, MAX_OUTPUT_SIDE / Math.max(area.width, area.height));
  const out = document.createElement("canvas");
  out.width = Math.max(1, Math.round(area.width * scale));
  out.height = Math.max(1, Math.round(area.height * scale));
  const octx = out.getContext("2d");
  if (!octx) throw new Error("Canvas unavailable");
  octx.drawImage(rotated, area.x, area.y, area.width, area.height, 0, 0, out.width, out.height);

  const mime = type === "image/png" ? "image/png" : "image/jpeg";
  const blob = await new Promise<Blob | null>((resolve) => out.toBlob(resolve, mime, 0.9));
  if (!blob) throw new Error("Could not encode image");
  const base = name.replace(/\.[a-z0-9]+$/i, "") || "image";
  return new File([blob], `${base}${mime === "image/png" ? ".png" : ".jpg"}`, { type: mime });
}
