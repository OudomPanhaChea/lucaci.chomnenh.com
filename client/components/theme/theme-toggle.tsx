"use client";
import { useTheme } from "next-themes";
import { Sun, Moon, Monitor } from "lucide-react";
import { useMounted } from "@/hooks/useMounted";
import { useT } from "@/lib/i18n";

const MODES = [
  { key: "light", icon: Sun, label: "Light" },
  { key: "dark", icon: Moon, label: "Dark" },
  { key: "system", icon: Monitor, label: "Auto" },
] as const;

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const mounted = useMounted();
  const { t } = useT();
  if (!mounted) return <div className="h-8 w-24" />;

  return (
    <div className="flex items-center gap-0.5 rounded-lg border border-line bg-surface-sunken p-0.5">
      {MODES.map(({ key, icon: Icon, label }) => (
        <button
          key={key}
          type="button"
          aria-label={t(label)}
          aria-pressed={theme === key}
          onClick={() => setTheme(key)}
          className={`flex h-7 w-7 cursor-pointer items-center justify-center rounded-md transition-colors duration-200 ${
            theme === key
              ? "bg-surface-raised text-fg shadow-card"
              : "text-fg-subtle hover:text-fg-muted"
          }`}
        >
          <Icon className="h-4 w-4" />
        </button>
      ))}
    </div>
  );
}
