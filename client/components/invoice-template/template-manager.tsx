"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Popconfirm, Spin } from "antd";
import { toast } from "react-toastify";
import { Plus, Pencil, Trash2, Star, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ImageDropzone } from "@/components/ui/image-dropzone";
import { EmptyState } from "@/components/ui/empty-state";
import { FileText } from "lucide-react";
import api, { apiError } from "@/services/api";
import { useRealtime } from "@/hooks/useRealtime";
import type { Settings } from "@/lib/types";
import { useT } from "@/lib/i18n";
import type { InvoiceTemplate, TemplateElement, TemplateKind } from "./types";
import { PRESETS } from "./presets";
import { sampleInvoiceData } from "./bindings";
import TemplateCanvas from "./template-canvas";
import TemplateEditorModal from "./template-editor-modal";
import { bonusElements, sampleBonusData } from "@/components/bonus/bonus-data";

// Settings section: upload the KHQR payment image, and create / edit / choose the
// default invoice template. Self-contained (owns its own template API calls).
// kind="bonus" manages the bonus award layouts the same way: no KHQR, a sample
// bonus in the previews, and new ones start from a preset or a copy of an
// invoice template, both re-worded for a bonus (title BONUS, Awarded To ...).
export default function TemplateManager({
  settings, onSettings, kind = "invoice",
}: {
  settings: Settings | null;
  onSettings: (s: Settings) => void;
  kind?: TemplateKind;
}) {
  const isBonus = kind === "bonus";
  const { t: tr } = useT();
  const [templates, setTemplates] = useState<InvoiceTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [khqrBusy, setKhqrBusy] = useState(false);
  const [editing, setEditing] = useState<InvoiceTemplate | null>(null);
  const [saving, setSaving] = useState(false);
  // Bonus only: invoice layouts offered as a starting point
  const [invoiceTemplates, setInvoiceTemplates] = useState<InvoiceTemplate[]>([]);

  // A new template: an invoice one starts from the Modern layout; a bonus one
  // starts as a copy of the default invoice template (so it matches the
  // invoices), re-worded for a bonus, or from Modern without an invoice template.
  const newTemplate = useCallback(
    (count: number, invoices: InvoiceTemplate[]) => {
      const base =
        (kind === "bonus" && (invoices.find((t) => t.is_default) ?? invoices[0])?.elements) ||
        PRESETS[0].build();
      const word = kind === "bonus" ? tr("Bonus") : tr("Invoice");
      return {
        kind,
        name: count ? `${word} ${count + 1}` : word,
        elements: kind === "bonus" ? bonusElements(base) : base,
      };
    },
    [kind, tr],
  );

  // Each kind always has a template (owner 2026-10-08): an empty list gets one
  // created right away, once per mount, and the last one cannot be deleted.
  const seeded = useRef(false);
  const load = useCallback(async () => {
    try {
      const [own, invoices] = await Promise.all([
        api.get<InvoiceTemplate[]>("/invoice-templates", { params: { kind } }),
        kind === "bonus" ? api.get<InvoiceTemplate[]>("/invoice-templates") : null,
      ]);
      let list = own.data;
      const invList = invoices?.data ?? [];
      if (list.length === 0 && !seeded.current) {
        seeded.current = true;
        await api.post("/invoice-templates", newTemplate(0, invList));
        list = (await api.get<InvoiceTemplate[]>("/invoice-templates", { params: { kind } })).data;
      }
      setTemplates(list);
      setInvoiceTemplates(invList);
    } catch {
      /* the card shows its empty state */
    } finally {
      setLoading(false);
    }
  }, [kind, newTemplate]);
  useEffect(() => {
    load();
  }, [load]);
  useRealtime(["template:changed"], load);

  const data = useMemo(
    () => (isBonus ? sampleBonusData(settings) : sampleInvoiceData(settings)),
    [isBonus, settings],
  );

  const uploadKhqr = async (file: File) => {
    setKhqrBusy(true);
    try {
      const fd = new FormData();
      fd.append("image", file);
      const { data } = await api.post<Settings>("/settings/khqr", fd);
      onSettings(data);
      toast.success(tr("Saved"));
    } catch (err) {
      toast.error(apiError(err));
    } finally {
      setKhqrBusy(false);
    }
  };
  const removeKhqr = async () => {
    try {
      const { data } = await api.delete<Settings>("/settings/khqr");
      onSettings(data);
      toast.success(tr("Removed"));
    } catch (err) {
      toast.error(apiError(err));
    }
  };

  // One click adds a template, no layout menu (owner 2026-10-08)
  const [adding, setAdding] = useState(false);
  const addTemplate = async () => {
    setAdding(true);
    try {
      await api.post("/invoice-templates", newTemplate(templates.length, invoiceTemplates));
      toast.success(tr("Added"));
      load();
    } catch (err) {
      toast.error(apiError(err));
    } finally {
      setAdding(false);
    }
  };

  const saveTemplate = async (elements: TemplateElement[], name: string) => {
    if (!editing) return;
    setSaving(true);
    try {
      await api.put(`/invoice-templates/${editing.id}`, { name, elements });
      toast.success(tr("Saved"));
      setEditing(null);
      load();
    } catch (err) {
      toast.error(apiError(err));
    } finally {
      setSaving(false);
    }
  };

  const setDefault = async (t: InvoiceTemplate) => {
    try {
      await api.put(`/invoice-templates/${t.id}/default`);
      load();
    } catch (err) {
      toast.error(apiError(err));
    }
  };
  const remove = async (t: InvoiceTemplate) => {
    try {
      await api.delete(`/invoice-templates/${t.id}`);
      toast.success(tr("Deleted"));
      load();
    } catch (err) {
      toast.error(apiError(err));
    }
  };

  return (
    <div className="mt-4 rounded-xl border border-line bg-surface-raised p-5 shadow-card">
      <h2 className="mb-2 font-medium text-fg">{isBonus ? tr("Bonus template") : tr("Invoice template")}</h2>
      {/* <p className="mb-4 text-xs text-fg-muted">
        Design how printed invoices look. Drag and resize anything; the default template is
        used for every invoice unless customized on a client&apos;s invoice.
      </p> */}

      {/* KHQR payment image */}
      {!isBonus && <div className="mb-5 flex items-start gap-4 rounded-lg bg-surface-sunken p-3">
        <div className="w-28 shrink-0">
          <ImageDropzone
            value={settings?.khqr_url}
            onSelect={uploadKhqr}
            onRemove={settings?.khqr_url ? removeKhqr : undefined}
            busy={khqrBusy}
            aspect={0.8}
            className="aspect-[4/5] w-full"
            rounded="rounded-lg"
            label="KHQR"
          />
        </div>
        <p className="min-w-0 pt-1 text-sm font-medium text-fg">{tr("Payment QR (KHQR)")}</p>
      </div>}

      {/* Templates */}
      <div className="mb-3 flex items-center justify-between">
        {/* The bonus card has no KHQR block, so its heading already names the list */}
        {isBonus ? <span /> : <p className="text-sm font-medium text-fg">{tr("Templates")}</p>}
        <Button type="primary" size="small" icon={<Plus className="h-4 w-4" />} loading={adding} onClick={addTemplate}>
          {tr("Add template")}
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><Spin /></div>
      ) : templates.length === 0 ? (
        <EmptyState icon={FileText} title={isBonus ? tr("No bonus template yet") : tr("No invoice template yet")} />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {templates.map((t) => (
            <div key={t.id} className="overflow-hidden rounded-lg border border-line bg-surface">
              <div className="relative flex h-40 items-start justify-center overflow-hidden border-b border-line bg-surface-sunken p-2">
                <div style={{ transform: "scale(0.9)", transformOrigin: "top center" }}>
                  <TemplateCanvas elements={t.elements} data={data} scale={0.185} />
                </div>
                {!!t.is_default && (
                  <span className="absolute left-1.5 top-1.5 flex items-center gap-1 rounded-full bg-surface-raised px-2 py-0.5 text-[10px] font-medium text-fg shadow-card">
                    <Star className="h-3 w-3" /> {tr("Default")}
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between gap-1 px-2 py-1.5">
                <span className="truncate text-sm font-medium text-fg">{t.name}</span>
                <div className="flex shrink-0 items-center">
                  {!t.is_default && (
                    <Button
                      size="small" type="text" title={tr("Set as default")}
                      aria-label={tr("Set as default")}
                      icon={<Check className="h-4 w-4" />} onClick={() => setDefault(t)}
                    />
                  )}
                  <Button
                    size="small" type="text" title={tr("Edit")}
                    aria-label={tr("Edit")}
                    icon={<Pencil className="h-4 w-4" />} onClick={() => setEditing(t)}
                  />
                  {/* The last template of a kind stays (one always exists) */}
                  {templates.length > 1 && (
                    <Popconfirm title={tr("Delete {name}?", { name: t.name })} okText={tr("Delete")} cancelText={tr("Cancel")} onConfirm={() => remove(t)} okButtonProps={{ danger: true }}>
                      <Button
                        size="small" type="text" danger title={tr("Delete")}
                        aria-label={tr("Delete")}
                        icon={<Trash2 className="h-4 w-4" />}
                      />
                    </Popconfirm>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <TemplateEditorModal
        open={!!editing}
        title={`${tr("Edit template")}${editing ? ` · ${editing.name}` : ""}`}
        initialElements={editing?.elements ?? []}
        initialName={editing?.name}
        withName
        data={data}
        // The sample-invoice knobs (discount, paid, owing) mean nothing on a
        // bonus, so a bonus template previews the fixed sample award instead.
        previewSettings={isBonus ? undefined : settings}
        saving={saving}
        onSave={saveTemplate}
        onClose={() => setEditing(null)}
      />
    </div>
  );
}
