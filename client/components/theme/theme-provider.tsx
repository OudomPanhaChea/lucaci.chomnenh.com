"use client";
import { ReactNode } from "react";
import { ThemeProvider as NextThemesProvider, useTheme } from "next-themes";
import { ConfigProvider, theme as antdTheme, App } from "antd";
import enUS from "antd/locale/en_US";
import kmKH from "antd/locale/km_KH";
import { useT } from "@/lib/i18n";

// Single theming authority: next-themes writes .dark on <html> pre-paint,
// and this bridge feeds Ant Design the matching algorithm + brand tokens so
// every AntD component themes automatically.
function AntdThemeBridge({ children }: { children: ReactNode }) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const { lang } = useT();
  return (
    <ConfigProvider
      locale={lang === "km" ? kmKH : enUS}
      theme={{
        algorithm: isDark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
        token: {
          colorPrimary: isDark ? "#4e7288" : "#304a59",
          colorInfo: isDark ? "#4e7288" : "#304a59",
          colorBgBase: isDark ? "#0c1520" : "#ffffff",
          colorBgContainer: isDark ? "#142332" : "#ffffff",
          colorBgElevated: isDark ? "#1a2d40" : "#ffffff",
          colorBorder: isDark ? "#23374a" : "#dde4e9",
          colorBorderSecondary: isDark ? "#1c2e3f" : "#e9edf0",
          borderRadius: 8,
          fontFamily: "var(--font-fira-sans), var(--font-kantumruy), ui-sans-serif, system-ui, sans-serif",
        },
        components: {
          // Taller buttons app-wide (incl. Modal/Popconfirm footers) for
          // comfortable touch targets; inputs keep the default heights.
          Button: {
            controlHeight: 38,
            controlHeightLG: 44,
            controlHeightSM: 28,
          },
        },
      }}
    >
      <App>{children}</App>
    </ConfigProvider>
  );
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="light" enableSystem>
      <AntdThemeBridge>{children}</AntdThemeBridge>
    </NextThemesProvider>
  );
}
