"use client";
import { useEffect, useState } from "react";
import { AutoComplete, Form, Input, Modal, Select, Switch } from "antd";
import { InputNumber } from "@/components/ui/input-number";
import { Plus, ScanBarcode, Trash2 } from "lucide-react";
import { toast } from "react-toastify";
import { Button } from "@/components/ui/button";
import { ImageDropzone } from "@/components/ui/image-dropzone";
import BarcodeScanner from "@/components/barcode-scanner";
import api, { apiError } from "@/services/api";
import { CategorySelect } from "./category-select";
import { num } from "@/lib/format";
import type { Category, Product } from "@/lib/types";
import { useT } from "@/lib/i18n";

// Common base-unit words; the field stays free text for anything else
const BASE_UNIT_SUGGESTIONS = [
  "pcs", "tubes", "bottles", "ampules", "sachets", "cans", "jars", "bars", "rolls", "kg",
].map((v) => ({ value: v }));

// A unit row as typed in the form: "1 <name> = <qty> × <per>", where `per` is
// the base unit ("" / undefined) or the NAME of a unit defined ABOVE it (so
// "1 Case = 4 × Box of 8" needs no mental math). The stored factor is always
// the resolved base-unit count.
type UnitRow = {
  name?: string;
  qty?: number | null;
  per?: string;
  sell_price?: number | null;
  barcode?: string;
};
function resolveFactor(rows: UnitRow[], idx: number): number | null {
  const r = rows?.[idx];
  if (!r) return null;
  const qty = Number(r.qty);
  if (!Number.isInteger(qty) || qty < 1) return null;
  if (!r.per) return qty;
  // Only rows above are valid references, which also rules out cycles
  const refIdx = rows.findIndex((o, i) => i < idx && o?.name?.trim() === r.per);
  if (refIdx < 0) return null;
  const ref = resolveFactor(rows, refIdx);
  return ref === null ? null : qty * ref;
}

interface ProductFormModalProps {
  open: boolean;
  /** null = create mode */
  editing: Product | null;
  categories: Category[];
  onClose: () => void;
  onSaved: () => void;
  onCategoryCreated: (c: Category) => void;
}

