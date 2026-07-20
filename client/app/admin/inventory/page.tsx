"use client";
import { useCallback, useEffect, useMemo, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Input, Select, Switch } from "antd";
import { Button } from "@/components/ui/button";
import { toast } from "react-toastify";
import { Plus, Layers } from "lucide-react";
import api, { apiError } from "@/services/api";
import { useRealtime } from "@/hooks/useRealtime";
import { useAuth } from "@/hooks/useAuth";
import { SectionHeader } from "@/components/ui/section-header";
import ProductSortMenu from "@/components/product-sort-menu";
import {
  sortProducts,
  readStoredSort,
  storeSort,
  type ProductSortKey,
} from "@/lib/product-sort";
import { ProductTable } from "@/components/inventory/product-table";
import { ProductFormModal } from "@/components/inventory/product-form-modal";
import { CategoriesDrawer } from "@/components/inventory/categories-drawer";
import { StockAdjustModal } from "@/components/inventory/stock-adjust-modal";
import { StockHistoryDrawer } from "@/components/inventory/stock-history-drawer";
import type { Product, Category } from "@/lib/types";

function InventoryPage() {
  const { user } = useAuth();
  const canManage = user?.role === "owner" || user?.role === "admin";
  const params = useSearchParams();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [lowOnly, setLowOnly] = useState(params.get("low_stock") === "1");
  // "newest" mirrors the API's display_number DESC order, so nothing moves
  // until the user actually picks a sort; the pick is remembered per page.
  const [sort, setSort] = useState<ProductSortKey>("newest");
  useEffect(() => {
    setSort(readStoredSort("inventory", "newest"));
  }, []);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [catsOpen, setCatsOpen] = useState(false);
  const [stockProduct, setStockProduct] = useState<Product | null>(null);
  const [historyProduct, setHistoryProduct] = useState<Product | null>(null);

  const load = useCallback(() => {
    Promise.all([api.get("/products"), api.get("/categories")])
      .then(([p, c]) => {
        setProducts(p.data);
        setCategories(c.data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);
  useRealtime(["product:changed"], load);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sortProducts(
      products.filter(
        (p) =>
          (!categoryId || p.category_id === categoryId) &&
          (!lowOnly ||
            (p.stock_qty !== null && p.stock_qty <= p.low_stock_alert)) &&
          (!q ||
            p.name.toLowerCase().includes(q) ||
            p.barcode?.includes(q) ||
            p.sku?.toLowerCase().includes(q)),
      ),
      sort,
    );
  }, [products, search, categoryId, lowOnly, sort]);

  const removeProduct = async (p: Product) => {
    try {
      await api.delete(`/products/${p.id}`);
      toast.success("Product deleted");
      load();
    } catch (err) {
      toast.error(apiError(err));
    }
  };

  return (
    <div>
      <SectionHeader
        title="Inventory"
        subtitle={`${products.length} products`}
        actions={
          canManage && (
            <>
              <Button
                icon={<Layers className="h-4 w-4" />}
                onClick={() => setCatsOpen(true)}
              >
                Categories
              </Button>
              <Button
                type="primary"
                icon={<Plus className="h-4 w-4" />}
                onClick={() => {
                  setEditing(null);
                  setFormOpen(true);
                }}
              >
                Add product
              </Button>
            </>
          )
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input
          allowClear
          className="!w-64"
          placeholder="Search name, barcode, SKU"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select
          allowClear
          showSearch
          optionFilterProp="label"
          className="!w-44"
          placeholder="All categories"
          value={categoryId ?? undefined}
          onChange={(v) => setCategoryId(v ?? null)}
          options={categories.map((c) => ({ value: c.id, label: c.name }))}
        />
        <ProductSortMenu
          value={sort}
          onChange={(k) => {
            setSort(k);
            storeSort("inventory", k);
          }}
        />
        <label className="flex cursor-pointer items-center gap-2 text-sm text-fg-muted">
          <Switch size="small" checked={lowOnly} onChange={setLowOnly} /> Low
          stock only
        </label>
      </div>

      <ProductTable
        products={filtered}
        loading={loading}
        canManage={canManage}
        onEdit={(p) => {
          setEditing(p);
          setFormOpen(true);
        }}
        onDelete={removeProduct}
        onAdjustStock={setStockProduct}
        onHistory={setHistoryProduct}
      />

      <ProductFormModal
        open={formOpen}
        editing={editing}
        categories={categories}
        onClose={() => setFormOpen(false)}
        onSaved={load}
        onCategoryCreated={(c) =>
          setCategories((prev) => [...prev, { ...c, product_count: 0 }])
        }
      />

      <CategoriesDrawer
        open={catsOpen}
        categories={categories}
        onClose={() => setCatsOpen(false)}
        onChanged={load}
      />

      <StockAdjustModal
        product={stockProduct}
        onClose={() => setStockProduct(null)}
        onSaved={load}
      />

      <StockHistoryDrawer
        product={historyProduct}
        onClose={() => setHistoryProduct(null)}
      />
    </div>
  );
}

export default function InventoryPageWrapper() {
  return (
    <Suspense>
      <InventoryPage />
    </Suspense>
  );
}
