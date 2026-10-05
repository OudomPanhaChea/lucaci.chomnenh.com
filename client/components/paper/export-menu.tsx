"use client";
import { Dropdown } from "antd";
import { ChevronDown, Download, FileImage, FileSpreadsheet, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT, type TKey } from "@/lib/i18n";

export type ExportFormat = "pdf" | "jpg" | "excel";

const FORMATS: Record<ExportFormat, { label: TKey; icon: typeof FileText }> = {
  pdf: { label: "PDF", icon: FileText },
  jpg: { label: "Image (JPG)", icon: FileImage },
  excel: { label: "Excel", icon: FileSpreadsheet },
};

// ONE download control that asks for the format, instead of a button per
// format. Only the formats a caller passes are offered, so a paper with no
// spreadsheet simply has no Excel entry.
export default function ExportMenu({
  formats,
  onSelect,
  label,
  busy = null,
  disabled = false,
  primary = true,
  placement = "bottomRight",
}: {
  formats: ExportFormat[];
  onSelect: (format: ExportFormat) => void;
  label?: string;
  busy?: ExportFormat | null; // the format being produced right now
  disabled?: boolean;
  primary?: boolean;
  placement?: "bottomRight" | "topRight";
}) {
  const { t } = useT();
  return (
    <Dropdown
      trigger={["click"]}
      placement={placement}
      disabled={disabled || busy !== null}
      menu={{
        onClick: ({ key }) => onSelect(key as ExportFormat),
        items: formats.map((f) => {
          const { label: name, icon: Icon } = FORMATS[f];
          return {
            key: f,
            label: (
              <span className="flex min-w-36 items-center gap-3 py-1">
                <Icon className="h-4 w-4 shrink-0 text-fg-muted" aria-hidden />
                <span className="font-medium text-fg">{t(name)}</span>
              </span>
            ),
          };
        }),
      }}
    >
      <Button
        type={primary ? "primary" : "default"}
        icon={<Download className="h-4 w-4" />}
        loading={busy !== null}
        disabled={disabled}
        aria-haspopup="menu"
      >
        {busy ? t("Preparing…") : (label ?? t("Download"))}
        <ChevronDown className="h-4 w-4 opacity-80" aria-hidden />
      </Button>
    </Dropdown>
  );
}
