"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
import { Checkbox } from "antd";
import { Pencil, FileWarning } from "lucide-react";
import { Button } from "@/components/ui/button";
import { money } from "@/lib/format";
import PaperModal, { usePaperSettings } from "@/components/paper/paper-modal";
import { EmptyState } from "@/components/ui/empty-state";
import { Spinner } from "@/components/ui/spinner";
import api, { apiError } from "@/services/api";
import { paperSlug } from "@/components/paper/paper";
import dayjs from "dayjs";
import type { Sale } from "@/lib/types";
import type { InvoiceTemplate, TemplateElement } from "./types";
import { resolveInvoiceData } from "./bindings";
import TemplateCanvas from "./template-canvas";
import TemplateEditorModal from "./template-editor-modal";

// A print-only stand-in invoice for the "previous owing, no invoices" case, so
// an owing statement renders through the SAME template/canvas as real invoices
// (no items, $0 invoice total, the previous owing carried in the totals block).
function buildOwingSale(name: string, oldOwing: number, exchangeRate: number): Sale {
  return {
    id: 0,
    invoice_number: "",
    client_id: null,
    client_name: name,
    cashier_name: null,
    subtotal: 0, discount_pct: 0, discount_amount: 0, tax_rate: 0, tax_amount: 0,
    total: 0, payment_method: "cash", amount_received: null, change_due: null,
    amount_paid: 0, exchange_rate: exchangeRate, status: "unpaid", note: null,
    client_opening_owing: oldOwing, created_at: dayjs().toISOString(),
    items: [], payments: [],
  };
}

