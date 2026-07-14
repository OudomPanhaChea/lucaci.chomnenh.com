"use client";
import { useEffect, useRef, useState } from "react";
import { Form, Input, Popconfirm } from "antd";
import { Button } from "@/components/ui/button";
import { ImageDropzone, type ImageDropzoneHandle } from "@/components/ui/image-dropzone";
import { toast } from "react-toastify";
import { Mail, Phone, CalendarDays, Clock, KeyRound, UserRound, Camera, Pencil, Trash2 } from "lucide-react";
import api, { apiError } from "@/services/api";
import { useAuth } from "@/hooks/useAuth";
import { SectionHeader } from "@/components/ui/section-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { fmtDate } from "@/lib/format";
import type { User } from "@/lib/types";

export default function ProfilePage() {
  const { user, updateUser } = useAuth();
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [uploading, setUploading] = useState(false);
  const avatarRef = useRef<ImageDropzoneHandle>(null);
  const [profileForm] = Form.useForm();
  const [passwordForm] = Form.useForm();

  const uploadAvatar = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("avatar", file);
      const { data } = await api.post<{ user: User }>("/auth/avatar", fd);
      updateUser(data.user);
      toast.success("Profile photo updated");
    } catch (err) {
      toast.error(apiError(err));
    } finally {
      setUploading(false);
    }
  };

  const removeAvatar = async () => {
    try {
      const { data } = await api.delete<{ user: User }>("/auth/avatar");
      updateUser(data.user);
      toast.success("Profile photo removed");
    } catch (err) {
      toast.error(apiError(err));
    }
  };

  useEffect(() => {
    if (user) profileForm.setFieldsValue({ name: user.name, email: user.email, phone: user.phone });
  }, [user, profileForm]);

  const saveProfile = async (values: { name: string; email: string; phone?: string }) => {
    setSavingProfile(true);
    try {
      const { data } = await api.put<{ user: User }>("/auth/profile", values);
      updateUser(data.user);
      toast.success("Profile updated");
    } catch (err) {
      toast.error(apiError(err));
    } finally {
      setSavingProfile(false);
    }
  };

  const savePassword = async (values: { current_password: string; new_password: string }) => {
    setSavingPassword(true);
    try {
      await api.post("/auth/change-password", {
        current_password: values.current_password,
        new_password: values.new_password,
      });
      toast.success("Password updated");
      passwordForm.resetFields();
    } catch (err) {
      toast.error(apiError(err));
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <div className="max-w-4xl">
      <SectionHeader title="My profile" subtitle="Your account details and password" />

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        {/* Identity card */}
        <div className="h-fit rounded-xl border border-line bg-surface-raised p-5 text-center shadow-card">
          <div className="relative mx-auto w-fit">
            {/* Brand ring (logo blue into the accent-orange dot) framing the avatar.
                The avatar itself is the drop/click target; crops round before upload.
                Corner actions clip on the circle, so Edit/Remove live in links below. */}
            <div className="rounded-full bg-brand p-[3px]">
              <div className="rounded-full bg-surface-raised p-[3px]">
                <ImageDropzone
                  ref={avatarRef}
                  value={user?.avatar_url}
                  onSelect={uploadAvatar}
                  busy={uploading}
                  aspect={1}
                  cropShape="round"
                  cropTitle="Edit photo"
                  className="h-24 w-24"
                  rounded="rounded-full"
                  overlayLabel=""
                  cornerActions={false}
                  placeholder={
                    <span className="absolute inset-0 flex items-center justify-center bg-brand text-3xl font-semibold text-brand-foreground">
                      {user?.name?.charAt(0).toUpperCase()}
                    </span>
                  }
                />
              </div>
            </div>
            <button
              type="button"
              aria-label="Change profile photo"
              disabled={uploading}
              onClick={() => avatarRef.current?.browse()}
              className="absolute bottom-0 right-0 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-line bg-surface-raised text-fg-muted shadow-card transition-colors duration-200 hover:text-fg disabled:opacity-60"
            >
              <Camera className="h-4 w-4" />
            </button>
          </div>
          {user?.avatar_url && (
            <div className="mt-2 flex items-center justify-center gap-3 text-xs">
              <button
                type="button"
                onClick={() => avatarRef.current?.editCurrent()}
                className="cursor-pointer flex items-center gap-1 text-fg-subtle transition-colors duration-200 hover:text-fg-muted"
              >
                <Pencil size={14} /> Edit
              </button>
              <span className="text-line-strong">·</span>
              <Popconfirm title="Remove profile photo?" onConfirm={removeAvatar}>
                <button type="button" className="cursor-pointer flex items-center gap-1 text-xs text-fg-subtle transition-colors duration-200 hover:text-fg-muted">
                  <Trash2 size={14} /> Remove
                </button>
              </Popconfirm>
            </div>
          )}
          <p className="mt-3 text-lg font-semibold text-fg">{user?.name}</p>
          <div className="mt-1.5">
            <StatusBadge status={user?.role ?? "other"} />
          </div>

          <dl className="mt-5 space-y-2.5 border-t border-line pt-4 text-left text-sm">
            <div className="flex items-center gap-2.5 text-fg-muted">
              <Mail className="h-4 w-4 shrink-0 text-fg-subtle" />
              <dd className="truncate">{user?.email}</dd>
            </div>
            <div className="flex items-center gap-2.5 text-fg-muted">
              <Phone className="h-4 w-4 shrink-0 text-fg-subtle" />
              <dd>{user?.phone || "No phone"}</dd>
            </div>
            {user?.created_at && (
              <div className="flex items-center gap-2.5 text-fg-muted">
                <CalendarDays className="h-4 w-4 shrink-0 text-fg-subtle" />
                <dd>Joined {fmtDate(user.created_at, "dd MMM yyyy")}</dd>
              </div>
            )}
            {user?.last_login_at && (
              <div className="flex items-center gap-2.5 text-fg-muted">
                <Clock className="h-4 w-4 shrink-0 text-fg-subtle" />
                <dd>Last login {fmtDate(user.last_login_at)}</dd>
              </div>
            )}
          </dl>
        </div>

        <div className="space-y-4">
          {/* Profile details */}
          <div className="rounded-xl border border-line bg-surface-raised p-5 shadow-card">
            <h2 className="mb-4 flex items-center gap-2 font-medium text-fg">
              <UserRound className="h-4 w-4 text-fg-subtle" /> Profile details
            </h2>
            <Form form={profileForm} layout="vertical" onFinish={saveProfile} requiredMark={false}>
              <Form.Item label="Name" name="name" rules={[{ required: true, message: "Name is required" }]}>
                <Input placeholder="Your name" autoComplete="name" />
              </Form.Item>
              <Form.Item label="Email" name="email"
                rules={[{ required: true, type: "email", message: "Enter a valid email" }]}
                extra="You log in with this email">
                <Input placeholder="you@example.com" autoComplete="email" />
              </Form.Item>
              <Form.Item label="Phone" name="phone">
                <Input placeholder="Phone (optional)" autoComplete="tel" />
              </Form.Item>
              <Button type="primary" htmlType="submit" loading={savingProfile}>
                Save changes
              </Button>
            </Form>
          </div>

          {/* Change password */}
          <div className="rounded-xl border border-line bg-surface-raised p-5 shadow-card">
            <h2 className="mb-4 flex items-center gap-2 font-medium text-fg">
              <KeyRound className="h-4 w-4 text-fg-subtle" /> Change password
            </h2>
            <Form form={passwordForm} layout="vertical" onFinish={savePassword} requiredMark={false}>
              <Form.Item label="Current password" name="current_password" rules={[{ required: true, message: "Required" }]}>
                <Input.Password autoComplete="current-password" />
              </Form.Item>
              <Form.Item label="New password" name="new_password"
                rules={[{ required: true, min: 8, message: "At least 8 characters" }]}>
                <Input.Password autoComplete="new-password" />
              </Form.Item>
              <Form.Item label="Confirm new password" name="confirm" dependencies={["new_password"]}
                rules={[
                  { required: true, message: "Required" },
                  ({ getFieldValue }) => ({
                    validator: (_, v) =>
                      v && v !== getFieldValue("new_password")
                        ? Promise.reject(new Error("Passwords do not match"))
                        : Promise.resolve(),
                  }),
                ]}>
                <Input.Password autoComplete="new-password" />
              </Form.Item>
              <Button type="primary" htmlType="submit" loading={savingPassword}>
                Update password
              </Button>
            </Form>
          </div>
        </div>
      </div>
    </div>
  );
}
