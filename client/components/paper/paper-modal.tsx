"use client";
import { useEffect, useRef, useState } from "react";
import { Modal } from "antd";
import { Button } from "@/components/ui/button";
import { Pencil, Printer } from "lucide-react";
import { toast } from "react-toastify";
import { useT } from "@/lib/i18n";
import api from "@/services/api";
import type { Settings } from "@/lib/types";
import { printSheets, renderSheets, saveJpgs, savePdf } from "@/lib/paper-export";
import ExportMenu, { type ExportFormat } from "./export-menu";

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

// Preview + download/print of an A4 paper. Each sheet ([data-paper-page]
// node, papers may paginate onto several) is rendered to its own image by
// lib/paper-export, then saved as JPGs (name-p1.jpg, ...), as one multi-page
// PDF, or sent straight to the print dialog. A paper with a spreadsheet
// version passes onExcel and gets an Excel entry in the same Download menu.
export default function PaperModal({
  open,
  title,
  filename,
  onClose,
  canDownload = true,
  onEdit,
  editLabel,
  onExcel,
  toolbar,
  width = 960,
  scrollMaxHeight,
  children,
}: {
  open: boolean;
  title: string;
  filename: string;
  onClose: () => void;
  canDownload?: boolean;
  onEdit?: () => void; // when set, an Edit button appears in the footer
  editLabel?: string;
  onExcel?: () => Promise<void>; // when set, Download offers Excel too
  toolbar?: React.ReactNode; // paper-specific options above the preview
  width?: number; // modal width (default 960)
  scrollMaxHeight?: string; // cap + scroll the preview area (e.g. "64vh")
  children: React.ReactNode;
}) {
  const { t } = useT();
  const paperRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState<ExportFormat | null>(null);
  const [printing, setPrinting] = useState(false);

  const download = async (format: ExportFormat) => {
    if (!paperRef.current) return;
    setBusy(format);
    try {
      if (format === "excel") {
        await onExcel?.();
        toast.success(t("Downloaded"));
        return;
      }
      const urls = await renderSheets(paperRef.current);
      if (format === "pdf") {
        await savePdf(urls, filename);
      } else {
        saveJpgs(urls, filename);
        if (urls.length > 1) toast.success(t("Downloaded"));
      }
    } catch {
      toast.error(t("Download failed. Try again."));
    } finally {
      setBusy(null);
    }
  };

  const print = async () => {
    if (!paperRef.current) return;
    setPrinting(true);
    try {
      await printSheets(await renderSheets(paperRef.current), title);
    } catch {
      toast.error(t("Print failed. Try again."));
    } finally {
      setPrinting(false);
    }
  };

  const working = busy !== null || printing;

  return (
    <Modal
      open={open}
      onCancel={onClose}
      centered
      width={width}
      style={{ maxWidth: "96vw" }}
      title={title}
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button onClick={onClose}>{t("Close")}</Button>
          {onEdit && (
            <Button icon={<Pencil className="h-4 w-4" />} onClick={onEdit} disabled={working}>
              {editLabel ?? t("Edit")}
            </Button>
          )}
          <Button
            icon={<Printer className="h-4 w-4" />}
            loading={printing}
            disabled={!canDownload || busy !== null}
            onClick={print}
          >
            {t("Print")}
          </Button>
          <ExportMenu
            formats={onExcel ? ["pdf", "jpg", "excel"] : ["pdf", "jpg"]}
            busy={busy}
            placement="topRight"
            disabled={!canDownload || printing}
            onSelect={download}
          />
        </div>
      }
    >
      {toolbar && <div className="mb-3">{toolbar}</div>}
      <div
        className="overflow-auto rounded-lg border border-line bg-surface-sunken p-3"
        style={scrollMaxHeight ? { maxHeight: scrollMaxHeight } : undefined}
      >
        {/* relative: the papers' hidden measuring pass anchors to this box */}
        <div ref={paperRef} className="relative mx-auto w-fit space-y-4">
          {children}
        </div>
      </div>
    </Modal>
  );
}
