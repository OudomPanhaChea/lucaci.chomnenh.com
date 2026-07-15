"use client";
import { useEffect } from "react";
import { Form, Input, Modal, Segmented } from "antd";
import { InputNumber } from "@/components/ui/input-number";
import { toast } from "react-toastify";
import api, { apiError } from "@/services/api";
import { num } from "@/lib/format";
import type { Product } from "@/lib/types";

interface StockAdjustModalProps {
  /** null = closed */
  product: Product | null;
  onClose: () => void;
  onSaved: () => void;
}

export function StockAdjustModal({
  product,
  onClose,
  onSaved,
}: StockAdjustModalProps) {
  const [form] = Form.useForm();

  useEffect(() => {
    if (!product) return;
    form.resetFields();
    form.setFieldsValue({ direction: "in", qty: 1 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product]);

  const adjustStock = async () => {
    const { direction, qty, note } = await form.validateFields();
    try {
      await api.post(`/products/${product!.id}/adjust-stock`, {
        change_qty: direction === "in" ? qty : -qty,
        note,
      });
      toast.success("Stock updated");
      onClose();
      onSaved();
    } catch (err) {
      toast.error(apiError(err));
    }
  };

  return (
    <Modal
      open={!!product}
      onCancel={onClose}
      centered
      width={420}
      title={`Adjust stock: ${product?.name ?? ""}`}
      onOk={adjustStock}
      okText="Apply"
    >
      <div className="mb-4 mt-2 rounded-lg bg-surface-sunken p-3 text-center">
        <p className="text-xs text-fg-subtle">Current stock</p>
        <p className="tabular text-2xl font-semibold text-fg">
          {num(product?.stock_qty)} {product?.base_unit || "pcs"}
        </p>
      </div>
      <Form form={form} layout="vertical" requiredMark={false}>
        <Form.Item name="direction">
          <Segmented
            block
            options={[
              { value: "in", label: "Stock in (restock)" },
              { value: "out", label: "Stock out (damage)" },
            ]}
          />
        </Form.Item>
        <Form.Item
          label={`Quantity (${product?.base_unit || "pcs"})`}
          name="qty"
          rules={[{ required: true, message: "Quantity required" }]}
        >
          <InputNumber min={1} className="w-full!" autoFocus />
        </Form.Item>
        <Form.Item label="Note" name="note" className="!mb-2">
          <Input placeholder="Reason (optional)" />
        </Form.Item>
        <Form.Item noStyle shouldUpdate>
          {({ getFieldValue }) => {
            const qty = Number(getFieldValue("qty")) || 0;
            if (!product || qty <= 0) return null;
            const next =
              (product.stock_qty ?? 0) +
              (getFieldValue("direction") === "in" ? qty : -qty);
            return next < 0 ? (
              <p className="text-sm text-rose-600 dark:text-rose-400">
                This would take stock below zero.
              </p>
            ) : (
              <p className="text-sm text-fg-muted">
                After applying:{" "}
                <span className="tabular font-medium text-fg">
                  {num(next)} {product.base_unit || "pcs"}
                </span>
              </p>
            );
          }}
        </Form.Item>
      </Form>
    </Modal>
  );
}
