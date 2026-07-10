"use client";
import { ReactNode } from "react";
import { ThemeProvider as NextThemesProvider, useTheme } from "next-themes";
import { ConfigProvider, theme as antdTheme, App } from "antd";

// Single theming authority: next-themes writes .dark on <html> pre-paint,
// and this bridge feeds Ant Design the matching algorithm + brand tokens so
// every AntD component themes automatically.
function AntdThemeBridge({ children }: { children: ReactNode }) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  return (
    <ConfigProvider
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
          fontFamily: "var(--font-fira-sans), ui-sans-serif, system-ui, sans-serif",
        },
      }}
    >
      <App>{children}</App>
    </ConfigProvider>
  );
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="system" enableSystem>
      <AntdThemeBridge>{children}</AntdThemeBridge>
    </NextThemesProvider>
  );
}
