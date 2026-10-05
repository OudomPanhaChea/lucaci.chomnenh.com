"use client";
import { useEffect, useMemo, useState } from "react";
import { Select } from "antd";
import dayjs from "dayjs";
import { FileWarning } from "lucide-react";
import api from "@/services/api";
import PaperModal, { usePaperSettings } from "@/components/paper/paper-modal";
import { paperSlug } from "@/components/paper/paper";
import { EmptyState } from "@/components/ui/empty-state";
import { Spinner } from "@/components/ui/spinner";
import InvoiceSheets from "@/components/invoice-template/invoice-sheets";
import type { InvoiceTemplate } from "@/components/invoice-template/types";
import { bonusElements, bonusRef, defaultBonusTemplateId, resolveBonusData } from "./bonus-data";
import type { Bonus } from "@/lib/types";
import { useT } from "@/lib/i18n";

// Preview + print/download of a bonus award, rendered through one of the
// business's invoice templates. A template named for bonuses is picked by
// default, so the owner can keep a copy of the invoice template with its own
// title ("BONUS") and the paper never says "INVOICE".
export default function BonusPaperModal({
  bonus,
  client,
  onClose,
}: {
  bonus: Bonus | null;
  client?: { phone?: string | null; address?: string | null } | null;
  onClose: () => void;
}) {
  const { t: tr } = useT();
  const open = !!bonus;
  const settings = usePaperSettings(open);
  const [templates, setTemplates] = useState<InvoiceTemplate[] | null>(null);
  const [picked, setPicked] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    api.get("/invoice-templates").then(({ data }) => setTemplates(data)).catch(() => setTemplates([]));
  }, [open]);

  // A fresh paper always starts on the default bonus template
  useEffect(() => {
    if (!open) setPicked(null);
  }, [open]);

  const templateId = picked ?? (templates ? defaultBonusTemplateId(templates) : null);
  const template = templates?.find((t) => t.id === templateId) ?? null;
  const elements = useMemo(() => (template ? bonusElements(template.elements) : []), [template]);
  const data = useMemo(
    () => (bonus ? resolveBonusData(bonus, settings, client) : null),
    [bonus, settings, client]
  );

  const ready = !!bonus && !!template && !!data;

  return (
    <PaperModal
      open={open}
      onClose={onClose}
      title={bonus ? `${tr("Bonus")} ${bonusRef(bonus)}` : tr("Bonus")}
      filename={bonus ? `bonus-${paperSlug(bonus.client_name)}-${dayjs(bonus.created_at).format("YYYYMMDD")}.jpg` : "bonus.jpg"}
      canDownload={ready}
      width={1120}
      scrollMaxHeight="64vh"
      toolbar={
        templates && templates.length > 0 ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <label className="flex items-center gap-2 text-sm text-fg-muted">
              {tr("Template")}
              <Select
                className="w-56"
                value={templateId ?? undefined}
                onChange={setPicked}
                options={templates.map((t) => ({ value: t.id, label: t.is_default ? `${t.name} (${tr("Default")})` : t.name }))}
              />
            </label>
          </div>
        ) : null
      }
    >
      {!templates || !data ? (
        <div className="flex h-64 w-96 items-center justify-center"><Spinner /></div>
      ) : !template ? (
        <div className="w-[520px] max-w-full">
          <EmptyState
            icon={FileWarning}
            title={tr("No invoice template yet")}
          />
        </div>
      ) : (
        <InvoiceSheets
          elements={elements}
          data={data}
          docTitle={[`Bonus ${bonusRef(bonus!)}`, bonus!.client_name].join(" · ")}
        />
      )}
    </PaperModal>
  );
}
