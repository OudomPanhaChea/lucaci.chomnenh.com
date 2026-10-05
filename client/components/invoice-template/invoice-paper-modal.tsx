"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
import { useT } from "@/lib/i18n";
import { Checkbox } from "antd";
import { FileWarning } from "lucide-react";
import { money } from "@/lib/format";
import PaperModal, { usePaperSettings } from "@/components/paper/paper-modal";
import { EmptyState } from "@/components/ui/empty-state";
import { Spinner } from "@/components/ui/spinner";
import api, { apiError } from "@/services/api";
import { paperSlug } from "@/components/paper/paper";
import dayjs from "dayjs";
import type { Sale } from "@/lib/types";
import { CANVAS_H, type InvoiceTemplate, type TemplateElement } from "./types";
import { combineInvoiceData, resolveInvoiceData } from "./bindings";
import { withOwingRows } from "./totals-rows";
import InvoiceSheets from "./invoice-sheets";
import TemplateEditorModal from "./template-editor-modal";

// The invoice paper, in the shared PaperModal (print, download PDF/JPG). ONE
// invoice prints from its own template or its saved per-invoice layout, and can
// be customized from the footer Edit button. SEVERAL selected invoices print as
// a single combined document: one header, one item list (each invoice's lines
// under a separator naming it), one totals block and one footer, with the money
// summed. A combined paper belongs to no single invoice, so it is not editable
// and it draws on the template alone, never on a per-invoice layout override.
// A client carrying previous owing gets a toggle that folds that debt into the
// totals block (Previous Owing + Grand Total), once per paper.
//
// lucaci-only: saleIds = [] prints an owing-only paper (a synthetic invoice with
// no items carrying the client's previous owing), and owingOnlyIds ("បុងចាស់")
// moves selected invoices off the item list into Previous Owing.
const GROWING_BINDINGS = new Set(["invoice_number", "cashier_name", "note"]);

// How tall an element may become without touching anything designed under it:
// down to the nearest element sharing its column, else the foot of the sheet.
function roomBelow(el: TemplateElement, all: TemplateElement[]) {
  const below = all.filter(
    (o) => o !== el && o.x < el.x + el.w && el.x < o.x + o.w && o.y >= el.y + el.h,
  );
  const limit = below.length > 0 ? Math.min(...below.map((o) => o.y)) : CANVAS_H - 40;
  return Math.max(el.h, limit - el.y - 8);
}

// Elements to draw for one invoice: its own layout override → chosen template
// → business default → first template.
function elementsForSale(
  sale: Sale,
  templates: InvoiceTemplate[],
): { elements: TemplateElement[]; templateId: number | null } {
  if (Array.isArray(sale.invoice_layout) && sale.invoice_layout.length > 0) {
    return { elements: sale.invoice_layout, templateId: sale.invoice_template_id ?? null };
  }
  const chosen = sale.invoice_template_id ? templates.find((t) => t.id === sale.invoice_template_id) : null;
  const tpl = chosen || templates.find((t) => t.is_default) || templates[0] || null;
  return { elements: tpl?.elements ?? [], templateId: tpl?.id ?? null };
}

// A print-only stand-in invoice for the "previous owing, no invoices" case, so
// an owing statement renders through the SAME template as real invoices (no
// items, $0 invoice total, the previous owing carried in the totals block).
function buildOwingSale(name: string, exchangeRate: number): Sale {
  return {
    id: 0,
    invoice_number: "",
    client_id: null,
    client_name: name,
    cashier_name: null,
    subtotal: 0, discount_pct: 0, discount_amount: 0, tax_rate: 0, tax_amount: 0,
    total: 0, payment_method: "cash", amount_received: null, change_due: null,
    amount_paid: 0, exchange_rate: exchangeRate, status: "unpaid", note: null,
    created_at: dayjs().toISOString(),
    items: [], payments: [],
  };
}

