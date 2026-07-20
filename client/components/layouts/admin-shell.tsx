"use client";
import { ReactNode, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Layout, Tooltip } from "antd";
import {
  LayoutDashboard,
  ShoppingCart,
  Boxes,
  Users,
  ReceiptText,
  BarChart3,
  Gift,
  UserCog,
  Settings,
  Menu as MenuIcon,
  PanelLeftClose,
  PanelLeftOpen,
  ExternalLink,
  Wifi,
  WifiOff,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { getSocket } from "@/services/socket";
import { useRealtime } from "@/hooks/useRealtime";
import api from "@/services/api";
import UserMenu from "@/components/layouts/user-menu";
import PublicMenuModal from "@/components/layouts/public-menu-modal";
import PullToRefresh from "@/components/pwa/pull-to-refresh";
import type { Role, Settings as SettingsType } from "@/lib/types";

const { Header, Content, Sider } = Layout;

// Same flattened, categorized sidebar concept as WisePOS
const NAV: {
  category: string;
  items: {
    key: string;
    label: string;
    href: string;
    icon: typeof LayoutDashboard;
    roles?: Role[];
  }[];
}[] = [
  {
    category: "Overview",
    items: [
      {
        key: "dashboard",
        label: "Dashboard",
        href: "/admin/dashboard",
        icon: LayoutDashboard,
      },
    ],
  },
  {
    category: "Sales",
    items: [
      {
        key: "pos",
        label: "Sell (POS)",
        href: "/admin/pos",
        icon: ShoppingCart,
      },
    ],
  },
  {
    category: "Catalog",
    items: [
      {
        key: "inventory",
        label: "Inventory",
        href: "/admin/inventory",
        icon: Boxes,
      },
      { key: "clients", label: "Clients", href: "/admin/clients", icon: Users },
    ],
  },
  {
    category: "Accounting",
    items: [
      {
        key: "reports",
        label: "Reports",
        href: "/admin/reports",
        icon: BarChart3,
        roles: ["owner", "admin"],
      },
      {
        key: "invoices",
        label: "Invoices",
        href: "/admin/invoices",
        icon: ReceiptText,
      },
      {
        key: "bonus",
        label: "Bonus",
        href: "/admin/bonus",
        icon: Gift,
        roles: ["owner", "admin"],
      },
    ],
  },
  {
    category: "System",
    items: [
      {
        key: "staff",
        label: "Staff",
        href: "/admin/staff",
        icon: UserCog,
        roles: ["owner"],
      },
      {
        key: "settings",
        label: "Settings",
        href: "/admin/settings",
        icon: Settings,
        roles: ["owner"],
      },
    ],
  },
];

// The socket is created only after /auth/me resolves, so re-subscribe when
// the user appears — subscribing once on mount raced it and stayed "Offline".
function useSocketConnected(userId?: number) {
  const [connected, setConnected] = useState(false);
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    setConnected(socket.connected);
    const on = () => setConnected(true);
    const off = () => setConnected(false);
    socket.on("connect", on);
    socket.on("disconnect", off);
    return () => {
      socket.off("connect", on);
      socket.off("disconnect", off);
    };
  }, [userId]);
  return connected;
}

