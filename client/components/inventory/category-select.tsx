"use client";
import { useMemo, useState } from "react";
import { Divider, Select } from "antd";
import { Plus } from "lucide-react";
import { toast } from "react-toastify";
import { Button } from "@/components/ui/button";
import api, { apiError } from "@/services/api";
import type { Category } from "@/lib/types";

interface CategorySelectProps {
  categories: Category[];
  /** Called with the freshly created category so the parent can add it to its list. */
  onCreated: (c: Category) => void;
  // Injected by Form.Item when used as a form control
  value?: number | null;
  onChange?: (v: number | undefined) => void;
  id?: string;
  placeholder?: string;
  className?: string;
}

/**
 * Category picker with type-to-search and inline "Add" for names that don't
 * exist yet: type a new name and create it without leaving the form.
 */
export function CategorySelect({
  categories,
  onCreated,
  value,
  onChange,
  id,
  placeholder = "Select or type to add",
  className,
}: CategorySelectProps) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  const name = search.trim();
  const exists = useMemo(
    () => categories.some((c) => c.name.toLowerCase() === name.toLowerCase()),
    [categories, name],
  );

  const addCategory = async () => {
    if (!name || creating) return;
    setCreating(true);
    try {
      const { data } = await api.post("/categories", { name });
      toast.success(`Category "${data.name}" added`);
      onCreated(data);
      onChange?.(data.id);
      setSearch("");
      setOpen(false);
    } catch (err) {
      toast.error(apiError(err));
    } finally {
      setCreating(false);
    }
  };

  return (
    <Select
      id={id}
      showSearch
      allowClear
      className={className}
      placeholder={placeholder}
      value={value ?? undefined}
      onChange={(v) => {
        setSearch("");
        onChange?.(v);
      }}
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setSearch("");
      }}
      searchValue={search}
      onSearch={setSearch}
      optionFilterProp="label"
      options={categories.map((c) => ({ value: c.id, label: c.name }))}
      notFoundContent={
        <p className="py-1 text-center text-xs text-fg-subtle">
          No matching category
        </p>
      }
      popupRender={(menu) => (
        <>
          {menu}
          {name && !exists && (
            <>
              <Divider className="!my-1" />
              {/* preventDefault keeps the Select from stealing focus and closing the popup */}
              <Button
                type="text"
                block
                loading={creating}
                icon={<Plus className="h-3.5 w-3.5" />}
                onMouseDown={(e) => e.preventDefault()}
                onClick={addCategory}
                className="!justify-start"
              >
                Add &quot;{name}&quot;
              </Button>
            </>
          )}
        </>
      )}
    />
  );
}
