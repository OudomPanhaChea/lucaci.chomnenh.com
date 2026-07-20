"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Modal, QRCode } from "antd";
import {
  Copy,
  Check,
  ExternalLink,
  Globe,
  EyeOff,
  Settings as SettingsIcon,
  ScanLine,
} from "lucide-react";
import Button from "@/components/ui/button";

// Shown from the sidebar "Public menu" item. Instead of jumping straight to
// the menu, it surfaces the shareable link (copy + QR to scan) and whether the
// menu is actually public — non-authenticated visitors only see it when
// menu_public is on.
export default function PublicMenuModal({
  open,
  onClose,
  menuPublic,
  canEditSettings,
}: {
  open: boolean;
  onClose: () => void;
  menuPublic: boolean;
  canEditSettings: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [url, setUrl] = useState("/menu");

  // Build the absolute link on the client (the menu is same-origin), so a
  // copied link works when pasted anywhere, not just inside the app.
  useEffect(() => {
    if (typeof window !== "undefined") setUrl(`${window.location.origin}/menu`);
  }, []);

  // Reset the "Copied" affordance each time the dialog opens.
  useEffect(() => {
    if (open) setCopied(false);
  }, [open]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // clipboard blocked (non-HTTPS / permissions): fall back to a temp input
      const el = document.createElement("input");
      el.value = url;
      document.body.appendChild(el);
      el.select();
      try {
        document.execCommand("copy");
      } catch {
        /* nothing else to try */
      }
      document.body.removeChild(el);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      centered
      width={440}
      footer={null}
      destroyOnHidden
      title={
        <span className="flex items-center gap-2">
          <Globe className="h-4.5 w-4.5 text-brand dark:text-brand-soft-foreground" />
          Public menu
        </span>
      }
    >
      <div className="space-y-4 pt-1">
        {/* QR code to scan on the spot */}
        <div className="flex flex-col items-center gap-2 rounded-xl border border-line bg-surface-sunken py-4">
          <div className="rounded-lg bg-white p-2.5 shadow-card">
            <QRCode
              value={url}
              size={148}
              bordered={false}
              color="#142332"
            />
          </div>
          <p className="flex items-center gap-1.5 text-xs text-fg-subtle">
            <ScanLine className="h-3.5 w-3.5" /> Scan to open on a phone
          </p>
        </div>

        {/* Copyable link */}
        <div className="flex items-center gap-2">
          <div className="flex min-w-0 flex-1 items-center rounded-lg border border-line bg-surface-raised px-3 py-2">
            <span className="truncate font-mono text-sm text-fg" title={url}>
              {url}
            </span>
          </div>
          <Button
            onClick={copy}
            icon={
              copied ? (
                <Check className="h-4 w-4" />
              ) : (
                <Copy className="h-4 w-4" />
              )
            }
            className={copied ? "!border-emerald-300 !text-emerald-600" : ""}
          >
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-1">
          <Button onClick={onClose}>Close</Button>
          <a href="/menu" target="_blank" rel="noopener noreferrer">
            <Button
              type="primary"
              icon={<ExternalLink className="h-4 w-4" />}
            >
              Open menu
            </Button>
          </a>
        </div>
      </div>
    </Modal>
  );
}
