"use client";
import { Dropdown, Tooltip } from "antd";
import { ArrowUpDown, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PRODUCT_SORTS, type ProductSortKey } from "@/lib/product-sort";

// Sort picker for the POS and inventory product lists: an icon button opening
// the shared sort options, the active one ticked. The parent persists the
// choice via lib/product-sort so it survives reloads.
export default function ProductSortMenu({
  value,
  onChange,
  size,
}: {
  value: ProductSortKey;
  onChange: (key: ProductSortKey) => void;
  size?: "large" | "middle";
}) {
  return (
    <Dropdown
      trigger={["click"]}
      menu={{
        items: PRODUCT_SORTS.map((s) => ({
          key: s.key,
          label: (
            <span className="flex min-w-40 items-center justify-between gap-3 py-0.5">
              {s.label}
              {value === s.key && <Check className="h-4 w-4 text-brand" />}
            </span>
          ),
        })),
        onClick: ({ key }) => onChange(key as ProductSortKey),
      }}
    >
      <Tooltip title="Sort products">
        <Button
          size={size}
          aria-label="Sort products"
          icon={<ArrowUpDown className="h-4 w-4" />}
        />
      </Tooltip>
    </Dropdown>
  );
}
