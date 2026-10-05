"use client";
import { useState } from "react";
import { Input, InputNumber, Segmented, Select, Slider, Switch, Tooltip } from "antd";
import { toast } from "react-toastify";
import {
  AlignLeft, AlignCenter, AlignRight, Bold, ChevronDown, ChevronUp,
  MousePointerSquareDashed, Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ImageDropzone } from "@/components/ui/image-dropzone";
import api, { apiError } from "@/services/api";
import { INVOICE_FONTS, fontStack } from "@/lib/invoice-fonts";
import {
  DATE_BINDINGS,
  DEFAULT_ITEM_COLUMNS,
  DEFAULT_ITEM_HEAD,
  DEFAULT_ITEM_LABELS,
  FIELD_BINDINGS,
  ITEM_COLUMN_KEYS,
  subHeadSize,
  type Align,
  type ItemColumns,
  type ItemHeadStyle,
  type ItemLabels,
  type LabelPosition,
  type TemplateElement,
  type TotalsRow,
} from "./types";
import {
  DATE_FORMAT_PRESETS,
  DATE_TOKENS,
  DEFAULT_DATE_FORMAT,
  formatInvoiceDate,
} from "@/lib/invoice-date";
import { KIND_META } from "./element-toolbar";
import { resolveTotalsRows, templateRows } from "./totals-rows";
import type { InvoiceData } from "./bindings";
import { useT } from "@/lib/i18n";

// A group of related controls under a quiet heading. Sections are what replaced
// the old per-control explanations: the heading plus the control's own shape is
// the whole instruction.
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-line px-3 py-3 first:border-t-0">
      <h4 className="mb-2.5 text-[10px] font-semibold uppercase tracking-wider text-fg-subtle">
        {title}
      </h4>
      <div className="space-y-2.5">{children}</div>
    </section>
  );
}

// A labeled control. MUST live at module scope: defining it inside the
// component gives it a new identity on every render, so React unmounts and
// remounts its subtree on each keystroke, which stole focus from inputs after
// a single character and made sliders jump. Keeping it stable fixes both.
// `inline` puts the caption in a fixed left column, which is what keeps the
// panel scannable; wide controls (textarea, lists) stack instead.
function Row({
  label, inline, children,
}: {
  label: string;
  inline?: boolean;
  children: React.ReactNode;
}) {
  if (inline) {
    return (
      <div className="flex items-center gap-2">
        <span className="w-12 shrink-0 text-xs text-fg-muted">{label}</span>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    );
  }
  return (
    <div>
      <p className="mb-1.5 text-xs text-fg-muted">{label}</p>
      {children}
    </div>
  );
}

