"use client";
import { ReactNode, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Layout, Dropdown } from "antd";
import {
  LayoutDashboard, ShoppingCart, Boxes, Users, ReceiptText, BarChart3,
  UserCog, Settings, LogOut, UserRound, Menu as MenuIcon,
  PanelLeftClose, PanelLeftOpen, ExternalLink, Wifi, WifiOff,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { getSocket } from "@/services/socket";
import { useRealtime } from "@/hooks/useRealtime";
import api from "@/services/api";
import ThemeToggle from "@/components/theme/theme-toggle";
import type { Role, Settings as SettingsType } from "@/lib/types";

const { Header, Content, Sider } = Layout;

// Same flattened, categorized sidebar concept as WisePOS
const NAV: { category: string; items: { key: string; label: string; href: string; icon: typeof LayoutDashboard; roles?: Role[] }[] }[] = [
  {
    category: "Overview",
    items: [{ key: "dashboard", label: "Dashboard", href: "/admin/dashboard", icon: LayoutDashboard }],
  },
  {
    category: "Sales",
    items: [
      { key: "pos", label: "Sell (POS)", href: "/admin/pos", icon: ShoppingCart },
      { key: "invoices", label: "Invoices", href: "/admin/invoices", icon: ReceiptText },
    ],
  },
  {
    category: "Catalog",
    items: [
      { key: "inventory", label: "Inventory", href: "/admin/inventory", icon: Boxes },
      { key: "clients", label: "Clients", href: "/admin/clients", icon: Users },
    ],
  },
  {
    category: "Accounting",
    items: [{ key: "reports", label: "Reports", href: "/admin/reports", icon: BarChart3, roles: ["owner", "admin"] }],
  },
  {
    category: "System",
    items: [
      { key: "staff", label: "Staff", href: "/admin/staff", icon: UserCog, roles: ["owner"] },
      { key: "settings", label: "Settings", href: "/admin/settings", icon: Settings, roles: ["owner"] },
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
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [broken, setBroken] = useState(false); // below the lg breakpoint
  const [settings, setSettings] = useState<SettingsType | null>(null);
  const connected = useSocketConnected(user?.id);

  useEffect(() => {
    api.get("/settings").then(({ data }) => setSettings(data)).catch(() => {});
  }, []);
  useRealtime(["settings:changed"], (_e, payload) => setSettings(payload as SettingsType));

  const nav = NAV.map((section) => ({
    ...section,
    items: section.items.filter((i) => !i.roles || (user && i.roles.includes(user.role))),
  })).filter((s) => s.items.length > 0);

  const closeOnMobile = () => {
    if (broken) setCollapsed(true);
  };

  return (
    <Layout className="min-h-screen">
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
            ? { position: "fixed", top: 0, bottom: 0, left: 0, height: "100dvh", zIndex: 50 }
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
              <img src="/images/chomnenh-mark.png" alt="Chomnenh" className="h-8 w-8 shrink-0 rounded-lg" />
            ) : (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/images/Chomnenh-logo.png" alt="Chomnenh" className="h-7 w-auto dark:hidden" />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/images/Chomnenh-logo-white.png" alt="Chomnenh" className="hidden h-7 w-auto dark:block" />
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
                      {!collapsed && <span className="truncate">{item.label}</span>}
                    </Link>
                  );
                })}
              </div>
            ))}

            <div className="mt-4 border-t border-line pt-3">
              {/* Plain anchor so the menu always opens in a normal browser tab,
                  never inside an installed/app window's own frame */}
              <a
                href="/menu"
                target="_blank"
                rel="noopener noreferrer"
                title={collapsed ? "Public menu" : undefined}
                className={`flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm text-fg-muted transition-colors duration-200 hover:bg-surface-sunken hover:text-fg ${
                  collapsed ? "justify-center" : ""
                }`}
              >
                <ExternalLink className="h-4.5 w-4.5 shrink-0" />
                {!collapsed && <span>Public menu</span>}
              </a>
            </div>
          </nav>

          {/* Desktop: collapse control lives at the bottom of the sidebar */}
          {!broken && (
            <div className="shrink-0 border-t border-line p-2">
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
          className="!sticky !top-0 z-30 flex !h-14 items-center justify-between border-b border-line !bg-surface-raised !px-4 shadow-card"
          style={{ lineHeight: "normal" }}
        >
          <div className="flex min-w-0 items-center gap-3">
            {broken && (
              <button
                type="button"
                aria-label="Open menu"
                onClick={() => setCollapsed(!collapsed)}
                className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-fg-muted transition-colors duration-200 hover:bg-surface-sunken hover:text-fg"
              >
                <MenuIcon className="h-4.5 w-4.5" />
              </button>
            )}

            <div className="flex min-w-0 items-center gap-2">
              {settings?.logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={settings.logo_url} alt={settings.business_name}
                  className="h-7 w-7 shrink-0 rounded-md border border-line bg-white object-cover" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src="/images/chomnenh-mark.png" alt="" className="h-7 w-7 shrink-0 rounded-md" />
              )}
              <span className="truncate text-sm font-semibold text-fg">
                {settings?.business_name ?? ""}
              </span>
            </div>

            <span
              title={connected
                ? "Live: connected to the server, this page updates in realtime"
                : "Offline: no realtime connection, data may be stale until reload"}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${
                connected
                  ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                  : "bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300"
              }`}
            >
              {connected ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
              <span className="hidden sm:inline">{connected ? "Live" : "Offline"}</span>
            </span>
          </div>

          <div className="flex shrink-0 items-center gap-3">
            <ThemeToggle />
            <Dropdown
              trigger={["click"]}
              menu={{
                items: [
                  {
                    key: "identity",
                    label: (
                      <div className="py-1">
                        <p className="font-medium">{user?.name}</p>
                        <p className="text-xs capitalize opacity-60">{user?.role}</p>
                      </div>
                    ),
                    disabled: true,
                  },
                  { type: "divider" },
                  {
                    key: "profile",
                    icon: <UserRound className="h-4 w-4" />,
                    label: <Link href="/admin/profile">My profile</Link>,
                  },
                  {
                    key: "logout",
                    icon: <LogOut className="h-4 w-4" />,
                    danger: true,
                    label: "Log out",
                    onClick: () => logout(),
                  },
                ],
              }}
            >
              <button
                type="button"
                className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 transition-colors duration-200 hover:bg-surface-sunken"
              >
                {user?.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={user.avatar_url} alt={user.name}
                    className="h-8 w-8 rounded-full border border-line object-cover" />
                ) : (
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand text-sm font-semibold text-brand-foreground">
                    {user?.name?.charAt(0).toUpperCase()}
                  </span>
                )}
                <span className="hidden text-sm font-medium text-fg sm:block">{user?.name}</span>
              </button>
            </Dropdown>
          </div>
        </Header>

        <Content className="!bg-surface p-4 md:p-6">{children}</Content>
      </Layout>
    </Layout>
  );
}
