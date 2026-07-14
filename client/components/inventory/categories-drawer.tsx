"use client";
import { Drawer, Form, Input, Popconfirm } from "antd";
import { Trash2 } from "lucide-react";
import { toast } from "react-toastify";
import { Button } from "@/components/ui/button";
import api, { apiError } from "@/services/api";
import type { Category } from "@/lib/types";

interface CategoriesDrawerProps {
  open: boolean;
  categories: Category[];
  onClose: () => void;
  onChanged: () => void;
}

export function CategoriesDrawer({
  open,
  categories,
  onClose,
  onChanged,
}: CategoriesDrawerProps) {
  const [form] = Form.useForm();

  const saveCategory = async (values: { name: string }) => {
    try {
      await api.post("/categories", values);
      form.resetFields();
      onChanged();
    } catch (err) {
      toast.error(apiError(err));
    }
  };

  const removeCategory = async (c: Category) => {
    try {
      await api.delete(`/categories/${c.id}`);
      onChanged();
    } catch (err) {
      toast.error(apiError(err));
    }
  };

  return (
    <Drawer open={open} onClose={onClose} title="Categories" size={380}>
      <Form form={form} onFinish={saveCategory} className="mb-4 flex gap-2">
        <Form.Item
          name="name"
          className="!mb-0 flex-1"
          rules={[{ required: true, message: "Name required" }]}
        >
          <Input placeholder="New category name" />
        </Form.Item>
        <Button type="primary" htmlType="submit">
          Add
        </Button>
      </Form>
      <ul className="divide-y divide-line">
        {categories.map((c) => (
          <li key={c.id} className="flex items-center justify-between py-2.5">
            <span className="text-fg">
              {c.name}
              <span className="ml-2 text-xs text-fg-subtle">
                {c.product_count} products
              </span>
            </span>
            <Popconfirm
              title={`Delete "${c.name}"?`}
              description="Products keep existing but lose this category."
              onConfirm={() => removeCategory(c)}
            >
              <Button
                size="small"
                type="text"
                danger
                icon={<Trash2 className="h-4 w-4" />}
              />
            </Popconfirm>
          </li>
        ))}
      </ul>
    </Drawer>
  );
}
