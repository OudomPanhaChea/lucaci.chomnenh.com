"use client";
import { useCallback, useEffect, useMemo, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  Drawer, Form, Input, InputNumber, Modal, Popconfirm, Segmented,
  Select, Switch, Table, Upload, Tag,
} from "antd";
import type { UploadFile } from "antd";
import { Button } from "@/components/ui/button";
import { toast } from "react-toastify";
import {
  Plus, ScanBarcode, Pencil, Trash2, Boxes, PackageOpen, Layers, History,
} from "lucide-react";
import api, { apiError } from "@/services/api";
import { validateImageFile } from "@/lib/images";
import { useRealtime } from "@/hooks/useRealtime";
import { useAuth } from "@/hooks/useAuth";
import BarcodeScanner from "@/components/barcode-scanner";
import { SectionHeader } from "@/components/ui/section-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { money, fmtDate } from "@/lib/format";
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

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [saving, setSaving] = useState(false);
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [scanOpen, setScanOpen] = useState(false);
  const [catsOpen, setCatsOpen] = useState(false);
  const [stockProduct, setStockProduct] = useState<Product | null>(null);
  const [historyProduct, setHistoryProduct] = useState<Product | null>(null);
  const [historyRows, setHistoryRows] = useState<Record<string, unknown>[]>([]);
  const [form] = Form.useForm();
  const [catForm] = Form.useForm();
  const [stockForm] = Form.useForm();

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
    return products.filter(
      (p) =>
        (!categoryId || p.category_id === categoryId) &&
        (!lowOnly || (p.stock_qty !== null && p.stock_qty <= p.low_stock_alert)) &&
        (!q || p.name.toLowerCase().includes(q) || p.barcode?.includes(q) || p.sku?.toLowerCase().includes(q))
    );
  }, [products, search, categoryId, lowOnly]);

  const openCreate = () => {
    setEditing(null);
    setFileList([]);
    form.resetFields();
    form.setFieldsValue({
      show_in_menu: true, is_active: true, low_stock_alert: 5,
      stock_qty: 0, discount_pct: 0, track_stock: true, units: [],
    });
    setFormOpen(true);
  };

  const openEdit = (p: Product) => {
    setEditing(p);
    setFileList(p.image_url ? [{ uid: "-1", name: "current", status: "done", url: p.image_url }] : []);
    form.setFieldsValue({
      ...p,
      show_in_menu: !!p.show_in_menu,
      is_active: !!p.is_active,
      category_id: p.category_id ?? undefined,
      track_stock: p.stock_qty !== null,
      stock_qty: p.stock_qty ?? 0,
      units: (p.units ?? []).map((u) => ({
        name: u.name, factor: u.factor, sell_price: u.sell_price, barcode: u.barcode ?? undefined,
      })),
    });
    setFormOpen(true);
  };

  const submit = async () => {
    const values = await form.validateFields();
    setSaving(true);
    const fd = new FormData();
    const { units, ...fields } = values;
    Object.entries(fields).forEach(([k, v]) => {
      if (v === undefined || v === null) return;
      if (typeof v === "boolean") fd.append(k, v ? "1" : "0");
      else fd.append(k, String(v));
    });
    fd.append("units", JSON.stringify(units ?? []));
    const newFile = fileList.find((f) => f.originFileObj);
    if (newFile?.originFileObj) fd.append("image", newFile.originFileObj);
    if (editing && editing.image_url && fileList.length === 0) fd.append("remove_image", "1");
    try {
      if (editing) {
        await api.put(`/products/${editing.id}`, fd);
        toast.success("Product updated");
      } else {
        await api.post("/products", fd);
        toast.success("Product created");
      }
      setFormOpen(false);
      load();
    } catch (err) {
      toast.error(apiError(err));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (p: Product) => {
    try {
      await api.delete(`/products/${p.id}`);
      toast.success("Product deleted");
      load();
    } catch (err) {
      toast.error(apiError(err));
    }
  };

  const adjustStock = async () => {
    const { direction, qty, note } = await stockForm.validateFields();
    try {
      await api.post(`/products/${stockProduct!.id}/adjust-stock`, {
        change_qty: direction === "in" ? qty : -qty,
        note,
      });
      toast.success("Stock updated");
      setStockProduct(null);
      stockForm.resetFields();
      load();
    } catch (err) {
      toast.error(apiError(err));
    }
  };

  const openHistory = async (p: Product) => {
    setHistoryProduct(p);
    try {
      const { data } = await api.get(`/products/${p.id}/stock-history`);
      setHistoryRows(data);
    } catch {
      setHistoryRows([]);
    }
  };

  const saveCategory = async (values: { name: string }) => {
    try {
      await api.post("/categories", values);
      catForm.resetFields();
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
              <Button icon={<Layers className="h-4 w-4" />} onClick={() => setCatsOpen(true)}>
                Categories
              </Button>
              <Button type="primary" icon={<Plus className="h-4 w-4" />} onClick={openCreate}>
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
          className="!w-44"
          placeholder="All categories"
          value={categoryId ?? undefined}
          onChange={(v) => setCategoryId(v ?? null)}
          options={categories.map((c) => ({ value: c.id, label: c.name }))}
        />
        <label className="flex cursor-pointer items-center gap-2 text-sm text-fg-muted">
          <Switch size="small" checked={lowOnly} onChange={setLowOnly} /> Low stock only
        </label>
      </div>

      <div className="rounded-xl border border-line bg-surface-raised shadow-card">
        <Table<Product>
          rowKey="id"
          loading={loading}
          dataSource={filtered}
          pagination={{ pageSize: 12, showSizeChanger: false }}
          scroll={{ x: 900 }}
          columns={[
            {
              title: "#", dataIndex: "display_number", width: 60,
              render: (n) => <span className="tabular text-fg-subtle">{n}</span>,
            },
            {
              title: "Product", dataIndex: "name",
              render: (_, p) => (
                <div className="flex items-center gap-3">
                  {p.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.image_url} alt={p.name} className="h-10 w-10 rounded-lg object-cover" loading="lazy" />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-surface-sunken">
                      <PackageOpen className="h-4.5 w-4.5 text-fg-subtle" />
                    </div>
                  )}
                  <div>
                    <p className="font-medium text-fg">{p.name}</p>
                    <p className="font-mono text-xs text-fg-subtle">{p.barcode || p.sku || ""}</p>
                  </div>
                </div>
              ),
            },
            { title: "Category", dataIndex: "category_name", width: 130, render: (v) => v || <span className="text-fg-subtle">None</span> },
            {
              title: "Price", dataIndex: "sell_price", width: 120, align: "right",
              render: (_, p) => (
                <div className="tabular">
                  <span className="font-medium">{money(p.sell_price * (1 - p.discount_pct / 100))}</span>
                  {p.discount_pct > 0 && (
                    <p className="text-xs text-fg-subtle"><s>{money(p.sell_price)}</s> -{p.discount_pct}%</p>
                  )}
                </div>
              ),
            },
            {
              title: "Stock", dataIndex: "stock_qty", width: 130, align: "center",
              sorter: (a, b) =>
                (a.stock_qty ?? Number.MAX_SAFE_INTEGER) - (b.stock_qty ?? Number.MAX_SAFE_INTEGER),
              render: (_, p) => {
                if (p.stock_qty === null) return <span className="text-xs text-fg-subtle">Not tracked</span>;
                if (p.stock_qty <= 0) return <StatusBadge status="out" label="Out" />;
                if (p.stock_qty <= p.low_stock_alert) return <StatusBadge status="low" label={`${p.stock_qty} low`} />;
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
              title: "Status", width: 120,
              render: (_, p) => (
                <div className="flex flex-wrap gap-1">
                  <StatusBadge status={p.is_active ? "active" : "inactive"} />
                  {!!p.show_in_menu && <Tag className="!m-0">Menu</Tag>}
                </div>
              ),
            },
            ...(canManage
              ? [{
                  title: "", key: "actions", width: 160, align: "right" as const,
                  render: (_: unknown, p: Product) => (
                    <div className="flex justify-end gap-1">
                      <Button size="small" type="text" icon={<History className="h-4 w-4" />} title="Stock history"
                        onClick={() => openHistory(p)} />
                      <Button size="small" type="text" icon={<Boxes className="h-4 w-4" />}
                        title={p.stock_qty === null ? "This product does not track stock" : "Adjust stock"}
                        disabled={p.stock_qty === null}
                        onClick={() => { setStockProduct(p); stockForm.setFieldsValue({ direction: "in", qty: 1 }); }} />
                      <Button size="small" type="text" icon={<Pencil className="h-4 w-4" />} title="Edit"
                        onClick={() => openEdit(p)} />
                      <Popconfirm title={`Delete "${p.name}"?`} description="Past invoices keep their history."
                        onConfirm={() => remove(p)}>
                        <Button size="small" type="text" danger icon={<Trash2 className="h-4 w-4" />} title="Delete" />
                      </Popconfirm>
                    </div>
                  ),
                }]
              : []),
          ]}
        />
      </div>

      {/* ── Product form ── */}
      <Modal
        open={formOpen}
        onCancel={() => setFormOpen(false)}
        title={editing ? `Edit ${editing.name}` : "Add product"}
        onOk={submit}
        okText={editing ? "Save changes" : "Create product"}
        confirmLoading={saving}
        width={640}
        centered
        styles={{ body: { maxHeight: "70vh", overflowY: "auto", overflowX: "hidden", paddingRight: 8 } }}
        destroyOnHidden={false}
      >
        <Form form={form} layout="vertical" requiredMark={false} className="pt-1">
          <FormSection title="Details" first />
          <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
            <Form.Item label="Name" name="name" rules={[{ required: true, message: "Product name is required" }]}
              className="sm:col-span-2">
              <Input placeholder="Product name" />
            </Form.Item>
            <Form.Item label="Barcode" name="barcode">
              <Input
                placeholder="Scan or type barcode"
                suffix={
                  <button type="button" aria-label="Scan barcode with camera" onClick={() => setScanOpen(true)}
                    className="cursor-pointer text-fg-subtle transition-colors duration-200 hover:text-fg">
                    <ScanBarcode className="h-4 w-4" />
                  </button>
                }
              />
            </Form.Item>
            <Form.Item label="SKU" name="sku">
              <Input placeholder="Internal code (optional)" />
            </Form.Item>
            <Form.Item label="Category" name="category_id">
              <Select allowClear placeholder="Select category"
                options={categories.map((c) => ({ value: c.id, label: c.name }))} />
            </Form.Item>
            <Form.Item label="Description" name="description" className="sm:col-span-2">
              <Input.TextArea rows={2} placeholder="Shown on the public menu (optional)" />
            </Form.Item>
          </div>

          <FormSection title="Pricing" />
          <div className="grid grid-cols-2 gap-x-4 sm:grid-cols-3">
            <Form.Item label="Sell price ($)" name="sell_price" rules={[{ required: true, message: "Required" }]}>
              <InputNumber min={0} step={0.25} className="!w-full" />
            </Form.Item>
            <Form.Item label="Cost price ($)" name="cost_price">
              <InputNumber min={0} step={0.25} className="!w-full" />
            </Form.Item>
            <Form.Item label="Discount %" name="discount_pct">
              <InputNumber min={0} max={100} className="!w-full" />
            </Form.Item>
          </div>

          <FormSection title="Stock" />
          <div className="flex items-center justify-between gap-4 rounded-lg border border-line px-3 py-2.5">
            <div>
              <p className="text-sm font-medium text-fg">Track stock</p>
              <p className="text-xs text-fg-subtle">
                Off: the product never runs out and skips low-stock alerts
              </p>
            </div>
            <Form.Item name="track_stock" valuePropName="checked" className="!mb-0">
              <Switch />
            </Form.Item>
          </div>
          <Form.Item noStyle shouldUpdate={(a, b) => a.track_stock !== b.track_stock}>
            {({ getFieldValue }) =>
              getFieldValue("track_stock") ? (
                <div className="mt-3 grid grid-cols-2 gap-x-4">
                  {(!editing || editing.stock_qty === null) && (
                    <Form.Item label={editing ? "Starting stock" : "Initial stock"} name="stock_qty">
                      <InputNumber min={0} className="!w-full" />
                    </Form.Item>
                  )}
                  <Form.Item label="Low stock alert at" name="low_stock_alert">
                    <InputNumber min={0} className="!w-full" />
                  </Form.Item>
                </div>
              ) : null
            }
          </Form.Item>

          {/* Bulk units for partner/wholesale sales: own price + carton barcode,
              stock still counted in pieces */}
          <FormSection title="Bulk units (wholesale)"
            hint="Sell by the box or case at its own price. Stock is still counted in pieces." />
          <Form.List name="units">
            {(fields, { add, remove: removeRow }) => (
              <div className="space-y-2">
                {fields.length > 0 && (
                  <div className="grid grid-cols-[minmax(0,1fr)_84px_96px_minmax(0,1fr)_28px] gap-2 text-[11px] font-medium uppercase tracking-wide text-fg-subtle">
                    <span>Unit name</span>
                    <span>Pieces</span>
                    <span>Price</span>
                    <span>Carton barcode</span>
                    <span />
                  </div>
                )}
                {fields.map((field) => (
                  <div key={field.key} className="grid grid-cols-[minmax(0,1fr)_84px_96px_minmax(0,1fr)_28px] items-start gap-2">
                    <Form.Item name={[field.name, "name"]} className="!mb-0"
                      rules={[{ required: true, message: "Name" }]}>
                      <Input placeholder="Box of 12" />
                    </Form.Item>
                    <Form.Item name={[field.name, "factor"]} className="!mb-0"
                      rules={[{ required: true, message: "Pcs" }]}>
                      <InputNumber min={1} precision={0} placeholder="Pcs" className="!w-full" title="Pieces per unit" />
                    </Form.Item>
                    <Form.Item name={[field.name, "sell_price"]} className="!mb-0"
                      rules={[{ required: true, message: "Price" }]}>
                      <InputNumber min={0} step={0.25} prefix="$" placeholder="Price" className="!w-full" />
                    </Form.Item>
                    <Form.Item name={[field.name, "barcode"]} className="!mb-0">
                      <Input placeholder="Optional" />
                    </Form.Item>
                    <Button type="text" danger icon={<Trash2 className="h-4 w-4" />}
                      onClick={() => removeRow(field.name)} aria-label="Remove unit" />
                  </div>
                ))}
                {fields.length === 0 && (
                  <p className="text-xs text-fg-subtle">
                    No bulk units. Add one to sell this product by the box or case at its own price.
                  </p>
                )}
                <Button size="small" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => add({ factor: 1 })}>
                  Add unit
                </Button>
              </div>
            )}
          </Form.List>

          <FormSection title="Image and visibility" />
          <div className="flex flex-wrap items-center gap-6">
            <Upload
              listType="picture-card"
              maxCount={1}
              fileList={fileList}
              beforeUpload={(file) => (validateImageFile(file) ? false : Upload.LIST_IGNORE)}
              onChange={({ fileList }) => setFileList(fileList)}
              accept="image/*"
            >
              {fileList.length === 0 && <span className="text-xs">Image</span>}
            </Upload>
            <Form.Item label="Show in public menu" name="show_in_menu" valuePropName="checked" className="!mb-0">
              <Switch />
            </Form.Item>
            <Form.Item label="Active (sellable)" name="is_active" valuePropName="checked" className="!mb-0">
              <Switch />
            </Form.Item>
          </div>
        </Form>
      </Modal>

      <BarcodeScanner open={scanOpen} onClose={() => setScanOpen(false)}
        onScan={(code) => { form.setFieldsValue({ barcode: code }); toast.success(`Barcode captured: ${code}`); }} />

      {/* ── Categories drawer ── */}
      <Drawer open={catsOpen} onClose={() => setCatsOpen(false)} title="Categories" size={380}>
        <Form form={catForm} onFinish={saveCategory} className="mb-4 flex gap-2">
          <Form.Item name="name" className="!mb-0 flex-1" rules={[{ required: true, message: "Name required" }]}>
            <Input placeholder="New category name" />
          </Form.Item>
          <Button type="primary" htmlType="submit">Add</Button>
        </Form>
        <ul className="divide-y divide-line">
          {categories.map((c) => (
            <li key={c.id} className="flex items-center justify-between py-2.5">
              <span className="text-fg">{c.name}
                <span className="ml-2 text-xs text-fg-subtle">{c.product_count} products</span>
              </span>
              <Popconfirm title={`Delete "${c.name}"?`} description="Products keep existing but lose this category."
                onConfirm={async () => {
                  try { await api.delete(`/categories/${c.id}`); load(); }
                  catch (err) { toast.error(apiError(err)); }
                }}>
                <Button size="small" type="text" danger icon={<Trash2 className="h-4 w-4" />} />
              </Popconfirm>
            </li>
          ))}
        </ul>
      </Drawer>

      {/* ── Stock adjust ── */}
      <Modal open={!!stockProduct} onCancel={() => setStockProduct(null)} centered width={420}
        title={`Adjust stock: ${stockProduct?.name ?? ""}`} onOk={adjustStock} okText="Apply">
        <div className="mb-4 mt-2 rounded-lg bg-surface-sunken p-3 text-center">
          <p className="text-xs text-fg-subtle">Current stock</p>
          <p className="tabular text-2xl font-semibold text-fg">{stockProduct?.stock_qty ?? 0} pcs</p>
        </div>
        <Form form={stockForm} layout="vertical" requiredMark={false}>
          <Form.Item name="direction">
            <Segmented block options={[
              { value: "in", label: "Stock in (restock)" },
              { value: "out", label: "Stock out (damage)" },
            ]} />
          </Form.Item>
          <Form.Item label="Quantity" name="qty" rules={[{ required: true, message: "Quantity required" }]}>
            <InputNumber min={1} className="!w-full" autoFocus />
          </Form.Item>
          <Form.Item label="Note" name="note" className="!mb-2">
            <Input placeholder="Reason (optional)" />
          </Form.Item>
          <Form.Item noStyle shouldUpdate>
            {({ getFieldValue }) => {
              const qty = Number(getFieldValue("qty")) || 0;
              if (!stockProduct || qty <= 0) return null;
              const next = (stockProduct.stock_qty ?? 0) + (getFieldValue("direction") === "in" ? qty : -qty);
              return next < 0 ? (
                <p className="text-sm text-rose-600 dark:text-rose-400">
                  This would take stock below zero.
                </p>
              ) : (
                <p className="text-sm text-fg-muted">
                  After applying: <span className="tabular font-medium text-fg">{next} pcs</span>
                </p>
              );
            }}
          </Form.Item>
        </Form>
      </Modal>

      {/* ── Stock history ── */}
      <Drawer open={!!historyProduct} onClose={() => setHistoryProduct(null)}
        title={`Stock history: ${historyProduct?.name ?? ""}`} size={440}>
        <ul className="divide-y divide-line">
          {historyRows.length === 0 && <p className="py-6 text-center text-sm text-fg-muted">No movements yet.</p>}
          {historyRows.map((m) => (
            <li key={String(m.id)} className="flex items-center justify-between py-2.5 text-sm">
              <div>
                <p className="capitalize text-fg">
                  {String(m.reason)}
                  {m.invoice_number ? <span className="ml-1 font-mono text-xs text-fg-subtle">{String(m.invoice_number)}</span> : null}
                </p>
                <p className="text-xs text-fg-subtle">
                  {fmtDate(String(m.created_at))}{m.user_name ? ` by ${m.user_name}` : ""}
                  {m.note ? ` · ${m.note}` : ""}
                </p>
              </div>
              <span className={`tabular font-medium ${Number(m.change_qty) > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                {Number(m.change_qty) > 0 ? "+" : ""}{String(m.change_qty)}
              </span>
            </li>
          ))}
        </ul>
      </Drawer>
    </div>
  );
}

// Labeled divider that splits the long product form into scannable groups
function FormSection({ title, hint, first }: { title: string; hint?: string; first?: boolean }) {
  return (
    <div className={`mb-3 border-b border-line pb-1.5 ${first ? "" : "mt-5"}`}>
      <p className="text-xs font-semibold uppercase tracking-wider text-fg-subtle">{title}</p>
      {hint && <p className="mt-0.5 text-xs normal-case tracking-normal text-fg-subtle">{hint}</p>}
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
