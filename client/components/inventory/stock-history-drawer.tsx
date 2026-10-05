"use client";
import { useEffect, useState } from "react";
import { Drawer } from "antd";
import api from "@/services/api";
import { fmtDate, num } from "@/lib/format";
import type { Product } from "@/lib/types";
import { useT, type TKey } from "@/lib/i18n";

const REASONS: Record<string, TKey> = {
  initial: "Starting stock",
  restock: "Added",
  adjustment: "Adjusted",
  sale: "Sold",
  void: "Voided",
  edit: "Invoice edited",
};

interface StockHistoryDrawerProps {
  /** null = closed */
  product: Product | null;
  onClose: () => void;
}

export function StockHistoryDrawer({
  product,
  onClose,
}: StockHistoryDrawerProps) {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const { t } = useT();

  useEffect(() => {
    if (!product) return;
    setRows([]);
    api
      .get(`/products/${product.id}/stock-history`)
      .then(({ data }) => setRows(data))
      .catch(() => setRows([]));
  }, [product]);

  return (
    <Drawer
      open={!!product}
      onClose={onClose}
      title={product?.name ?? ""}
      size={440}
    >
      <ul className="divide-y divide-line">
        {rows.length === 0 && (
          <p className="py-6 text-center text-sm text-fg-muted">
            {t("No history yet")}
          </p>
        )}
        {rows.map((m) => (
          <li
            key={String(m.id)}
            className="flex items-center justify-between py-2.5 text-sm"
          >
            <div>
              <p className="text-fg">
                {REASONS[String(m.reason)] ? t(REASONS[String(m.reason)]) : String(m.reason)}
                {m.invoice_number ? (
                  <span className="ml-1 font-mono text-xs text-fg-subtle">
                    {String(m.invoice_number)}
                  </span>
                ) : null}
              </p>
              <p className="text-xs text-fg-subtle">
                {fmtDate(String(m.created_at))}
                {m.user_name ? ` · ${m.user_name}` : ""}
                {m.note ? ` · ${m.note}` : ""}
              </p>
            </div>
            <span
              className="tabular font-medium text-fg"
            >
              {Number(m.change_qty) > 0 ? "+" : ""}
              {num(Number(m.change_qty))}{" "}
              <span className="text-xs font-normal text-fg-subtle">
                {product?.base_unit || "pcs"}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </Drawer>
  );
}
