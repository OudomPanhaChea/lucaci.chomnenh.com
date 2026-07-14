"use client";
import { Popconfirm, Table, Tag } from "antd";
import { Boxes, History, PackageOpen, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { money } from "@/lib/format";
import type { Product } from "@/lib/types";

interface ProductTableProps {
  products: Product[];
  loading: boolean;
  canManage: boolean;
  onEdit: (p: Product) => void;
  onDelete: (p: Product) => void;
  onAdjustStock: (p: Product) => void;
  onHistory: (p: Product) => void;
}

export function ProductTable({
  products,
  loading,
  canManage,
  onEdit,
  onDelete,
  onAdjustStock,
  onHistory,
}: ProductTableProps) {
  return (
    <div className="rounded-xl border border-line bg-surface-raised shadow-card">
      <Table<Product>
        rowKey="id"
        loading={loading}
        dataSource={products}
        pagination={{ pageSize: 12, showSizeChanger: false }}
        scroll={{ x: 900 }}
        columns={[
          {
            title: "#",
            dataIndex: "display_number",
            width: 60,
            render: (n) => <span className="tabular text-fg-subtle">{n}</span>,
          },
          {
            title: "Product",
            dataIndex: "name",
            render: (_, p) => (
              <div className="flex items-center gap-3">
                {p.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.image_url}
                    alt={p.name}
                    className="h-10 w-10 rounded-lg object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-surface-sunken">
                    <PackageOpen className="h-4.5 w-4.5 text-fg-subtle" />
                  </div>
                )}
                <div>
                  <p className="font-medium text-fg">{p.name}</p>
                  <p className="font-mono text-xs text-fg-subtle">
                    {p.barcode || p.sku || ""}
                  </p>
                </div>
              </div>
            ),
          },
          {
            title: "Category",
            dataIndex: "category_name",
            width: 130,
            render: (v) => v || <span className="text-fg-subtle">None</span>,
          },
          {
            title: "Price",
            dataIndex: "sell_price",
            width: 120,
            align: "right",
            render: (_, p) => (
              <div className="tabular">
                <span className="font-medium">
                  {money(p.sell_price * (1 - p.discount_pct / 100))}
                </span>
                {p.discount_pct > 0 && (
                  <p className="text-xs text-fg-subtle">
                    <s>{money(p.sell_price)}</s> -{p.discount_pct}%
                  </p>
                )}
              </div>
            ),
          },
          {
            title: "Stock",
            dataIndex: "stock_qty",
            width: 130,
            align: "center",
            sorter: (a, b) =>
              (a.stock_qty ?? Number.MAX_SAFE_INTEGER) -
              (b.stock_qty ?? Number.MAX_SAFE_INTEGER),
            render: (_, p) => {
              if (p.stock_qty === null)
                return (
                  <span className="text-xs text-fg-subtle">Not tracked</span>
                );
              if (p.stock_qty <= 0)
                return <StatusBadge status="out" label="Out" />;
              if (p.stock_qty <= p.low_stock_alert)
                return (
                  <StatusBadge status="low" label={`${p.stock_qty} low`} />
                );
              // Show the biggest bulk unit the count fits into, e.g. "48 pcs" + "4 × Box of 12"
              const unit = [...(p.units ?? [])]
                .filter((u) => u.factor > 1 && p.stock_qty! >= u.factor)
                .sort((a, b) => b.factor - a.factor)[0];
              return (
                <div className="tabular">
                  {p.stock_qty}
                  {unit && (
                    <p className="text-xs text-fg-subtle">
                      {Math.floor(p.stock_qty / unit.factor)} × {unit.name}
                    </p>
                  )}
                </div>
              );
            },
          },
          {
            title: "Status",
            width: 120,
            render: (_, p) => (
              <div className="flex flex-wrap gap-1">
                <StatusBadge status={p.is_active ? "active" : "inactive"} />
                {!!p.show_in_menu && <Tag className="!m-0">Menu</Tag>}
              </div>
            ),
          },
          ...(canManage
            ? [
                {
                  title: "",
                  key: "actions",
                  width: 160,
                  align: "right" as const,
                  render: (_: unknown, p: Product) => (
                    <div className="flex justify-end gap-1">
                      <Button
                        size="small"
                        type="text"
                        icon={<History className="h-4 w-4" />}
                        title="Stock history"
                        onClick={() => onHistory(p)}
                      />
                      <Button
                        size="small"
                        type="text"
                        icon={<Boxes className="h-4 w-4" />}
                        title={
                          p.stock_qty === null
                            ? "This product does not track stock"
                            : "Adjust stock"
                        }
                        disabled={p.stock_qty === null}
                        onClick={() => onAdjustStock(p)}
                      />
                      <Button
                        size="small"
                        type="text"
                        icon={<Pencil className="h-4 w-4" />}
                        title="Edit"
                        onClick={() => onEdit(p)}
                      />
                      <Popconfirm
                        title={`Delete "${p.name}"?`}
                        description="Past invoices keep their history."
                        onConfirm={() => onDelete(p)}
                      >
                        <Button
                          size="small"
                          type="text"
                          danger
                          icon={<Trash2 className="h-4 w-4" />}
                          title="Delete"
                        />
                      </Popconfirm>
                    </div>
                  ),
                },
              ]
            : []),
        ]}
      />
    </div>
  );
}
