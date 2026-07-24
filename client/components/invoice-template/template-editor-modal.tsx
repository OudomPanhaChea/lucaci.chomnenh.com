"use client";
import { useEffect, useState } from "react";
import { Input, Modal } from "antd";
import { Button } from "@/components/ui/button";
import type { TemplateElement } from "./types";
import type { InvoiceData } from "./bindings";
import TemplateEditor from "./template-editor";

// Generic editor modal. Settings uses it to edit a global template (with a name
// field); the client-details page uses it to customize one invoice's layout
// (no name). Parent handles persistence via onSave.
export default function TemplateEditorModal({
  open,
  title,
  initialElements,
  data,
  withName,
  initialName,
  saving,
  onSave,
  onClose,
}: {
  open: boolean;
  title: string;
  initialElements: TemplateElement[];
  data: InvoiceData;
  withName?: boolean;
  initialName?: string;
  saving?: boolean;
  onSave: (elements: TemplateElement[], name: string) => void;
  onClose: () => void;
}) {
  const [elements, setElements] = useState<TemplateElement[]>(initialElements);
  const [name, setName] = useState(initialName ?? "");
  // Bumped on each open so the editor remounts with a clean undo history.
  const [session, setSession] = useState(0);

  // Reseed whenever the modal (re)opens with fresh inputs
  useEffect(() => {
    if (open) {
      setElements(initialElements);
      setName(initialName ?? "");
      setSession((s) => s + 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Modal
      open={open}
      onCancel={onClose}
      centered
      width={1120}
      className="top-6"
      title={title}
      footer={
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button
            type="primary"
            loading={saving}
            onClick={() => onSave(elements, name.trim() || "Template")}
          >
            Save
          </Button>
        </div>
      }
    >
      {withName && (
        <div className="mb-3 max-w-sm">
          <p className="mb-1 text-xs font-medium text-fg-muted">
            Template name
          </p>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Modern"
          />
        </div>
      )}
      <TemplateEditor key={session} value={elements} onChange={setElements} data={data} />
    </Modal>
  );
}
