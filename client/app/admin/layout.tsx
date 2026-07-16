"use client";
import { ReactNode, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { PageSpinner } from "@/components/ui/spinner";
import AdminShell from "@/components/layouts/admin-shell";

export default function AdminLayout({ children }: { children: ReactNode }) {
  const { user, loading, reconnecting } = useAuth();
  const router = useRouter();

  // Only redirects when the server actually said "not signed in" (a 401).
  // While `loading` is true useAuth is still retrying an unreachable server, so
  // this correctly stays put instead of logging staff out over a Wi-Fi blip.
  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [user, loading, router]);

  if (loading || !user) {
    return <PageSpinner hint={reconnecting ? "Reconnecting to the server…" : undefined} />;
  }
  return <AdminShell>{children}</AdminShell>;
}
