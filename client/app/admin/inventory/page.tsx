"use client";
import { useCallback, useEffect, useMemo, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  Button, Drawer, Form, Input, InputNumber, Modal, Popconfirm, Select, Switch,
  Table, Upload, Tag,
} from "antd";
import type { UploadFile } from "antd";
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
        (!lowOnly || p.stock_qty <= p.low_stock_alert) &&
        (!q || p.name.toLowerCase().includes(q) || p.barcode?.includes(q) || p.sku?.toLowerCase().includes(q))
    );
  }, [products, search, categoryId, lowOnly]);

  const openCreate = () => {
    setEditing(null);
    setFileList([]);
    form.resetFields();
    form.setFieldsValue({ show_in_menu: true, is_active: true, low_stock_alert: 5, stock_qty: 0, discount_pct: 0 });
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
    });
    setFormOpen(true);
  };

  const submit = async () => {
    const values = await form.validateFields();
    setSaving(true);
    const fd = new FormData();
    Object.entries(values).forEach(([k, v]) => {
      if (v === undefined || v === null) return;
      if (typeof v === "boolean") fd.append(k, v ? "1" : "0");
      else fd.append(k, String(v));
    });
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
              title: "Stock", dataIndex: "stock_qty", width: 110, align: "center",
              sorter: (a, b) => a.stock_qty - b.stock_qty,
              render: (_, p) =>
                p.stock_qty <= 0 ? <StatusBadge status="out" label="Out" />
                : p.stock_qty <= p.low_stock_alert ? <StatusBadge status="low" label={`${p.stock_qty} low`} />
                : <span className="tabular">{p.stock_qty}</span>,
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
                      <Button size="small" type="text" icon={<Boxes className="h-4 w-4" />} title="Adjust stock"
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
        width={620}
        destroyOnHidden={false}
      >
        <Form form={form} layout="vertical" requiredMark={false} className="pt-2">
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
            <Form.Item label="Sell price ($)" name="sell_price" rules={[{ required: true, message: "Required" }]}>
              <InputNumber min={0} step={0.25} className="!w-full" />
            </Form.Item>
            <Form.Item label="Cost price ($)" name="cost_price">
              <InputNumber min={0} step={0.25} className="!w-full" />
            </Form.Item>
            <Form.Item label="Discount %" name="discount_pct">
              <InputNumber min={0} max={100} className="!w-full" />
            </Form.Item>
            {!editing && (
              <Form.Item label="Initial stock" name="stock_qty">
                <InputNumber min={0} className="!w-full" />
              </Form.Item>
            )}
            <Form.Item label="Low stock alert at" name="low_stock_alert">
              <InputNumber min={0} className="!w-full" />
            </Form.Item>
            <Form.Item label="Description" name="description" className="sm:col-span-2">
              <Input.TextArea rows={2} placeholder="Shown on the public menu (optional)" />
            </Form.Item>
          </div>
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
      <Modal open={!!stockProduct} onCancel={() => setStockProduct(null)}
        title={`Adjust stock: ${stockProduct?.name ?? ""}`} onOk={adjustStock} okText="Apply">
        <Form form={stockForm} layout="vertical" requiredMark={false} className="pt-2">
          <Form.Item label="Direction" name="direction">
            <Select options={[
              { value: "in", label: "Stock in (restock)" },
              { value: "out", label: "Stock out (damage, correction)" },
            ]} />
          </Form.Item>
          <Form.Item label="Quantity" name="qty" rules={[{ required: true, message: "Quantity required" }]}>
            <InputNumber min={1} className="!w-full" />
          </Form.Item>
          <Form.Item label="Note" name="note">
            <Input placeholder="Reason (optional)" />
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

export default function InventoryPageWrapper() {
  return (
    <Suspense>
      <InventoryPage />
    </Suspense>
  );
}
