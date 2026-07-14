"use client";
import { useEffect, useState } from "react";
import { Form, Input, InputNumber, Modal, Switch } from "antd";
import {
  BadgeCheck,
  Globe,
  Plus,
  ScanBarcode,
  Trash2,
} from "lucide-react";
import { toast } from "react-toastify";
import { Button } from "@/components/ui/button";
import { ImageDropzone } from "@/components/ui/image-dropzone";
import BarcodeScanner from "@/components/barcode-scanner";
import api, { apiError } from "@/services/api";
import { MAX_IMAGE_MB } from "@/lib/images";
import { CategorySelect } from "./category-select";
import type { Category, Product } from "@/lib/types";

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
        units: (editing.units ?? []).map((u) => ({
          name: u.name,
          factor: u.factor,
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
        units: [],
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing]);

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
    if (imageFile) fd.append("image", imageFile);
    if (editing?.image_url && !imagePreview) fd.append("remove_image", "1");
    try {
      if (editing) {
        await api.put(`/products/${editing.id}`, fd);
        toast.success("Product updated");
      } else {
        await api.post("/products", fd);
        toast.success("Product created");
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
        title={editing ? `Edit ${editing.name}` : "Add product"}
        onOk={submit}
        okText={editing ? "Save changes" : "Create product"}
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
          <FormSection title="Details" first />
          <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
            <Form.Item
              label="Name"
              name="name"
              rules={[{ required: true, message: "Product name is required" }]}
            >
              <Input placeholder="Product name" />
            </Form.Item>
            <Form.Item label="Category" name="category_id">
              <CategorySelect
                categories={categories}
                onCreated={onCategoryCreated}
              />
            </Form.Item>
            <Form.Item label="Barcode" name="barcode">
              <Input
                placeholder="Scan or type barcode"
                suffix={
                  <button
                    type="button"
                    aria-label="Scan barcode with camera"
                    onClick={() => setScanOpen(true)}
                    className="cursor-pointer text-fg-subtle transition-colors duration-200 hover:text-fg"
                  >
                    <ScanBarcode className="h-4 w-4" />
                  </button>
                }
              />
            </Form.Item>
            <Form.Item label="SKU" name="sku">
              <Input placeholder="Internal code (optional)" />
            </Form.Item>

            <Form.Item
              label="Description"
              name="description"
              className="sm:col-span-2"
            >
              <Input.TextArea
                rows={2}
                placeholder="Shown on the public menu (optional)"
              />
            </Form.Item>
          </div>

          <FormSection title="Pricing" />
          <div className="grid grid-cols-2 gap-x-4 sm:grid-cols-3">
            <Form.Item
              label="Sell price ($)"
              name="sell_price"
              rules={[{ required: true, message: "Required" }]}
            >
              <InputNumber min={0} step={0.25} className="w-full!" />
            </Form.Item>
            <Form.Item label="Cost price ($)" name="cost_price">
              <InputNumber min={0} step={0.25} className="w-full!" />
            </Form.Item>
            <Form.Item label="Discount %" name="discount_pct">
              <InputNumber min={0} max={100} className="w-full!" />
            </Form.Item>
          </div>

          <FormSection title="Stock" />
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
                        label={editing ? "Starting stock" : "Initial stock"}
                        name="stock_qty"
                      >
                        <InputNumber min={0} className="w-full!" />
                      </Form.Item>
                    )}
                    <Form.Item
                      label="Low stock alert at"
                      name="low_stock_alert"
                    >
                      <InputNumber min={0} className="w-full!" />
                    </Form.Item>
                  </div>
                ) : null
              }
            </Form.Item>
            <Form.Item
              label={"Track stock"}
              name="track_stock"
              valuePropName="checked"
              className="w-32"
            >
              <Switch />
            </Form.Item>
          </div>

          {/* Bulk units for partner/wholesale sales: own price + carton barcode,
              stock still counted in pieces */}
          <FormSection title="Bulk units (wholesale)" />
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
                  <div
                    key={field.key}
                    className="grid grid-cols-[minmax(0,1fr)_84px_96px_minmax(0,1fr)_28px] items-start gap-2"
                  >
                    <Form.Item
                      name={[field.name, "name"]}
                      className="!mb-0"
                      rules={[{ required: true, message: "Name" }]}
                    >
                      <Input placeholder="Box of 12" />
                    </Form.Item>
                    <Form.Item
                      name={[field.name, "factor"]}
                      className="!mb-0"
                      rules={[{ required: true, message: "Pcs" }]}
                    >
                      <InputNumber
                        min={1}
                        precision={0}
                        placeholder="Pcs"
                        className="w-full!"
                        title="Pieces per unit"
                      />
                    </Form.Item>
                    <Form.Item
                      name={[field.name, "sell_price"]}
                      className="!mb-0"
                      rules={[{ required: true, message: "Price" }]}
                    >
                      <InputNumber
                        min={0}
                        step={0.25}
                        prefix="$"
                        placeholder="Price"
                        className="w-full!"
                      />
                    </Form.Item>
                    <Form.Item name={[field.name, "barcode"]} className="!mb-0">
                      <Input placeholder="Optional" />
                    </Form.Item>
                    <Button
                      type="text"
                      danger
                      icon={<Trash2 className="h-4 w-4" />}
                      onClick={() => removeRow(field.name)}
                      aria-label="Remove unit"
                    />
                  </div>
                ))}
                {fields.length === 0 && (
                  <p className="text-xs text-fg-subtle">
                    No bulk units. Add one to sell this product by the box or
                    case at its own price.
                  </p>
                )}
                <Button
                  size="small"
                  icon={<Plus className="h-3.5 w-3.5" />}
                  onClick={() => add({ factor: 1 })}
                >
                  Add unit
                </Button>
              </div>
            )}
          </Form.List>

          <FormSection title="Image and visibility" />
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
              removeConfirm="Remove this image?"
              aspect={1}
              aspectSlider
              cropTitle="Adjust product image"
              className="h-44 w-full sm:h-40"
              fit="contain"
              overlayLabel="Replace image"
              label="Drop image, or click to browse"
              hint={`Under ${MAX_IMAGE_MB}MB. Crop and zoom before saving.`}
            />
            <div className="flex flex-col justify-center gap-3">
              <div className="flex items-center justify-between gap-4 rounded-lg border border-line px-3 py-2.5">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand-soft-foreground">
                    <Globe className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-sm font-medium text-fg">
                      Show in public menu
                    </p>
                    <p className="text-xs text-fg-subtle">
                      Customers see it on /menu
                    </p>
                  </div>
                </div>
                <Form.Item
                  name="show_in_menu"
                  valuePropName="checked"
                  className="!mb-0"
                >
                  <Switch />
                </Form.Item>
              </div>
              <div className="flex items-center justify-between gap-4 rounded-lg border border-line px-3 py-2.5">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand-soft-foreground">
                    <BadgeCheck className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-sm font-medium text-fg">
                      Active (sellable)
                    </p>
                    <p className="text-xs text-fg-subtle">
                      Off: hidden from the POS grid
                    </p>
                  </div>
                </div>
                <Form.Item
                  name="is_active"
                  valuePropName="checked"
                  className="!mb-0"
                >
                  <Switch />
                </Form.Item>
              </div>
            </div>
          </div>
        </Form>
      </Modal>

      <BarcodeScanner
        open={scanOpen}
        onClose={() => setScanOpen(false)}
        onScan={(code) => {
          form.setFieldsValue({ barcode: code });
          toast.success(`Barcode captured: ${code}`);
        }}
      />
    </>
  );
}

// Labeled divider that splits the long product form into scannable groups
function FormSection({
  title,
  hint,
  first,
}: {
  title: string;
  hint?: string;
  first?: boolean;
}) {
  return (
    <div className={`mb-3 border-b border-line pb-1.5 ${first ? "" : "mt-5"}`}>
      <p className="text-xs font-semibold uppercase tracking-wider text-fg-subtle">
        {title}
      </p>
      {hint && (
        <p className="mt-0.5 text-xs normal-case tracking-normal text-fg-subtle">
          {hint}
        </p>
      )}
    </div>
  );
}
