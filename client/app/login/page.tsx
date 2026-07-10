"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Form, Input } from "antd";
import { toast } from "react-toastify";
import { useAuth } from "@/hooks/useAuth";
import { apiError } from "@/services/api";

export default function LoginPage() {
  const { user, loading, login } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) router.replace("/admin/dashboard");
  }, [user, loading, router]);

  const onFinish = async ({ email, password }: { email: string; password: string }) => {
    setSubmitting(true);
    try {
      await login(email, password);
      router.replace("/admin/dashboard");
    } catch (err) {
      toast.error(apiError(err, "Could not log in"));
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen">
      {/* Brand panel stays dark in both themes (ink token) */}
      <div className="hidden flex-1 flex-col justify-between bg-ink p-10 lg:flex">
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/Chomnenh-logo-white.png" alt="Chomnenh" className="h-9 w-auto" />
        </div>
        <div>
          <h1 className="max-w-md text-3xl font-semibold leading-snug text-ink-foreground">
            Sell, track and understand your business in real time.
          </h1>
          <p className="mt-3 max-w-md text-ink-foreground/60">
            Point of sale, inventory, clients and reports. Every sale appears on your
            dashboard the moment it happens.
          </p>
        </div>
        <p className="text-sm text-ink-foreground/40">lucaci.chomnenh.com</p>
      </div>

      <div className="flex flex-1 items-center justify-center bg-surface p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/Chomnenh-logo.png" alt="Chomnenh" className="h-9 w-auto dark:hidden" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/Chomnenh-logo-white.png" alt="Chomnenh" className="hidden h-9 w-auto dark:block" />
          </div>
          <h2 className="text-2xl font-semibold text-fg">Welcome back</h2>
          <p className="mb-6 mt-1 text-sm text-fg-muted">Log in to your POS account</p>

          <Form layout="vertical" onFinish={onFinish} requiredMark={false} size="large">
            <Form.Item
              label="Email"
              name="email"
              rules={[{ required: true, type: "email", message: "Enter a valid email" }]}
            >
              <Input placeholder="you@example.com" autoComplete="email" />
            </Form.Item>
            <Form.Item
              label="Password"
              name="password"
              rules={[{ required: true, message: "Enter your password" }]}
            >
              <Input.Password placeholder="••••••••" autoComplete="current-password" />
            </Form.Item>
            <Button type="primary" htmlType="submit" block loading={submitting}>
              Log in
            </Button>
          </Form>
        </div>
      </div>
    </div>
  );
}