// One configurable row of the totals block. Deliberately shaped like the row it
// prints (caption left, figure right) so the panel reads as a live preview of
// the sheet: a ticked row here prints on every invoice, with this caption and
// this figure. Nothing hides or renames itself later.
function TotalsRowCard({
  row, resolved, first, last, onPatch, onMove,
}: {
  row: TotalsRow;
  resolved: { label: string; value: string; visible: boolean };
  first: boolean;
  last: boolean;
  onPatch: (p: Partial<TotalsRow>) => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const on = resolved.visible;
  const { t } = useT();
  return (
    <div className={`flex items-center gap-1.5 py-1.5 ${on ? "" : "opacity-55"}`}>
      <Switch
        size="small"
        checked={on}
        onChange={(v) => onPatch({ show: v })}
        aria-label={resolved.label}
      />
      {/* Borderless so eleven rows read as a list, not a form; the hover and
          focus tint is what still says "you can type here". The placeholder is
          lifted to fg-muted because it is not a hint, it is the caption that
          prints when the row is left at its default. */}
      <Input
        size="small"
        variant="borderless"
        className="!px-1 transition-colors placeholder:!text-fg-muted hover:!bg-surface-sunken focus:!bg-surface-sunken"
        value={row.label ?? ""}
        placeholder={resolved.label}
        disabled={!on}
        onChange={(e) => onPatch({ label: e.target.value })}
        aria-label={resolved.label}
      />
      <span className={`tabular shrink-0 text-[11px] ${on ? "text-fg" : "text-fg-subtle"}`}>
        {resolved.value}
      </span>
      <span className="flex shrink-0 items-center gap-0.5">
        {/* A brand-soft chip, not a colour shift: at this size a navy glyph on
            white is indistinguishable from the default ink. */}
        <Tooltip title={t("Bold")}>
          <Button
            size="small" type="text" disabled={!on}
            className={`!h-7 !w-7 !min-w-0 !px-0 ${
              row.emphasis && on ? "!bg-brand-soft !text-brand-soft-foreground" : ""
            }`}
            icon={<Bold className="inline h-3.5 w-3.5" />}
            aria-label={t("Bold")}
            aria-pressed={!!row.emphasis}
            onClick={() => onPatch({ emphasis: !row.emphasis })}
          />
        </Tooltip>
        <Button
          size="small" type="text" className="!h-7 !w-6 !min-w-0 !px-0" disabled={first}
          icon={<ChevronUp className="inline h-3.5 w-3.5" />}
          aria-label={t("Move up")} onClick={() => onMove(-1)}
        />
        <Button
          size="small" type="text" className="!h-7 !w-6 !min-w-0 !px-0" disabled={last}
          icon={<ChevronDown className="inline h-3.5 w-3.5" />}
          aria-label={t("Move down")} onClick={() => onMove(1)}
        />
      </span>
    </div>
  );
}

// The image a `photo` element carries. Uploaded through the same store every
// other image uses, so what lands in the element is a normal /uploads/img/:id
// URL that the JPG/PDF export can read same-origin.
//
// The picture is NOT part of the undo history's coalescing: an upload is a
// deliberate, slow act, so it is committed as its own step and Undo puts the
// previous image back.
function PhotoPicker({
  url, onChange,
}: {
  url: string | null;
  onChange: (url: string | undefined) => void;
}) {
  const [busy, setBusy] = useState(false);
  const { t } = useT();

  const upload = async (file: File) => {
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("image", file);
      const { data } = await api.post<{ url: string }>("/invoice-templates/image", fd);
      onChange(data.url);
    } catch (err) {
      toast.error(apiError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <ImageDropzone
        value={url}
        onSelect={upload}
        onRemove={() => onChange(undefined)}
        busy={busy}
        // Free-form crop: a signature is wide and short, a stamp is square.
        aspectSlider
        className="h-28 w-full"
        fit="contain"
        label={t("Add signature or stamp")}
      />
      {/* <p className="text-xs text-fg-subtle">
        Prints at its own proportions inside the box, never stretched or cropped.
        A picture with a transparent or white background sits best on the sheet.
      </p> */}
    </div>
  );
}

// How a date writes itself out. A pattern is literal text plus # tokens, which
// is what lets one template print "03/09/2026" and another spell the date out in
// Khmer. Three things in one control, because a format string is only usable
// with all three: a preset to start from, the pattern itself, and the result on
// the invoice being previewed. Tokens APPEND on tap rather than inserting at the
// caret: on a tablet the caret is wherever the last tap left it, so appending is
// the only behaviour that is predictable.
function DateFormatEditor({
  pattern, sample, onChange,
}: {
  pattern: string;
  sample: string; // the raw calendar day the canvas is previewing
  onChange: (v: string) => void;
}) {
  const preset = DATE_FORMAT_PRESETS.find((p) => p.pattern === pattern)?.pattern;
  const { t, tl } = useT();
  return (
    <div className="space-y-2">
      <Select
        size="small"
        className="w-full"
        placeholder={t("Custom")}
        value={preset}
        onChange={onChange}
        options={DATE_FORMAT_PRESETS.map((p) => ({ value: p.pattern, label: p.label }))}
      />
      <Input
        size="small"
        value={pattern}
        placeholder={DEFAULT_DATE_FORMAT}
        onChange={(e) => onChange(e.target.value)}
        aria-label={t("Date format")}
      />
      <div className="rounded-md bg-surface-sunken px-2 py-1.5">
        <p className="text-[10px] uppercase tracking-wider text-fg-subtle">{t("Preview")}</p>
        <p className="truncate text-xs text-fg">{formatInvoiceDate(sample, pattern) || "—"}</p>
      </div>
      <div className="flex flex-wrap gap-1">
        {DATE_TOKENS.map((tok) => (
          <Tooltip key={tok.token} title={tl(tok.label)}>
            <button
              type="button"
              onClick={() => onChange(`${pattern}${tok.token}`)}
              className="tabular h-7 cursor-pointer rounded-md border border-line px-1.5 text-[11px] text-fg-muted transition-colors hover:border-line-strong hover:text-fg"
            >
              {tok.token}
            </button>
          </Tooltip>
        ))}
      </div>
    </div>
  );
}

// Property panel for the selected element. Emits partial patches; the editor
// applies them. Controls adapt to the element kind. `data` is the invoice the
// canvas is previewing, so money controls can show their live figures.
export default function ElementProperties({
  el, data, onChange, onDelete,
}: {
  el: TemplateElement | null;
  data: InvoiceData;
  onChange: (patch: Partial<TemplateElement>) => void;
  onDelete: () => void;
}) {
  const { t, tl } = useT();
  if (!el) {
    return (
      <div className="flex min-h-40 flex-col items-center justify-center gap-1.5 px-6 py-12 text-center">
        <MousePointerSquareDashed className="mb-1 h-6 w-6 text-fg-subtle" aria-hidden />
        <p className="text-sm text-fg-muted">{t("Nothing selected")}</p>
      </div>
    );
  }

  const hasType = ["text", "field", "totals", "items"].includes(el.kind);
  const meta = KIND_META[el.kind];
  const KindIcon = meta.icon;

  // Merge one key into a nested label object without dropping the others.
  const setItemLabel = (k: keyof ItemLabels, v: string) =>
    onChange({ itemLabels: { ...el.itemLabels, [k]: v } });
  const setItemCols = (p: Partial<ItemColumns>) =>
    onChange({ itemColumns: { ...DEFAULT_ITEM_COLUMNS, ...el.itemColumns, ...p } });
  const setItemHead = (p: Partial<ItemHeadStyle>) =>
    onChange({ itemHead: { ...DEFAULT_ITEM_HEAD, ...el.itemHead, ...p } });

  // Totals rows: the stored list, or the defaults materialized on first edit.
  const rows = templateRows(el);
  const resolved = resolveTotalsRows(el, data.totals);
  const printing = resolved.filter((r) => r.visible).length;
  const setRows = (next: TotalsRow[]) => onChange({ totalsRows: next });
  const patchRow = (i: number, p: Partial<TotalsRow>) =>
    setRows(rows.map((r, j) => (j === i ? { ...r, ...p } : r)));
  const moveRow = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= rows.length) return;
    const next = [...rows];
    [next[i], next[j]] = [next[j], next[i]];
    setRows(next);
  };

  const cols = { ...DEFAULT_ITEM_COLUMNS, ...el.itemColumns };
  const head = { ...DEFAULT_ITEM_HEAD, ...el.itemHead };
  // Sizing the second line is only a question once a column has one.
  const hasSubLine = ITEM_COLUMN_KEYS.some((c) => (el.itemLabels?.[c.sub] ?? "").trim());
  const color = el.color ?? "#142332";

  return (
    <div className="flex flex-col">
      {/* Identity + the one destructive action, pinned so a long panel keeps
          both in reach while its sections scroll. */}
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-line bg-surface-raised px-3 py-2.5">
        <KindIcon className="h-4 w-4 shrink-0 text-fg-muted" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg">{t(meta.label)}</span>
        <Tooltip title={`${t("Delete")} (Del)`}>
          <Button
            size="small" type="text" danger className="!h-7 !w-7 !min-w-0 !px-0"
            icon={<Trash2 className="inline h-4 w-4" />}
            aria-label={t("Delete")}
            onClick={onDelete}
          />
        </Tooltip>
      </div>

      {el.kind === "text" && (
        <Section title={t("Content")}>
          <Input.TextArea
            rows={3} value={el.text}
            onChange={(e) => onChange({ text: e.target.value })}
          />
        </Section>
      )}

      {el.kind === "field" && (
        <Section title={t("Content")}>
          <Row label={t("Value")}>
            <Select
              value={el.binding} className="w-full" showSearch optionFilterProp="label"
              onChange={(v) => onChange({ binding: v })}
              options={FIELD_BINDINGS.map((b) => ({ value: b.key, label: tl(b.label) }))}
            />
          </Row>
          <Row label={t("Caption")}>
            <Input
              value={el.label}
              onChange={(e) => onChange({ label: e.target.value })}
            />
          </Row>
          {!!el.label && (
            <Segmented
              block value={el.labelPosition ?? "top"}
              onChange={(v) => onChange({ labelPosition: v as LabelPosition })}
              options={[
                { label: t("Caption above"), value: "top" },
                { label: t("One line"), value: "inline" },
              ]}
            />
          )}
          {DATE_BINDINGS.has(el.binding ?? "") && (
            <Row label={t("Date format")}>
              <DateFormatEditor
                pattern={el.dateFormat ?? DEFAULT_DATE_FORMAT}
                sample={data.dates?.issue_date ?? ""}
                onChange={(v) => onChange({ dateFormat: v })}
              />
            </Row>
          )}
        </Section>
      )}

      {el.kind === "photo" && (
        <Section title={t("Picture")}>
          <PhotoPicker
            url={el.imageUrl ?? null}
            onChange={(imageUrl) => onChange({ imageUrl })}
          />
        </Section>
      )}

      {/* Editable column headings so the items table can be translated. Each
          column is one card: its heading, the switch that decides whether it
          prints at all, and an optional second line under the heading (the
          Khmer translation of it, say). Both lines are free text, so putting
          the Khmer first and the English underneath is just a matter of which
          box you type it in. */}
      {el.kind === "items" && (
        <Section title={t("Columns")}>
          <div className="space-y-1.5">
            {([
              ["description", DEFAULT_ITEM_LABELS.description],
              ["rate", DEFAULT_ITEM_LABELS.rate],
              ["qty", DEFAULT_ITEM_LABELS.qty],
              ["total", DEFAULT_ITEM_LABELS.total],
            ] as const).map(([k, fallback]) => {
              // Description always prints, so it alone has no switch.
              const optional = k !== "description";
              const on = !optional || cols[k as "rate" | "qty" | "total"];
              const sub = `${k}2` as const;
              return (
                <div
                  key={k}
                  className="rounded-lg border border-line bg-surface p-2"
                >
                  <div className="flex items-center gap-2">
                    <Input
                      size="small"
                      value={el.itemLabels?.[k] ?? fallback}
                      placeholder={fallback}
                      disabled={!on}
                      onChange={(e) => setItemLabel(k, e.target.value)}
                      aria-label={fallback}
                    />
                    {optional ? (
                      <Switch
                        size="small"
                        checked={on}
                        onChange={(v) => setItemCols({ [k]: v })}
                        aria-label={fallback}
                      />
                    ) : (
                      // Keeps all four headings on one right edge.
                      <span className="w-7 shrink-0" aria-hidden />
                    )}
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <Input
                      size="small"
                      variant="filled"
                      value={el.itemLabels?.[sub] ?? ""}
                      placeholder={t("Second line")}
                      disabled={!on}
                      onChange={(e) => setItemLabel(sub, e.target.value)}
                      aria-label={t("Second line")}
                    />
                    <span className="w-7 shrink-0" aria-hidden />
                  </div>
                </div>
              );
            })}
          </div>
          <Row label={`${t("Description width")} · ${cols.descWidth}%`}>
            <Slider
              min={15} max={90} value={cols.descWidth}
              onChange={(v) => setItemCols({ descWidth: v })}
            />
          </Row>
        </Section>
      )}

      {/* The heading row is set separately from the line-item rows below it:
          the Style section further down describes the ROWS, and a heading that
          followed it would be as large as the data. A bilingual heading needs
          its own size most of all, since Khmer set at the Latin heading size
          reads small. The font family is not repeated here on purpose, so the
          whole table keeps one typeface. */}
      {el.kind === "items" && (
        <Section title={t("Column headings")}>
          <Row label={t("Size")} inline>
            <div className="flex items-center gap-2">
              <Slider
                className="min-w-0 flex-1" min={6} max={28} step={0.5} value={head.fontSize}
                onChange={(v) => setItemHead({ fontSize: v })}
              />
              <InputNumber
                size="small" className="w-14 shrink-0" min={6} max={60} step={0.5}
                value={head.fontSize}
                onChange={(v) => setItemHead({ fontSize: Number(v) || DEFAULT_ITEM_HEAD.fontSize })}
                aria-label={t("Size")}
              />
            </div>
          </Row>
          <Row label={t("Weight")} inline>
            <Segmented
              block size="small" value={head.fontWeight}
              onChange={(v) => setItemHead({ fontWeight: v as TemplateElement["fontWeight"] })}
              options={[
                { label: t("Regular"), value: 400 },
                { label: t("Medium"), value: 500 },
                { label: t("Bold"), value: 700 },
              ]}
            />
          </Row>
          <Row label={t("Color")} inline>
            <div className="flex items-center gap-2">
              <label
                className="relative h-7 w-7 shrink-0 cursor-pointer overflow-hidden rounded-md border border-line"
                style={{ background: head.color }}
              >
                <input
                  type="color" value={head.color}
                  onChange={(e) => setItemHead({ color: e.target.value })}
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                  aria-label={t("Color")}
                />
              </label>
              <Input
                size="small" className="tabular min-w-0 flex-1" value={head.color}
                onChange={(e) => setItemHead({ color: e.target.value })}
                aria-label={t("Color")}
              />
            </div>
          </Row>
          {/* Khmer has no case, so a Khmer heading must be able to turn this
              off; forcing it would only stretch the Latin half of a pair. */}
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-fg-muted">{t("Uppercase")}</span>
            <Switch
              size="small" checked={head.uppercase}
              onChange={(v) => setItemHead({ uppercase: v })}
              aria-label={t("Uppercase")}
            />
          </div>
          {/* The sub-line follows the heading by default, so this only appears
              once a column actually has one to size. */}
          {hasSubLine && (
            <Row label={t("Second line")} inline>
              <div className="flex items-center gap-2">
                <Slider
                  className="min-w-0 flex-1" min={6} max={28} step={0.5}
                  value={subHeadSize(el.itemHead)}
                  onChange={(v) => setItemHead({ subFontSize: v })}
                />
                <InputNumber
                  size="small" className="w-14 shrink-0" min={6} max={60} step={0.5}
                  value={subHeadSize(el.itemHead)}
                  onChange={(v) => setItemHead({ subFontSize: Number(v) || undefined })}
                  aria-label={t("Size")}
                />
              </div>
            </Row>
          )}
        </Section>
      )}

      {/* The totals block is a list the template owns: which rows print, in what
          order, under what caption, and which one closes the block. */}
      {el.kind === "totals" && (
        <Section title={`${t("Rows")} · ${printing}/${rows.length}`}>
          <div className="-my-1 divide-y divide-line">
            {rows.map((r, i) => (
              <TotalsRowCard
                key={r.key}
                row={r}
                resolved={resolved[i]}
                first={i === 0}
                last={i === rows.length - 1}
                onPatch={(p) => patchRow(i, p)}
                onMove={(dir) => moveRow(i, dir)}
              />
            ))}
          </div>
        </Section>
      )}

      {(hasType || el.kind === "line") && (
        <Section title={t("Style")}>
          {hasType && (
            <>
              <Row label={t("Font")} inline>
                <Select
                  value={el.fontFamily ?? "default"} className="w-full" size="small"
                  showSearch optionFilterProp="label"
                  onChange={(v) => onChange({ fontFamily: v })}
                  options={INVOICE_FONTS.map((f) => ({
                    value: f.key,
                    label: f.label,
                    // Preview each family in the dropdown, in the family itself.
                    title: f.label,
                  }))}
                  optionRender={(o) => (
                    <span style={{ fontFamily: fontStack(String(o.value)) }}>{o.label}</span>
                  )}
                />
              </Row>
              <Row label={t("Size")} inline>
                <div className="flex items-center gap-2">
                  <Slider
                    className="min-w-0 flex-1" min={8} max={40} value={el.fontSize ?? 13}
                    onChange={(v) => onChange({ fontSize: v })}
                  />
                  <InputNumber
                    size="small" className="w-14 shrink-0" min={8} max={120}
                    value={el.fontSize ?? 13}
                    onChange={(v) => onChange({ fontSize: Number(v) || 13 })}
                    aria-label={t("Size")}
                  />
                </div>
              </Row>
              <Row label={t("Weight")} inline>
                <Segmented
                  block size="small" value={el.fontWeight ?? 400}
                  onChange={(v) => onChange({ fontWeight: v as TemplateElement["fontWeight"] })}
                  options={[
                    { label: t("Regular"), value: 400 },
                    { label: t("Medium"), value: 500 },
                    { label: t("Bold"), value: 700 },
                  ]}
                />
              </Row>
              <Row label={t("Align")} inline>
                <Segmented
                  block size="small" value={el.align ?? "left"}
                  onChange={(v) => onChange({ align: v as Align })}
                  options={[
                    { label: <AlignLeft className="inline h-3.5 w-3.5" />, value: "left" },
                    { label: <AlignCenter className="inline h-3.5 w-3.5" />, value: "center" },
                    { label: <AlignRight className="inline h-3.5 w-3.5" />, value: "right" },
                  ]}
                />
              </Row>
            </>
          )}
          {/* The swatch IS the picker: the native colour input sits invisibly on
              top of it, so there is no second grey square to explain. */}
          <Row label={t("Color")} inline>
            <div className="flex items-center gap-2">
              <label
                className="relative h-7 w-7 shrink-0 cursor-pointer overflow-hidden rounded-md border border-line"
                style={{ background: color }}
              >
                <input
                  type="color" value={color}
                  onChange={(e) => onChange({ color: e.target.value })}
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                  aria-label={t("Color")}
                />
              </label>
              <Input
                size="small" className="tabular min-w-0 flex-1" value={color}
                onChange={(e) => onChange({ color: e.target.value })}
                aria-label={t("Color")}
              />
            </div>
          </Row>
        </Section>
      )}

      <Section title={t("Position and size")}>
        <div className="grid grid-cols-2 gap-2">
          {([["x", "X"], ["y", "Y"], ["w", "W"], ["h", "H"]] as const).map(([k, label]) => (
            <div key={k} className="flex items-center gap-1.5">
              <span className="w-3 shrink-0 text-[11px] text-fg-subtle">{label}</span>
              <InputNumber
                size="small" className="w-full" value={Math.round(el[k])}
                onChange={(v) => onChange({ [k]: Number(v) || 0 })}
                aria-label={label}
              />
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}
