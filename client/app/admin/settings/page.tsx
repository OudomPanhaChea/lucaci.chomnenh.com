"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Form, Input, Popconfirm, Switch } from "antd";
import { InputNumber } from "@/components/ui/input-number";
import { Button } from "@/components/ui/button";
import { ImageDropzone, type ImageDropzoneHandle } from "@/components/ui/image-dropzone";
import { toast } from "react-toastify";
import { Camera, ExternalLink, Pencil, Trash2 } from "lucide-react";
import api, { apiError } from "@/services/api";
import { MAX_IMAGE_MB } from "@/lib/images";
import { SectionHeader } from "@/components/ui/section-header";
import type { Settings } from "@/lib/types";

const MAX_BANNERS = 4;

export default function SettingsPage() {
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [logoBusy, setLogoBusy] = useState(false);
  // URL of the banner being replaced, or "new" while adding one
  const [bannerBusy, setBannerBusy] = useState<string | null>(null);
  const logoRef = useRef<ImageDropzoneHandle>(null);
  const [form] = Form.useForm();

  useEffect(() => {
    api.get("/settings").then(({ data }: { data: Settings }) => {
      setSettings(data);
      form.setFieldsValue({ ...data, menu_public: !!data.menu_public });
    }).catch(() => {});
  }, [form]);

  const submit = async (values: Record<string, unknown>) => {
    setSaving(true);
    try {
      const { data } = await api.put<Settings>("/settings", values);
      setSettings(data);
      toast.success("Settings saved");
    } catch (err) {
      toast.error(apiError(err));
    } finally {
      setSaving(false);
    }
  };

  const uploadLogo = async (file: File) => {
    setLogoBusy(true);
    try {
      const fd = new FormData();
      fd.append("image", file);
      const { data } = await api.post<Settings>("/settings/logo", fd);
      setSettings(data);
      toast.success("Logo updated");
    } catch (err) {
      toast.error(apiError(err));
    } finally {
      setLogoBusy(false);
    }
  };

  const removeLogo = async () => {
    try {
      const { data } = await api.delete<Settings>("/settings/logo");
      setSettings(data);
      toast.success("Logo removed");
    } catch (err) {
      toast.error(apiError(err));
    }
  };

  const addBanner = async (file: File) => {
    setBannerBusy("new");
    try {
      const fd = new FormData();
      fd.append("image", file);
      const { data } = await api.post<Settings>("/settings/banners", fd);
      setSettings(data);
      toast.success("Banner added");
    } catch (err) {
      toast.error(apiError(err));
    } finally {
      setBannerBusy(null);
    }
  };

  // Edit/replace = remove old then add the new file (max-4 cap blocks add-first)
  const replaceBanner = async (url: string, file: File) => {
    setBannerBusy(url);
    try {
      await api.delete<Settings>("/settings/banners", { params: { url } });
      const fd = new FormData();
      fd.append("image", file);
      const { data } = await api.post<Settings>("/settings/banners", fd);
      setSettings(data);
      toast.success("Banner updated");
    } catch (err) {
      toast.error(apiError(err));
      api.get("/settings").then(({ data }) => setSettings(data)).catch(() => {});
    } finally {
      setBannerBusy(null);
    }
  };

  const removeBanner = async (url: string) => {
    try {
      const { data } = await api.delete<Settings>("/settings/banners", { params: { url } });
      setSettings(data);
      toast.success("Banner removed");
    } catch (err) {
      toast.error(apiError(err));
    }
  };

  const banners = settings?.banners ?? [];

  return (
    <div className="max-w-2xl">
      <SectionHeader title="Settings" subtitle="Business information, money and public menu" />

      <Form form={form} layout="vertical" onFinish={submit} requiredMark={false}>
        <div className="rounded-xl border border-line bg-surface-raised p-5 shadow-card">
          <h2 className="mb-4 font-medium text-fg">Business Logo</h2>

          {/* Logo: same composition as the profile avatar, square corners.
              Brand ring frame, camera badge to browse, Edit/Remove links below. */}
          <div className="mb-5">
            <div className="relative mx-auto w-fit">
              <div className="rounded-2xl bg-brand p-[3px]">
                <div className="rounded-xl bg-surface-raised p-[3px]">
                  <ImageDropzone
                    ref={logoRef}
                    value={settings?.logo_url}
                    onSelect={uploadLogo}
                    busy={logoBusy}
                    aspect={1}
                    cropTitle="Edit logo"
                    className="h-24 w-24"
                    rounded="rounded-lg"
                    overlayLabel=""
                    cornerActions={false}
                    placeholder={
                      <span className="absolute inset-0 flex items-center justify-center bg-brand text-3xl font-semibold text-brand-foreground">
                        {(settings?.business_name || "B").charAt(0).toUpperCase()}
                      </span>
                    }
                  />
                </div>
              </div>
              <button
                type="button"
                aria-label="Change business logo"
                disabled={logoBusy}
                onClick={() => logoRef.current?.browse()}
                className="absolute -bottom-1 -right-1 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-line bg-surface-raised text-fg-muted shadow-card transition-colors duration-200 hover:text-fg disabled:opacity-60"
              >
                <Camera className="h-4 w-4" />
              </button>
            </div>
            {settings?.logo_url && (
              <div className="mt-2 flex items-center justify-center gap-3 text-xs">
                <button
                  type="button"
                  onClick={() => logoRef.current?.editCurrent()}
                  className="flex cursor-pointer items-center gap-1 text-fg-subtle transition-colors duration-200 hover:text-fg-muted"
                >
                  <Pencil size={14} /> Edit
                </button>
                <span className="text-line-strong">·</span>
                <Popconfirm title="Remove the logo?" onConfirm={removeLogo}>
                  <button
                    type="button"
                    className="flex cursor-pointer items-center gap-1 text-xs text-fg-subtle transition-colors duration-200 hover:text-fg-muted"
                  >
                    <Trash2 size={14} /> Remove
                  </button>
                </Popconfirm>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
            <Form.Item label="Business name" name="business_name" rules={[{ required: true, message: "Required" }]}>
              <Input />
            </Form.Item>
            <Form.Item label="Phone" name="phone">
              <Input placeholder="Shown on receipts and menu" />
            </Form.Item>
            <Form.Item label="Address" name="address" className="sm:col-span-2">
              <Input placeholder="Shown on receipts and menu" />
            </Form.Item>
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-line bg-surface-raised p-5 shadow-card">
          <h2 className="mb-4 font-medium text-fg">Money</h2>
          <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-3">
            <Form.Item label="Currency" name="currency">
              <Input disabled />
            </Form.Item>
            <Form.Item label="Exchange rate (KHR per USD)" name="exchange_rate">
              <InputNumber min={1} className="!w-full" />
            </Form.Item>
            <Form.Item label="Tax rate %" name="tax_rate"
              extra="Added on top at payment. 0 = no tax.">
              <InputNumber min={0} max={100} className="!w-full" />
            </Form.Item>
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-line bg-surface-raised p-5 shadow-card">
          <h2 className="mb-4 font-medium text-fg">Receipt and public menu</h2>
          <Form.Item label="Receipt footer" name="receipt_footer">
            <Input placeholder="Thank you, see you again!" />
          </Form.Item>

          <div className="mb-4 flex items-center justify-between rounded-lg bg-surface-sunken p-3">
            <div>
              <p className="text-sm font-medium text-fg">Public menu</p>
              <p className="text-xs text-fg-muted">
                Customers can preview products at{" "}
                <Link href="/menu" target="_blank" className="inline-flex items-center gap-0.5 text-brand dark:text-brand-soft-foreground">
                  /menu <ExternalLink className="h-3 w-3" />
                </Link>{" "}
                without logging in. Preview only, no ordering.
              </p>
            </div>
            <Form.Item name="menu_public" valuePropName="checked" className="!mb-0">
              <Switch />
            </Form.Item>
          </div>

          {/* Banner carousel images (saved immediately, not part of the form) */}
          <p className="mb-1 text-sm font-medium text-fg">Menu banners</p>
          <p className="mb-3 text-xs text-fg-muted">
            Shown as a slideshow at the top of the public menu, in this order. Up to{" "}
            {MAX_BANNERS} images (wide 3:1 crop), under {MAX_IMAGE_MB}MB each.
          </p>
          <div className="grid grid-cols-2 gap-3">
            {banners.map((url, i) => (
              <div key={url} className="relative">
                <ImageDropzone
                  value={url}
                  onSelect={(file) => replaceBanner(url, file)}
                  onRemove={() => removeBanner(url)}
                  removeConfirm="Remove this banner?"
                  busy={bannerBusy === url}
                  aspect={3}
                  cropTitle="Edit banner"
                  className="aspect-[3/1] w-full"
                  rounded="rounded-lg"
                  overlayLabel="Replace"
                />
                <span className="pointer-events-none absolute bottom-1.5 left-1.5 rounded-full bg-black/50 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
                  Slide {i + 1}
                </span>
              </div>
            ))}
            {banners.length < MAX_BANNERS && (
              <ImageDropzone
                onSelect={addBanner}
                busy={bannerBusy === "new"}
                aspect={3}
                cropTitle="Crop banner"
                className="aspect-[3/1] w-full"
                rounded="rounded-lg"
                label={`Add banner (${banners.length}/${MAX_BANNERS})`}
                hint="Drop an image or click"
              />
            )}
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <Button type="primary" htmlType="submit" loading={saving}>Save settings</Button>
        </div>
      </Form>
    </div>
  );
}