export function ProductFormModal({
  open,
  editing,
  categories,
  onClose,
  onSaved,
  onCategoryCreated,
}: ProductFormModalProps) {
  const [form] = Form.useForm();
  const { t } = useT();
  const unitsWatch = Form.useWatch<UnitRow[] | undefined>("units", form);
  const baseUnitWatch = Form.useWatch<string | undefined>("base_unit", form);
  const baseWord = (baseUnitWatch || "pcs").trim() || "pcs";
  const [saving, setSaving] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  // Image is picked (drag/drop or browse) and cropped now, uploaded on save.
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreviewState] = useState<string | null>(null);

  // Revokes the previous blob preview so replaced/removed picks don't leak
  const setImagePreview = (url: string | null) => {
    setImagePreviewState((prev) => {
      if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
      return url;
    });
  };

  useEffect(() => {
    if (!open) return;
    setImageFile(null);
    if (editing) {
      setImagePreview(editing.image_url ?? null);
      form.setFieldsValue({
        ...editing,
        show_in_menu: !!editing.show_in_menu,
        is_active: !!editing.is_active,
        category_id: editing.category_id ?? undefined,
        track_stock: editing.stock_qty !== null,
        stock_qty: editing.stock_qty ?? 0,
        base_unit: editing.base_unit || "pcs",
        // Saved units come back as absolute base-unit counts
        units: (editing.units ?? []).map((u) => ({
          name: u.name,
          qty: u.factor,
          per: "",
          sell_price: u.sell_price,
          barcode: u.barcode ?? undefined,
        })),
      });
    } else {
      setImagePreview(null);
      form.resetFields();
      form.setFieldsValue({
        show_in_menu: true,
        is_active: true,
        low_stock_alert: 5,
        stock_qty: 0,
        discount_pct: 0,
        track_stock: true,
        base_unit: "pcs",
        units: [],
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing]);

  const submit = async () => {
    const values = await form.validateFields();
    const rows: UnitRow[] = values.units ?? [];
    const factors = rows.map((_, i) => resolveFactor(rows, i));
    if (factors.some((f) => f === null)) {
      toast.error(t("Check the units"));
      return;
    }
    setSaving(true);
    const fd = new FormData();
    const { units: _units, ...fields } = values;
    Object.entries(fields).forEach(([k, v]) => {
      if (v === undefined || v === null) return;
      if (typeof v === "boolean") fd.append(k, v ? "1" : "0");
      else fd.append(k, String(v));
    });
    fd.append(
      "units",
      JSON.stringify(
        rows.map((u, i) => ({
          name: u.name,
          factor: factors[i],
          sell_price: u.sell_price,
          barcode: u.barcode,
        }))
      )
    );
    if (imageFile) fd.append("image", imageFile);
    if (editing?.image_url && !imagePreview) fd.append("remove_image", "1");
    try {
      if (editing) {
        await api.put(`/products/${editing.id}`, fd);
        toast.success(t("Saved"));
      } else {
        await api.post("/products", fd);
        toast.success(t("Added"));
      }
      onClose();
      onSaved();
    } catch (err) {
      toast.error(apiError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Modal
        open={open}
        onCancel={onClose}
        title={editing ? t("Edit product") : t("Add product")}
        onOk={submit}
        okText={t("Save")}
        cancelText={t("Cancel")}
        confirmLoading={saving}
        width={640}
        centered
        styles={{
          body: {
            maxHeight: "70vh",
            overflowY: "auto",
            overflowX: "hidden",
            paddingRight: 8,
          },
        }}
        destroyOnHidden={false}
      >
        <Form
          form={form}
          layout="vertical"
          requiredMark={false}
          className="pt-1"
        >
          <FormSection title={t("Details")} first />
          <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
            <Form.Item
              label={t("Name")}
              name="name"
              rules={[{ required: true, message: t("Enter a name") }]}
            >
              <Input />
            </Form.Item>
            <Form.Item label={t("Category")} name="category_id">
              <CategorySelect
                categories={categories}
                onCreated={onCategoryCreated}
              />
            </Form.Item>
            <Form.Item label={t("Barcode")} name="barcode">
              <Input
                suffix={
                  <button
                    type="button"
                    aria-label={t("Scan barcode")}
                    onClick={() => setScanOpen(true)}
                    className="cursor-pointer text-fg-subtle transition-colors duration-200 hover:text-fg"
                  >
                    <ScanBarcode className="h-4 w-4" />
                  </button>
                }
              />
            </Form.Item>
            <Form.Item label={t("SKU")} name="sku">
              <Input />
            </Form.Item>

            <Form.Item
              label={t("Description")}
              name="description"
              className="sm:col-span-2"
            >
              <Input.TextArea rows={2} />
            </Form.Item>
          </div>

          <FormSection title={t("Price")} />
          <div className="grid grid-cols-2 gap-x-4 sm:grid-cols-3">
            <Form.Item
              label={t("Sell price ($)")}
              name="sell_price"
              rules={[{ required: true, message: t("Required") }]}
            >
              <InputNumber min={0} step={0.25} className="w-full!" />
            </Form.Item>
            <Form.Item label={t("Cost ($)")} name="cost_price">
              <InputNumber min={0} step={0.25} className="w-full!" />
            </Form.Item>
            <Form.Item label={t("Discount %")} name="discount_pct">
              <InputNumber min={0} max={100} className="w-full!" />
            </Form.Item>
          </div>

          <FormSection title={t("Stock")} />
          <div className="flex items-start mt-3 gap-4">
            <Form.Item
              className="w-full"
              noStyle
              shouldUpdate={(a, b) => a.track_stock !== b.track_stock}
            >
              {({ getFieldValue }) =>
                getFieldValue("track_stock") ? (
                  <div className="grid grid-cols-2 gap-x-4 w-full">
                    {(!editing || editing.stock_qty === null) && (
                      <Form.Item
                        label={t("Starting stock")}
                        name="stock_qty"
                      >
                        <InputNumber min={0} className="w-full!" />
                      </Form.Item>
                    )}
                    <Form.Item
                      label={t("Low stock at")}
                      name="low_stock_alert"
                    >
                      <InputNumber min={0} className="w-full!" />
                    </Form.Item>
                  </div>
                ) : null
              }
            </Form.Item>
            <Form.Item
              label={t("Track stock")}
              name="track_stock"
              valuePropName="checked"
              className="w-32"
            >
              <Switch />
            </Form.Item>
          </div>

          {/* Units: the base unit names what one stock count means; bulk units
              can be defined against the base OR a smaller bulk unit above
              ("1 Case = 4 × Box of 8"), the stored factor is always resolved
              to base units so stock math never changes */}
          <FormSection title={t("Units")} />
          <Form.Item
            label={t("Base unit")}
            name="base_unit"
            className="sm:max-w-60"
          >
            <AutoComplete
              options={BASE_UNIT_SUGGESTIONS}
              placeholder="pcs"
              filterOption={(input, opt) =>
                String(opt?.value ?? "").toLowerCase().includes(input.toLowerCase())
              }
            />
          </Form.Item>
          <Form.List name="units">
            {(fields, { add, remove: removeRow }) => (
              <div className="space-y-2">
                {fields.length > 0 && (
                  <div className="grid grid-cols-[minmax(0,1fr)_64px_110px_88px_minmax(0,1fr)_28px] gap-2 text-[11px] font-medium uppercase tracking-wide text-fg-subtle">
                    <span>{t("Unit")}</span>
                    <span>{t("Has")}</span>
                    <span>{t("Of")}</span>
                    <span>{t("Price")}</span>
                    <span>{t("Barcode")}</span>
                    <span />
                  </div>
                )}
                {fields.map((field) => {
                  const rows = unitsWatch ?? [];
                  const row = rows[field.name];
                  const factor = resolveFactor(rows, field.name);
                  // A row can reference the base unit or any unit ABOVE it
                  const refOptions = [
                    { value: "", label: baseWord },
                    ...rows
                      .slice(0, field.name)
                      .map((r) => r?.name?.trim())
                      .filter((n): n is string => !!n)
                      .map((n) => ({ value: n, label: n })),
                  ];
                  return (
                    <div key={field.key}>
                      <div className="grid grid-cols-[minmax(0,1fr)_64px_110px_88px_minmax(0,1fr)_28px] items-start gap-2">
                        <Form.Item
                          name={[field.name, "name"]}
                          className="!mb-0"
                          rules={[{ required: true, message: t("Required") }]}
                        >
                          <Input placeholder="Box of 12" />
                        </Form.Item>
                        <Form.Item
                          name={[field.name, "qty"]}
                          className="!mb-0"
                          rules={[{ required: true, message: t("Required") }]}
                        >
                          <InputNumber
                            min={1}
                            precision={0}
                            placeholder="12"
                            className="w-full!"
                          />
                        </Form.Item>
                        <Form.Item name={[field.name, "per"]} className="!mb-0">
                          <Select options={refOptions} />
                        </Form.Item>
                        <Form.Item
                          name={[field.name, "sell_price"]}
                          className="!mb-0"
                          rules={[{ required: true, message: t("Required") }]}
                        >
                          <InputNumber
                            min={0}
                            step={0.25}
                            prefix="$"
                            className="w-full!"
                          />
                        </Form.Item>
                        <Form.Item name={[field.name, "barcode"]} className="!mb-0">
                          <Input />
                        </Form.Item>
                        <Button
                          type="text"
                          danger
                          icon={<Trash2 className="h-4 w-4" />}
                          onClick={() => removeRow(field.name)}
                          aria-label={t("Remove")}
                        />
                      </div>
                      {row?.per ? (
                        factor !== null ? (
                          <p className="mt-1 text-xs text-fg-subtle">
                            1 {row?.name?.trim() || t("Unit")} = {num(factor)} {baseWord}
                          </p>
                        ) : (
                          <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">
                            {t("Pick another unit")}
                          </p>
                        )
                      ) : null}
                    </div>
                  );
                })}
                <Button
                  size="small"
                  icon={<Plus className="h-3.5 w-3.5" />}
                  onClick={() => add({ qty: 1, per: "" })}
                >
                  {t("Add unit")}
                </Button>
              </div>
            )}
          </Form.List>

          <FormSection title={t("Image")} />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[228px_minmax(0,1fr)]">
            <ImageDropzone
              value={imagePreview}
              onSelect={(file) => {
                setImageFile(file);
                setImagePreview(URL.createObjectURL(file));
              }}
              onRemove={() => {
                setImageFile(null);
                setImagePreview(null);
              }}
              aspect={1}
              aspectSlider
              className="h-44 w-full sm:h-40"
              fit="contain"
            />
            <div className="flex items-start justify-end gap-4">
              <Form.Item
                name="show_in_menu"
                label={t("Show in menu")}
                valuePropName="checked"
                className="!mb-0"
              >
                <Switch />
              </Form.Item>
              <Form.Item
                name="is_active"
                label={t("Active")}
                valuePropName="checked"
                className="!mb-0"
              >
                <Switch />
              </Form.Item>
            </div>
          </div>
        </Form>
      </Modal>

      <BarcodeScanner
        open={scanOpen}
        onClose={() => setScanOpen(false)}
        onScan={(code) => {
          form.setFieldsValue({ barcode: code });
          toast.success(code);
        }}
      />
    </>
  );
}

// Labeled divider that splits the long product form into scannable groups
function FormSection({ title, first }: { title: string; first?: boolean }) {
  return (
    <div className={`mb-3 border-b border-line pb-1.5 ${first ? "" : "mt-5"}`}>
      <p className="text-xs font-semibold uppercase tracking-wider text-fg-subtle">
        {title}
      </p>
    </div>
  );
}
