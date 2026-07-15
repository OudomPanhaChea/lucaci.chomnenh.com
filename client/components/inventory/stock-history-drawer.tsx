"use client";
import { useEffect, useState } from "react";
import { Drawer } from "antd";
import api from "@/services/api";
import { fmtDate, num } from "@/lib/format";
import type { Product } from "@/lib/types";

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
      title={`Stock history: ${product?.name ?? ""}`}
      size={440}
    >
      <ul className="divide-y divide-line">
        {rows.length === 0 && (
          <p className="py-6 text-center text-sm text-fg-muted">
            No movements yet.
          </p>
        )}
        {rows.map((m) => (
          <li
            key={String(m.id)}
            className="flex items-center justify-between py-2.5 text-sm"
          >
            <div>
              <p className="capitalize text-fg">
                {String(m.reason)}
                {m.invoice_number ? (
                  <span className="ml-1 font-mono text-xs text-fg-subtle">
                    {String(m.invoice_number)}
                  </span>
                ) : null}
              </p>
              <p className="text-xs text-fg-subtle">
                {fmtDate(String(m.created_at))}
                {m.user_name ? ` by ${m.user_name}` : ""}
                {m.note ? ` · ${m.note}` : ""}
              </p>
            </div>
            <span
              className={`tabular font-medium ${Number(m.change_qty) > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}
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