export default function InvoicePaperModal({
  open, saleIds, owingOnlyIds, client, canEdit, onClose, onSaved,
}: {
  open: boolean;
  saleIds: number[] | null;
  // Subset of saleIds carried into Previous Owing instead of listed. Combined only.
  owingOnlyIds?: number[];
  client?: { name: string; opening_owing?: number | string | null } | null;
  canEdit: boolean;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const settings = usePaperSettings(open);
  const { t } = useT();
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

  const elementsFor = useCallback((sale: Sale) => elementsForSale(sale, templates), [templates]);

  // The client's previous owing: from the client the page passed, else from the
  // sale (the API joins it on), so the invoices page offers the toggle too.
  const owingOnly = !!saleIds && saleIds.length === 0;
  const oldOwing =
    Number(client?.opening_owing) ||
    Number(sales?.find((s) => Number(s.client_opening_owing) > 0)?.client_opening_owing) ||
    0;

  const owingSale = useMemo<Sale | null>(
    () => (owingOnly && client && oldOwing > 0
      ? buildOwingSale(client.name, Number(settings?.exchange_rate) || 4100)
      : null),
    [owingOnly, client, oldOwing, settings],
  );
  // What the sheets render from: the synthetic owing invoice, or the fetched sales.
  const displaySales = owingOnly ? (owingSale ? [owingSale] : []) : sales;
  const carriedIds = useMemo(() => owingOnlyIds ?? [], [owingOnlyIds]);

  // The combined paper's layout: the template the oldest selected invoice
  // points at (else the business default), never a per-invoice override, since
  // the document is not any one of those invoices.
  const combinedElements = useMemo(() => {
    if (!sales || sales.length < 2) return [];
    const first = sales[0];
    const chosen = first.invoice_template_id ? templates.find((t) => t.id === first.invoice_template_id) : null;
    const els = (chosen || templates.find((t) => t.is_default) || templates[0])?.elements ?? [];
    // Fields that hold a joined value on a combined paper (every invoice
    // number, every cashier, every note) outgrow the box they were designed
    // for and would be clipped mid-line. Let them use the free space down to
    // the next element in their own column instead.
    return els.map((el) =>
      el.kind === "field" && GROWING_BINDINGS.has(el.binding ?? "")
        ? { ...el, h: roomBelow(el, els) }
        : el,
    );
  }, [sales, templates]);

  // The owing amount this paper carries (0 = the toggle is off, or none owed).
  // The owing-only paper IS the owing, so it is always on there.
  const paperOwing = owingOnly || includeOwing ? oldOwing : 0;
  const carriesOwing =
    paperOwing > 0 || (!!sales && sales.length > 1 && carriedIds.some((id) => sales.some((s) => s.id === id)));

  // Folding previous owing in turns the Previous Owing + Grand Total rows on for
  // THIS print (see withOwingRows: most templates leave them off, so the toggle
  // would otherwise do nothing visible) and gives the totals box the free space
  // under it, since two extra rows do not fit the box it was designed at.
  const withOwingRoom = useCallback(
    (els: TemplateElement[]) =>
      carriesOwing
        ? els.map((el) => (el.kind === "totals" ? withOwingRows({ ...el, h: roomBelow(el, els) }) : el))
        : els,
    [carriesOwing],
  );

  const editingData = useMemo(
    () => (editing ? resolveInvoiceData(editing, settings, paperOwing) : null),
    [editing, settings, paperOwing],
  );
  const editingResolved = editing ? elementsFor(editing) : { elements: [], templateId: null };

  const saveLayout = async (els: TemplateElement[]) => {
    if (!editing) return;
    setSaving(true);
    try {
      await api.put(`/sales/${editing.id}/layout`, { template_id: editingResolved.templateId, layout: els });
      toast.success(t("Saved"));
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
  // The synthetic owing invoice has no real id or number, so it is not editable.
  const editable = canEdit && !owingOnly;

  const title = owingOnly
    ? t("Owing statement")
    : single
      ? `${t("Invoice")} ${single.invoice_number}`
      : sales && sales.length > 1
        ? `${t("Invoices")} (${sales.length})`
        : t("Invoice");
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
        toolbar={ready && !owingOnly && oldOwing > 0 ? (
          <label className="flex cursor-pointer items-center gap-2 text-sm text-fg-muted">
            <Checkbox checked={includeOwing} onChange={(e) => setIncludeOwing(e.target.checked)} />
            {t("Include previous owing {amount}", { amount: money(oldOwing) })}
          </label>
        ) : null}
      >
        {!displaySales ? (
          <div className="flex h-64 w-96 items-center justify-center"><Spinner /></div>
        ) : !anyTemplate ? (
          <div className="w-[520px] max-w-full">
            <EmptyState
              icon={FileWarning}
              title={t("No invoice template yet")}
            />
          </div>
        ) : single ? (
          <div className="relative space-y-4">
            <InvoiceSheets
              elements={withOwingRoom(elementsFor(single).elements)}
              data={resolveInvoiceData(single, settings, paperOwing)}
              docTitle={[owingOnly ? "Owing statement" : `Invoice ${single.invoice_number}`, single.client_name].filter(Boolean).join(" · ")}
              scale={1}
            />
          </div>
        ) : displaySales.length > 1 ? (
          <div className="relative space-y-4">
            <InvoiceSheets
              elements={withOwingRoom(combinedElements)}
              data={combineInvoiceData(displaySales, settings, paperOwing, carriedIds)}
              docTitle={[`Invoices (${displaySales.length})`, displaySales[0].client_name].filter(Boolean).join(" · ")}
              scale={1}
            />
          </div>
        ) : null}
      </PaperModal>

      {editingData && (
        <TemplateEditorModal
          open={!!editing}
          title={`${t("Edit layout")} · ${editing?.invoice_number ?? ""}`}
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
