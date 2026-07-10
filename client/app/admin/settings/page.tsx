"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Button, Form, Input, InputNumber, Popconfirm, Switch, Upload } from "antd";
import ImgCrop from "antd-img-crop";
import { toast } from "react-toastify";
import { ExternalLink, ImagePlus, Store, Trash2, X } from "lucide-react";
import api, { apiError } from "@/services/api";
import { validateImageFile, MAX_IMAGE_MB } from "@/lib/images";
import { SectionHeader } from "@/components/ui/section-header";
import type { Settings } from "@/lib/types";

const MAX_BANNERS = 4;

export default function SettingsPage() {
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [logoBusy, setLogoBusy] = useState(false);
  const [bannerBusy, setBannerBusy] = useState(false);
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
    setBannerBusy(true);
    try {
      const fd = new FormData();
      fd.append("image", file);
      const { data } = await api.post<Settings>("/settings/banners", fd);
      setSettings(data);
      toast.success("Banner added");
    } catch (err) {
      toast.error(apiError(err));
    } finally {
      setBannerBusy(false);
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
          <h2 className="mb-4 font-medium text-fg">Business</h2>

          {/* Logo: uploaded (with crop), shown in the header and public menu */}
          <div className="mb-5 flex items-center gap-4">
            {settings?.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={settings.logo_url} alt="Business logo"
                className="h-16 w-16 rounded-xl border border-line bg-white object-cover" />
            ) : (
              <span className="flex h-16 w-16 items-center justify-center rounded-xl border border-dashed border-line-strong text-fg-subtle">
                <Store className="h-6 w-6" />
              </span>
            )}
            <div>
              <div className="flex items-center gap-2">
                <ImgCrop
                  aspect={1}
                  rotationSlider
                  quality={0.9}
                  modalTitle="Crop logo"
                  beforeCrop={(file) => validateImageFile(file as File)}
                >
                  <Upload
                    accept="image/*"
                    showUploadList={false}
                    customRequest={({ file, onSuccess }) => {
                      uploadLogo(file as File).then(() => onSuccess?.(null));
                    }}
                  >
                    <Button loading={logoBusy} icon={<ImagePlus className="h-4 w-4" />}>
                      {settings?.logo_url ? "Change logo" : "Upload logo"}
                    </Button>
                  </Upload>
                </ImgCrop>
                {settings?.logo_url && (
                  <Popconfirm title="Remove the logo?" onConfirm={removeLogo}>
                    <Button danger type="text" icon={<Trash2 className="h-4 w-4" />} aria-label="Remove logo" />
                  </Popconfirm>
                )}
              </div>
              <p className="mt-1.5 text-xs text-fg-muted">
                Square image, under {MAX_IMAGE_MB}MB. Shown in the admin header, receipts and public menu.
              </p>
            </div>
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
            Shown as a slideshow at the top of the public menu. Up to {MAX_BANNERS} images
            (wide 3:1 crop), under {MAX_IMAGE_MB}MB each.
          </p>
          <div className="grid grid-cols-2 gap-3">
            {banners.map((url) => (
              <div key={url} className="group relative overflow-hidden rounded-lg border border-line">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="Menu banner" className="aspect-[3/1] w-full object-cover" />
                <Popconfirm title="Remove this banner?" onConfirm={() => removeBanner(url)}>
                  <button
                    type="button"
                    aria-label="Remove banner"
                    className="absolute right-1.5 top-1.5 flex h-6 w-6 cursor-pointer items-center justify-center rounded-full bg-black/55 text-white transition-colors duration-200 hover:bg-black/75"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </Popconfirm>
              </div>
            ))}
            {banners.length < MAX_BANNERS && (
              <ImgCrop
                aspect={3}
                rotationSlider
                quality={0.9}
                modalTitle="Crop banner"
                beforeCrop={(file) => validateImageFile(file as File)}
              >
                <Upload
                  accept="image/*"
                  showUploadList={false}
                  customRequest={({ file, onSuccess }) => {
                    addBanner(file as File).then(() => onSuccess?.(null));
                  }}
                >
                  <button
                    type="button"
                    disabled={bannerBusy}
                    className="flex aspect-[3/1] w-full cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-line-strong text-fg-subtle transition-colors duration-200 hover:border-brand hover:text-fg-muted disabled:opacity-60"
                  >
                    <ImagePlus className="h-5 w-5" />
                    <span className="text-xs">Add banner ({banners.length}/{MAX_BANNERS})</span>
                  </button>
                </Upload>
              </ImgCrop>
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
