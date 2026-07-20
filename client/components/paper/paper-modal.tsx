"use client";
import { useEffect, useRef, useState } from "react";
import { Modal } from "antd";
import { Button } from "@/components/ui/button";
import { ArrowDownToLine, ImageDown } from "lucide-react";
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
// papers download as name-p1.jpg, name-p2.jpg, ... or as one multi-page
// PDF (jsPDF, one A4 page per sheet).
export default function PaperModal({
  open,
  title,
  filename,
  onClose,
  canDownload = true,
  toolbar,
  children,
}: {
  open: boolean;
  title: string;
  filename: string;
  onClose: () => void;
  canDownload?: boolean;
  toolbar?: React.ReactNode; // paper-specific options above the preview
  children: React.ReactNode;
}) {
  const paperRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState<"jpg" | "pdf" | null>(null);

  // Every sheet as a JPEG data URL, in page order
  const renderSheets = async () => {
    const { toJpeg } = await import("html-to-image");
    const sheets = paperRef.current!.querySelectorAll<HTMLElement>("[data-paper-page]");
    const targets = sheets.length > 0 ? Array.from(sheets) : [paperRef.current!];
    const urls: string[] = [];
    for (const target of targets) {
      urls.push(await toJpeg(target, {
        quality: 0.92,
        pixelRatio: 2,
        backgroundColor: "#ffffff",
      }));
    }
    return urls;
  };

  const downloadJpg = async () => {
    if (!paperRef.current) return;
    setBusy("jpg");
    try {
      const urls = await renderSheets();
      urls.forEach((dataUrl, i) => {
        const a = document.createElement("a");
        a.download = urls.length > 1 ? filename.replace(/\.jpg$/i, `-p${i + 1}.jpg`) : filename;
        a.href = dataUrl;
        a.click();
      });
      if (urls.length > 1) {
        toast.success(`Downloaded ${urls.length} pages`);
      }
    } catch {
      toast.error("Could not create the image, please try again");
    } finally {
      setBusy(null);
    }
  };

  const downloadPdf = async () => {
    if (!paperRef.current) return;
    setBusy("pdf");
    try {
      const [urls, { jsPDF }] = await Promise.all([renderSheets(), import("jspdf")]);
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      urls.forEach((dataUrl, i) => {
        if (i > 0) pdf.addPage();
        pdf.addImage(dataUrl, "JPEG", 0, 0, 210, 297);
      });
      pdf.save(filename.replace(/\.jpg$/i, ".pdf"));
    } catch {
      toast.error("Could not create the PDF, please try again");
    } finally {
      setBusy(null);
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
        <div className="flex flex-wrap justify-end gap-2">
          <Button onClick={onClose}>Close</Button>
          <Button
            icon={<ImageDown className="h-4 w-4" />}
            loading={busy === "jpg"}
            disabled={!canDownload || busy === "pdf"}
            onClick={downloadJpg}
          >
            Download JPG
          </Button>
          <Button
            type="primary"
            icon={<ArrowDownToLine className="h-4 w-4" />}
            loading={busy === "pdf"}
            disabled={!canDownload || busy === "jpg"}
            onClick={downloadPdf}
          >
            Download PDF
          </Button>
        </div>
      }
    >
      {toolbar && <div className="mb-3">{toolbar}</div>}
      <div className="overflow-auto rounded-lg border border-line bg-surface-sunken p-3">
        {/* relative: the papers' hidden measuring pass anchors to this box */}
        <div ref={paperRef} className="relative mx-auto w-fit space-y-4">
          {children}
        </div>
      </div>
    </Modal>
  );
}