export default function AdminShell({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [broken, setBroken] = useState(false); // below the lg breakpoint
  const [settings, setSettings] = useState<SettingsType | null>(null);
  const [menuOpen, setMenuOpen] = useState(false); // public-menu share dialog
  const connected = useSocketConnected(user?.id);

  useEffect(() => {
    api
      .get("/settings")
      .then(({ data }) => setSettings(data))
      .catch(() => {});
  }, []);
  useRealtime(["settings:changed"], (_e, payload) =>
    setSettings(payload as SettingsType),
  );

  const nav = NAV.map((section) => ({
    ...section,
    items: section.items.filter(
      (i) => !i.roles || (user && i.roles.includes(user.role)),
    ),
  })).filter((s) => s.items.length > 0);

  const closeOnMobile = () => {
    if (broken) setCollapsed(true);
  };

  // Swipe to open/close the mobile drawer, the way a native app does.
  // Open: a horizontal drag starting from the very left edge. Close: a
  // horizontal left-swipe while the drawer is open (the page underneath is
  // covered by the backdrop, so nothing there competes for the gesture).
  // Only wired below the lg breakpoint; desktop uses the collapse button.
  useEffect(() => {
    if (!broken) return;
    const EDGE = 24; // px from the left edge that count as an open-swipe start
    const THRESHOLD = 55; // horizontal px that commit the gesture
    let start: { x: number; y: number; valid: boolean } | null = null;

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) {
        start = null;
        return;
      }
      const t = e.touches[0];
      // Open gesture must begin at the screen edge; close gesture can begin
      // anywhere while the drawer is open.
      const valid = collapsed ? t.clientX <= EDGE : true;
      start = { x: t.clientX, y: t.clientY, valid };
    };
    const onEnd = (e: TouchEvent) => {
      const s = start;
      start = null;
      if (!s?.valid) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - s.x;
      const dy = t.clientY - s.y;
      if (Math.abs(dx) < THRESHOLD || Math.abs(dx) <= Math.abs(dy)) return;
      if (collapsed && dx > 0) setCollapsed(false); // edge swipe right → open
      else if (!collapsed && dx < 0) setCollapsed(true); // swipe left → close
    };

    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchend", onEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchend", onEnd);
    };
  }, [broken, collapsed]);

  return (
    <Layout className="min-h-screen">
      {/* Reload gesture for the chromeless PWA / fullscreen (no refresh button there) */}
      <PullToRefresh />
      <PublicMenuModal
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        menuPublic={!!settings?.menu_public}
        canEditSettings={user?.role === "owner"}
      />
      {/* Mobile: the open sidebar floats over the page; tapping anywhere outside closes it */}
      {broken && !collapsed && (
        <div
          className="fixed inset-0 z-40 bg-black/40"
          aria-hidden
          onClick={() => setCollapsed(true)}
        />
      )}
      <Sider
        collapsible
        collapsed={collapsed}
        trigger={null}
        width={232}
        collapsedWidth={broken ? 0 : 72}
        breakpoint="lg"
        onBreakpoint={(isBroken) => {
          setBroken(isBroken);
          setCollapsed(isBroken);
        }}
        className="!bg-surface-raised border-r border-line"
        style={
          broken
            ? {
                position: "fixed",
                top: 0,
                bottom: 0,
                left: 0,
                height: "100dvh",
                zIndex: 50,
              }
            : { position: "sticky", top: 0, height: "100vh", zIndex: 40 }
        }
      >
        <div className="flex h-full flex-col">
          <Link
            href="/admin/dashboard"
            onClick={closeOnMobile}
            className={`flex h-14 shrink-0 items-center border-b border-line px-4 ${collapsed ? "justify-center px-2" : ""}`}
          >
            {collapsed ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src="/images/chomnenh-mark.png"
                alt="Chomnenh"
                className="h-8 w-8 shrink-0 rounded-lg"
              />
            ) : (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/images/Chomnenh-logo.png"
                  alt="Chomnenh"
                  className="h-7 w-auto dark:hidden"
                />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/images/Chomnenh-logo-white.png"
                  alt="Chomnenh"
                  className="hidden h-7 w-auto dark:block"
                />
              </>
            )}
          </Link>

          <nav className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
            {nav.map((section) => (
              <div key={section.category} className="mb-2">
                {!collapsed && (
                  <p className="px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
                    {section.category}
                  </p>
                )}
                {section.items.map((item) => {
                  const active = pathname.startsWith(item.href);
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.key}
                      href={item.href}
                      onClick={closeOnMobile}
                      title={collapsed ? item.label : undefined}
                      className={`mb-0.5 flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm transition-colors duration-200 ${
                        active
                          ? "bg-brand-soft font-medium text-brand-soft-foreground"
                          : "text-fg-muted hover:bg-surface-sunken hover:text-fg"
                      } ${collapsed ? "justify-center" : ""}`}
                    >
                      <Icon className="h-4.5 w-4.5 shrink-0" />
                      {!collapsed && (
                        <span className="truncate">{item.label}</span>
                      )}
                    </Link>
                  );
                })}
              </div>
            ))}

            <div className="mt-4 border-t border-line pt-3">
              {/* Opens a share dialog (copy link / QR / open) instead of jumping
                  straight to the menu, so staff can hand the link to a customer */}
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(true);
                  closeOnMobile();
                }}
                title={collapsed ? "Public menu" : undefined}
                className={`flex w-full cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 text-sm text-fg-muted transition-colors duration-200 hover:bg-surface-sunken hover:text-fg ${
                  collapsed ? "justify-center" : ""
                }`}
              >
                <ExternalLink className="h-4.5 w-4.5 shrink-0" />
                {!collapsed && <span>Public menu</span>}
              </button>
            </div>
          </nav>

          {/* Desktop: collapse control lives at the bottom of the sidebar */}
          {!broken && (
            <div className="sider-safe shrink-0 border-t border-line p-2">
              <button
                type="button"
                aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                onClick={() => setCollapsed(!collapsed)}
                className={`flex w-full cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 text-sm text-fg-muted transition-colors duration-200 hover:bg-surface-sunken hover:text-fg ${
                  collapsed ? "justify-center" : ""
                }`}
              >
                {collapsed ? (
                  <PanelLeftOpen className="h-4.5 w-4.5 shrink-0" />
                ) : (
                  <>
                    <PanelLeftClose className="h-4.5 w-4.5 shrink-0" />
                    <span>Collapse</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </Sider>

      <Layout>
        <Header
          className="!sticky !top-0 z-30 flex !h-14 items-center justify-between border-b border-line !bg-surface-raised px-2! sm:!px-4 shadow-card"
          style={{ lineHeight: "normal" }}
        >
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            {broken && (
              <button
                type="button"
                aria-label="Open menu"
                onClick={() => setCollapsed(!collapsed)}
                className="-ml-1 flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-lg text-fg-muted transition-colors duration-200 hover:bg-surface-sunken hover:text-fg"
              >
                <MenuIcon className="h-5 w-5" />
              </button>
            )}

            <div className="flex min-w-0 items-center gap-2.5">
              {settings?.logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={settings.logo_url}
                  alt={settings.business_name}
                  className="h-8 w-8 shrink-0 object-cover"
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src="/images/chomnenh-mark.png"
                  alt=""
                  className="h-8 w-8 shrink-0 rounded-lg"
                />
              )}
              <span className="truncate text-sm font-semibold text-fg">
                {settings?.business_name ?? ""}
              </span>
            </div>

            <span className="hidden h-5 w-px shrink-0 bg-line sm:block" />

            <Tooltip
              title={
                connected
                  ? "Live: connected to the server, this page updates in realtime"
                  : "Offline: no realtime connection, data may be stale until reload"
              }
            >
              <span
                className={`inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full border px-2 text-xs font-medium ${
                  connected
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/25 dark:bg-emerald-500/15 dark:text-emerald-300"
                    : "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/25 dark:bg-rose-500/15 dark:text-rose-300"
                }`}
              >
                {connected ? (
                  <Wifi className="h-3.5 w-3.5" />
                ) : (
                  <WifiOff className="h-3.5 w-3.5" />
                )}
                <span className="hidden sm:inline">
                  {connected ? "Live" : "Offline"}
                </span>
              </span>
            </Tooltip>
          </div>

          <div className="flex shrink-0 items-center">
            <UserMenu />
          </div>
        </Header>

        <Content className="!bg-surface content-safe">{children}</Content>
      </Layout>
    </Layout>
  );
}
