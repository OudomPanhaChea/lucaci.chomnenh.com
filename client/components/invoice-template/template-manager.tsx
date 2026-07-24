"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Dropdown, Popconfirm, Spin } from "antd";
import { toast } from "react-toastify";
import { Plus, Pencil, Trash2, Star, Check, CircleDollarSign } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ImageDropzone } from "@/components/ui/image-dropzone";
import { EmptyState } from "@/components/ui/empty-state";
import { FileText } from "lucide-react";
import api, { apiError } from "@/services/api";
import { useRealtime } from "@/hooks/useRealtime";
import type { Settings } from "@/lib/types";
import type { InvoiceTemplate, TemplateElement } from "./types";
import { PRESETS } from "./presets";
import { sampleInvoiceData } from "./bindings";
import TemplateCanvas from "./template-canvas";
import TemplateEditorModal from "./template-editor-modal";

// Settings section: upload the KHQR payment image, and create / edit / choose the
// default invoice template. Self-contained (owns its own template API calls).
export default function TemplateManager({
  settings, onSettings,
}: {
  settings: Settings | null;
  onSettings: (s: Settings) => void;
}) {
  const [templates, setTemplates] = useState<InvoiceTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [khqrBusy, setKhqrBusy] = useState(false);
  const [editing, setEditing] = useState<InvoiceTemplate | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    api.get("/invoice-templates")
      .then(({ data }) => setTemplates(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);
  useRealtime(["template:changed"], load);

  const data = useMemo(() => sampleInvoiceData(settings), [settings]);

  const uploadKhqr = async (file: File) => {
    setKhqrBusy(true);
    try {
      const fd = new FormData();
      fd.append("image", file);
      const { data } = await api.post<Settings>("/settings/khqr", fd);
      onSettings(data);
      toast.success("KHQR image updated");
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
      toast.success("KHQR image removed");
    } catch (err) {
      toast.error(apiError(err));
    }
  };

  const createFromPreset = async (presetKey: string) => {
    const preset = PRESETS.find((p) => p.key === presetKey);
    if (!preset) return;
    try {
      await api.post("/invoice-templates", { name: preset.name, elements: preset.build() });
      toast.success(`${preset.name} template added`);
      load();
    } catch (err) {
      toast.error(apiError(err));
    }
  };

  const saveTemplate = async (elements: TemplateElement[], name: string) => {
    if (!editing) return;
    setSaving(true);
    try {
      await api.put(`/invoice-templates/${editing.id}`, { name, elements });
      toast.success("Template saved");
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
      toast.success("Template deleted");
      load();
    } catch (err) {
      toast.error(apiError(err));
    }
  };

  return (
    <div className="mt-4 rounded-xl border border-line bg-surface-raised p-5 shadow-card">
      <h2 className="mb-1 font-medium text-fg">Invoice template</h2>
      <p className="mb-4 text-xs text-fg-muted">
        Design how printed invoices look. Drag and resize anything; the default template is
        used for every invoice unless customized on a client&apos;s invoice.
      </p>

      {/* KHQR payment image */}
      <div className="mb-5 flex items-start gap-4 rounded-lg bg-surface-sunken p-3">
        <div className="w-28 shrink-0">
          <ImageDropzone
            value={settings?.khqr_url}
            onSelect={uploadKhqr}
            onRemove={settings?.khqr_url ? removeKhqr : undefined}
            removeConfirm="Remove the KHQR image?"
            busy={khqrBusy}
            aspect={0.8}
            cropTitle="Crop KHQR"
            className="aspect-[4/5] w-full"
            rounded="rounded-lg"
            label="KHQR"
            hint="Upload"
          />
        </div>
        <div className="min-w-0 pt-1">
          <p className="flex items-center gap-1.5 text-sm font-medium text-fg">
            <CircleDollarSign className="h-4 w-4 text-brand" /> Payment QR (KHQR)
          </p>
          <p className="mt-1 text-xs text-fg-muted">
            Upload your Bakong / KHQR image once. Add a <b>QR</b> element to any template and it
            shows this image. Drag it anywhere and resize it on the canvas.
          </p>
        </div>
      </div>

      {/* Templates */}
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-medium text-fg">Templates</p>
        <Dropdown
          trigger={["click"]}
          menu={{ items: PRESETS.map((p) => ({ key: p.key, label: `${p.name} style` })), onClick: ({ key }) => createFromPreset(key) }}
        >
          <Button type="primary" size="small" icon={<Plus className="h-4 w-4" />}>Add template</Button>
        </Dropdown>
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><Spin /></div>
      ) : templates.length === 0 ? (
        <EmptyState icon={FileText} title="No templates yet" description="Add a Modern or Minimal template to get started." />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {templates.map((t) => (
            <div key={t.id} className="overflow-hidden rounded-lg border border-line bg-surface">
              <div className="relative flex h-40 items-start justify-center overflow-hidden border-b border-line bg-surface-sunken p-2">
                <div style={{ transform: "scale(0.9)", transformOrigin: "top center" }}>
                  <TemplateCanvas elements={t.elements} data={data} scale={0.185} />
                </div>
                {!!t.is_default && (
                  <span className="absolute left-1.5 top-1.5 flex items-center gap-1 rounded-full bg-brand px-2 py-0.5 text-[10px] font-medium text-brand-foreground">
                    <Star className="h-3 w-3" /> Default
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between gap-1 px-2 py-1.5">
                <span className="truncate text-sm font-medium text-fg">{t.name}</span>
                <div className="flex shrink-0 items-center">
                  {!t.is_default && (
                    <Button size="small" type="text" title="Set as default" icon={<Check className="h-4 w-4" />} onClick={() => setDefault(t)} />
                  )}
                  <Button size="small" type="text" icon={<Pencil className="h-4 w-4" />} onClick={() => setEditing(t)} />
                  <Popconfirm title={`Delete ${t.name}?`} onConfirm={() => remove(t)} okButtonProps={{ danger: true }}>
                    <Button size="small" type="text" danger icon={<Trash2 className="h-4 w-4" />} />
                  </Popconfirm>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <TemplateEditorModal
        open={!!editing}
        title={`Edit template${editing ? ` · ${editing.name}` : ""}`}
        initialElements={editing?.elements ?? []}
        initialName={editing?.name}
        withName
        data={data}
        saving={saving}
        onSave={saveTemplate}
        onClose={() => setEditing(null)}
      />
    </div>
  );
}
