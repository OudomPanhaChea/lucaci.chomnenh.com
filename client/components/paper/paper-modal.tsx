"use client";
import { useEffect, useRef, useState } from "react";
import { Modal } from "antd";
import { Button } from "@/components/ui/button";
import { ImageDown } from "lucide-react";
import { toast } from "react-toastify";
import api from "@/services/api";
import type { Settings } from "@/lib/types";

// Settings are needed on every paper (logo, business name, footer); fetched
// once, the first time a paper is opened.
export function usePaperSettings(active: boolean) {
  const [settings, setSettings] = useState<Settings | null>(null);
  useEffect(() => {
    if (!active || settings) return;
    api.get("/settings").then(({ data }) => setSettings(data)).catch(() => {});
  }, [active, settings]);
  return settings;
}

// Preview + download of an A4 paper. Each sheet ([data-paper-page] node,
// papers may paginate onto several) is rendered to its own JPG with
// html-to-image (foreignObject rendering, so Tailwind 4's oklch colors and
// the self-hosted fonts survive; html2canvas chokes on both). Multi-page
// papers download as name-p1.jpg, name-p2.jpg, ...
export default function PaperModal({
  open,
  title,
  filename,
  onClose,
  canDownload = true,
  children,
}: {
  open: boolean;
  title: string;
  filename: string;
  onClose: () => void;
  canDownload?: boolean;
  children: React.ReactNode;
}) {
  const paperRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);

  const download = async () => {
    if (!paperRef.current) return;
    setDownloading(true);
    try {
      const { toJpeg } = await import("html-to-image");
      const sheets = paperRef.current.querySelectorAll<HTMLElement>("[data-paper-page]");
      const targets = sheets.length > 0 ? Array.from(sheets) : [paperRef.current];
      for (let i = 0; i < targets.length; i++) {
        const dataUrl = await toJpeg(targets[i], {
          quality: 0.92,
          pixelRatio: 2,
          backgroundColor: "#ffffff",
        });
        const a = document.createElement("a");
        a.download =
          targets.length > 1 ? filename.replace(/\.jpg$/i, `-p${i + 1}.jpg`) : filename;
        a.href = dataUrl;
        a.click();
      }
      if (targets.length > 1) {
        toast.success(`Downloaded ${targets.length} pages`);
      }
    } catch {
      toast.error("Could not create the image, please try again");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      centered
      className="w-fit!"
      title={title}
      footer={
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Close</Button>
          <Button
            type="primary"
            icon={<ImageDown className="h-4 w-4" />}
            loading={downloading}
            disabled={!canDownload}
            onClick={download}
          >
            Download JPG
          </Button>
        </div>
      }
    >
      <div className="overflow-auto rounded-lg border border-line bg-surface-sunken p-3">
        {/* relative: the papers' hidden measuring pass anchors to this box */}
        <div ref={paperRef} className="relative mx-auto w-fit space-y-4">
          {children}
        </div>
      </div>
    </Modal>
  );
}