// The invoice paper: renders one OR many invoices, each from its own template
// (or its saved per-invoice layout), as separate A4 sheets in the shared
// PaperModal (download JPG/PDF). Each invoice is editable individually: a single
// invoice via the footer Edit button, multiple via a per-sheet Edit control.
// saleIds = [] with a client that owes prints an owing-only statement on the
// same canvas (a synthetic invoice). Replaces the old account-statement paper.
export default function InvoicePaperModal({
  open, saleIds, client, canEdit, onClose, onSaved,
}: {
  open: boolean;
  saleIds: number[] | null;
  client?: { name: string; opening_owing?: number | string | null } | null;
  canEdit: boolean;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const settings = usePaperSettings(open);
  const [templates, setTemplates] = useState<InvoiceTemplate[]>([]);
  const [sales, setSales] = useState<Sale[] | null>(null);
  const [editing, setEditing] = useState<Sale | null>(null);
  const [saving, setSaving] = useState(false);
  const [includeOwing, setIncludeOwing] = useState(true);

  useEffect(() => {
    if (!open) return;
    api.get("/invoice-templates").then(({ data }) => setTemplates(data)).catch(() => {});
  }, [open]);

  // Fresh "include previous owing" default each time the paper opens.
  useEffect(() => {
    if (open) setIncludeOwing(true);
  }, [open, saleIds]);

  useEffect(() => {
    if (!open || !saleIds || saleIds.length === 0) { setSales(null); return; }
    let stale = false;
    Promise.all(saleIds.map((id) => api.get(`/sales/${id}`)))
      .then((rs) => {
        if (stale) return;
        const full = rs.map((r) => r.data as Sale);
        full.sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id - b.id);
        setSales(full);
      })
      .catch(() => !stale && setSales([]));
    return () => { stale = true; };
  }, [open, saleIds]);

  // Elements to draw for one invoice: its own layout override → chosen template
  // → business default → first template.
  const elementsFor = useCallback((sale: Sale): { elements: TemplateElement[]; templateId: number | null } => {
    if (Array.isArray(sale.invoice_layout) && sale.invoice_layout.length > 0) {
      return { elements: sale.invoice_layout, templateId: sale.invoice_template_id ?? null };
    }
    const chosen = sale.invoice_template_id ? templates.find((t) => t.id === sale.invoice_template_id) : null;
    const tpl = chosen || templates.find((t) => t.is_default) || templates[0] || null;
    return { elements: tpl?.elements ?? [], templateId: tpl?.id ?? null };
  }, [templates]);

  // Owing-only paper: no invoices selected but the client carries previous owing.
  // We render one synthetic invoice on the same canvas instead of a separate
  // statement, so every paper looks identical.
  const owingOnly = !!saleIds && saleIds.length === 0;
  const oldOwing = Number(client?.opening_owing) || 0;
  const owingSale = useMemo<Sale | null>(
    () => (owingOnly && client && oldOwing > 0
      ? buildOwingSale(client.name, oldOwing, Number(settings?.exchange_rate) || 4100)
      : null),
    [owingOnly, client, oldOwing, settings],
  );
  // What the sheets render from: the synthetic owing invoice, or the fetched sales.
  const displaySales = owingOnly ? (owingSale ? [owingSale] : []) : sales;

  // Previous owing is the client's remaining old debt; fold it into the LAST
  // sheet only so a multi-invoice batch never repeats or double-counts it.
  // clientOwing (from the joined sale data) drives the toggle label + visibility.
  const clientOwing = Number(sales?.find((s) => Number(s.client_opening_owing) > 0)?.client_opening_owing) || 0;
  const lastId = displaySales && displaySales.length ? displaySales[displaySales.length - 1].id : null;
  const oldOwingFor = useCallback(
    (sale: Sale) => (includeOwing && sale.id === lastId ? Number(sale.client_opening_owing) || 0 : 0),
    [includeOwing, lastId],
  );

  const editingData = useMemo(
    () => (editing ? resolveInvoiceData(editing, settings, oldOwingFor(editing)) : null),
    [editing, settings, oldOwingFor],
  );
  const editingResolved = editing ? elementsFor(editing) : { elements: [], templateId: null };

  const saveLayout = async (els: TemplateElement[]) => {
    if (!editing) return;
    setSaving(true);
    try {
      await api.put(`/sales/${editing.id}/layout`, { template_id: editingResolved.templateId, layout: els });
      toast.success("Invoice layout saved");
      // reflect the change in place
      const { data } = await api.get(`/sales/${editing.id}`);
      setSales((prev) => (prev ? prev.map((s) => (s.id === data.id ? data : s)) : prev));
      setEditing(null);
      onSaved?.();
    } catch (err) {
      toast.error(apiError(err));
    } finally {
      setSaving(false);
    }
  };

  const single = displaySales && displaySales.length === 1 ? displaySales[0] : null;
  const anyTemplate = templates.length > 0;
  const ready = !!displaySales && displaySales.length > 0 && anyTemplate;
  // The synthetic owing invoice has no real id/number, so it is never editable.
  const editable = canEdit && !owingOnly;

  const title = owingOnly
    ? "Invoice"
    : single
      ? `Invoice ${single.invoice_number}`
      : displaySales && displaySales.length > 1
        ? `Invoices (${displaySales.length})`
        : "Invoice";
  const filename = owingOnly
    ? `owing-${paperSlug(client?.name || "client")}-${dayjs().format("YYYYMMDD")}.jpg`
    : single
      ? `${paperSlug(single.invoice_number)}.jpg`
      : `invoices-${paperSlug(client?.name || "client")}-${dayjs().format("YYYYMMDD")}.jpg`;

  return (
    <>
      <PaperModal
        open={open && !editing}
        title={title}
        filename={filename}
        canDownload={ready}
        onClose={onClose}
        width={1120}
        scrollMaxHeight="64vh"
        onEdit={editable && single && anyTemplate ? () => setEditing(single) : undefined}
        toolbar={ready && !owingOnly && clientOwing > 0 ? (
          <label className="flex cursor-pointer items-center gap-2 text-sm text-fg-muted">
            <Checkbox checked={includeOwing} onChange={(e) => setIncludeOwing(e.target.checked)} />
            Include {money(clientOwing)} previous owing
            {sales && sales.length > 1 ? " (on the last invoice)" : ""}
          </label>
        ) : null}
      >
        {!displaySales ? (
          <div className="flex h-64 w-96 items-center justify-center"><Spinner /></div>
        ) : !anyTemplate ? (
          <div className="w-[520px] max-w-full">
            <EmptyState
              icon={FileWarning}
              title="No invoice template yet"
              description="Create and set a default invoice template in Settings → Invoice template first."
            />
          </div>
        ) : (
          displaySales.map((sale) => {
            const { elements } = elementsFor(sale);
            const data = resolveInvoiceData(sale, settings, oldOwingFor(sale));
            return (
              <div key={sale.id} className="group relative">
                {editable && !single && (
                  <button
                    onClick={() => setEditing(sale)}
                    className="absolute right-2 top-2 z-10 flex cursor-pointer items-center gap-1 rounded-lg border border-line bg-surface-raised/95 px-2.5 py-1 text-xs font-medium text-fg-muted shadow-card backdrop-blur transition-colors duration-200 hover:text-brand"
                  >
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </button>
                )}
                <TemplateCanvas elements={elements} data={data} scale={1} />
              </div>
            );
          })
        )}
      </PaperModal>

      {editingData && (
        <TemplateEditorModal
          open={!!editing}
          title={`Customize invoice ${editing?.invoice_number ?? ""}`}
          initialElements={editingResolved.elements}
          data={editingData}
          saving={saving}
          onSave={(els) => saveLayout(els)}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}
