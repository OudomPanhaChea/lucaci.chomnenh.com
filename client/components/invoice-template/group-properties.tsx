"use client";
import { Boxes, Trash2 } from "lucide-react";
import { Tooltip } from "antd";
import { Button } from "@/components/ui/button";
import { KIND_META } from "./element-toolbar";
import type { TemplateElement } from "./types";
import { useT } from "@/lib/i18n";

// What the property panel shows while SEVERAL elements are selected.
//
// It deliberately offers no styling controls. Eight elements have eight fonts,
// sizes and colours, so any single control here would have to either invent an
// answer to "what colour is this" or silently overwrite seven values the user
// never looked at. A group exists to be MOVED (drag it, or nudge it with the
// arrow keys) and to be removed, so those are what it says and what it does.
export default function GroupProperties({
  elements,
  onClear,
  onDelete,
}: {
  elements: TemplateElement[];
  onClear: () => void;
  onDelete: () => void;
}) {
  // What is in the group, counted by kind ("2 fields, 1 line"), so the panel
  // names the selection rather than only sizing it.
  const { t } = useT();
  const counts = new Map<TemplateElement["kind"], number>();
  for (const el of elements) counts.set(el.kind, (counts.get(el.kind) ?? 0) + 1);

  return (
    <div className="flex flex-col">
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-line bg-surface-raised px-3 py-2.5">
        <Boxes className="h-4 w-4 shrink-0 text-fg-muted" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg">
          {t("{n} selected", { n: elements.length })}
        </span>
        <Tooltip title={`${t("Delete")} (Del)`}>
          <Button
            size="small" type="text" danger className="!h-7 !w-7 !min-w-0 !px-0"
            icon={<Trash2 className="inline h-4 w-4" />}
            aria-label={t("Delete")}
            onClick={onDelete}
          />
        </Tooltip>
      </div>

      <section className="border-t border-line px-3 py-3 first:border-t-0">
        <h4 className="mb-2.5 text-[10px] font-semibold uppercase tracking-wider text-fg-subtle">
          {t("Selected")}
        </h4>
        <ul className="space-y-1.5">
          {[...counts].map(([kind, n]) => {
            const meta = KIND_META[kind];
            const Icon = meta.icon;
            return (
              <li key={kind} className="flex items-center gap-2 text-sm text-fg-muted">
                <Icon className="h-3.5 w-3.5 shrink-0 text-fg-subtle" aria-hidden />
                <span className="min-w-0 flex-1 truncate">{t(meta.label)}</span>
                <span className="tabular shrink-0 text-fg">{n}</span>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="border-t border-line px-3 py-3">
        {/* <h4 className="mb-2.5 text-[10px] font-semibold uppercase tracking-wider text-fg-subtle">
          Moving them
        </h4> */}
        {/* <p className="text-xs leading-relaxed text-fg-subtle">
          Drag any one of them to move the whole group, or nudge with the arrow
          keys. Hold Shift for a bigger step. Ctrl+click an element to drop it
          out of the group; click it on its own to keep only that one.
        </p> */}
        <Button
          htmlType="button"
          size="small"
          className="mt-3"
          onClick={onClear}
        >
          {t("Clear selection")}
        </Button>
      </section>

      {/* <section className="border-t border-line px-3 py-3">
        <h4 className="mb-2.5 text-[10px] font-semibold uppercase tracking-wider text-fg-subtle">
          Styling
        </h4>
        <p className="text-xs leading-relaxed text-fg-subtle">
          Select a single element to change its font, size, colour or content.
        </p>
      </section> */}
    </div>
  );
}
