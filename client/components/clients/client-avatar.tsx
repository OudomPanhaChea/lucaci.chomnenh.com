"use client";
import { Handshake, UserRound } from "lucide-react";
import type { Client } from "@/lib/types";

const SIZES = {
  md: { frame: "h-9 w-9", icon: "h-4.5 w-4.5" },
  lg: { frame: "h-11 w-11", icon: "h-5 w-5" },
} as const;

// Round client avatar: solid brand for partners, soft brand for normal clients
export function ClientAvatar({
  client,
  size = "md",
}: {
  client: Pick<Client, "name" | "client_type">;
  size?: keyof typeof SIZES;
}) {
  const s = SIZES[size];
  return (
    <span
      className={`flex ${s.frame} shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand-soft-foreground text-lg font-semibold`}
    >
      {client.name.charAt(0).toUpperCase()}
    </span>
  );
}
