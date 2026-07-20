"use client";
import { useState } from "react";
import Link from "next/link";
import { Dropdown } from "antd";
import { useTheme } from "next-themes";
import {
  ChevronDown,
  LogOut,
  Maximize,
  Minimize,
  Monitor,
  Moon,
  Settings,
  Sun,
  UserRound,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useMounted } from "@/hooks/useMounted";
import { useFullscreen, useStandalone } from "@/hooks/useFullscreen";

const THEMES = [
  { key: "light", icon: Sun, label: "Light theme" },
  { key: "dark", icon: Moon, label: "Dark theme" },
  { key: "system", icon: Monitor, label: "System theme" },
] as const;

// Touch targets stay at 44px: the staff run this on tablets.
const ROW =
  "flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-lg px-2.5 text-sm transition-colors duration-200";

function Avatar({
  url,
  name,
  size,
}: {
  url?: string | null;
  name?: string;
  size: "sm" | "md" | "lg";
}) {
  const box = size === "lg" ? "h-11 w-11 text-base" : size === "md" ? "h-10 w-10 text-sm" : "h-8 w-8 text-sm";
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={name ?? ""}
      className={`${box} shrink-0 rounded-full border border-line object-cover`}
    />
  ) : (
    <span
      aria-hidden
      className={`${box} flex shrink-0 items-center justify-center rounded-full bg-brand font-semibold text-brand-foreground`}
    >
      {name?.charAt(0).toUpperCase()}
    </span>
  );
}

export default function UserMenu() {
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const mounted = useMounted();
  const {
    active: fullscreen,
    supported: fullscreenSupported,
    toggle,
  } = useFullscreen();
  const standalone = useStandalone();
  const [open, setOpen] = useState(false);

  // Same rule the standalone button used: hide where it would be a dead control.
  const showFullscreen = fullscreenSupported && !standalone;
  const FullscreenIcon = fullscreen ? Minimize : Maximize;

  const panel = (
    <div className="w-72 rounded-xl border border-line bg-surface-raised p-1.5 shadow-lg">
      <div className="flex items-center gap-3 px-2.5 py-1">
        <Avatar url={user?.avatar_url} name={user?.name} size="lg" />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-fg">{user?.name}</p>
          <p className="truncate text-xs text-fg-muted">{user?.email}</p>
        </div>
      </div>

      <div className="my-1 border-t border-line" />

      <Link
        href="/admin/profile"
        onClick={() => setOpen(false)}
        className={`${ROW} text-fg-muted hover:bg-surface-sunken/50! hover:text-fg!`}
      >
        <UserRound className="h-4.5 w-4.5 shrink-0" />
        <span>My profile</span>
      </Link>

      {user?.role === "owner" && (
        <Link
          href="/admin/settings"
          onClick={() => setOpen(false)}
          className={`${ROW} text-fg-muted hover:bg-surface-sunken/50! hover:text-fg!`}
        >
          <Settings className="h-4.5 w-4.5 shrink-0" />
          <span>Settings</span>
        </Link>
      )}

      {showFullscreen && (
        <button
          type="button"
          aria-pressed={fullscreen}
          onClick={() => {
            setOpen(false);
            toggle();
          }}
          className={`${ROW} text-fg-muted hover:bg-surface-sunken/50! hover:text-fg!`}
        >
          <FullscreenIcon className="h-4.5 w-4.5 shrink-0" />
          <span>{fullscreen ? "Exit fullscreen" : "Fullscreen"}</span>
        </button>
      )}

      <div className="my-1 border-t border-line" />

      <div className="flex min-h-9 items-center justify-between gap-2 px-2.5">
        <span className="text-sm text-fg-muted">Theme</span>
        {mounted ? (
          <div className="flex items-center gap-0.5 rounded-lg border border-line bg-surface-sunken p-0.5">
            {THEMES.map(({ key, icon: Icon, label }) => (
              <button
                key={key}
                type="button"
                aria-label={label}
                aria-pressed={theme === key}
                onClick={() => setTheme(key)}
                className={`flex h-6 w-8 cursor-pointer items-center justify-center rounded-md transition-colors duration-200 ${
                  theme === key
                    ? "bg-surface-raised text-fg shadow-card"
                    : "text-fg-subtle hover:text-fg-muted"
                }`}
              >
                <Icon className="h-4 w-4" />
              </button>
            ))}
          </div>
        ) : (
          <div className="h-9 w-[6.75rem]" />
        )}
      </div>

      <div className="my-1 border-t border-line" />

      <button
        type="button"
        onClick={() => {
          setOpen(false);
          logout();
        }}
        className={`${ROW} text-rose-600 hover:bg-rose-50/70 dark:text-rose-400 dark:hover:bg-rose-500/15`}
      >
        <LogOut className="h-4.5 w-4.5 shrink-0" />
        <span>Log out</span>
      </button>
    </div>
  );

  return (
    <Dropdown
      trigger={["click"]}
      open={open}
      onOpenChange={setOpen}
      placement="bottomRight"
      popupRender={() => panel}
    >
      <button
        type="button"
        aria-label="Account menu"
        aria-haspopup="menu"
        aria-expanded={open}
        className={`flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-transparent py-5.5 pl-1 pr-1 transition-colors duration-200 hover:bg-surface-sunken sm:pr-2 ${
          open ? "border-line bg-surface-sunken" : ""
        }`}
      >
        <Avatar url={user?.avatar_url} name={user?.name} size="md" />
        <div className="hidden sm:flex flex-col">
          <span className="max-w-32 truncate text-sm font-medium text-fg sm:block">
            {user?.name}
          </span>
          <span className="w-fit inline-block rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-medium capitalize text-brand-soft-foreground">
            {user?.role}
          </span>
        </div>
        <ChevronDown
          className={`h-4 w-4 hidden sm:block shrink-0 text-fg-subtle transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>
    </Dropdown>
  );
}
