"use client";
import { useTheme } from "next-themes";
import { Sun, Moon, Monitor } from "lucide-react";
import { useMounted } from "@/hooks/useMounted";

const MODES = [
  { key: "light", icon: Sun, label: "Light theme" },
  { key: "dark", icon: Moon, label: "Dark theme" },
  { key: "system", icon: Monitor, label: "System theme" },
] as const;

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const mounted = useMounted();
  if (!mounted) return <div className="h-8 w-24" />;

  return (
    <div className="flex items-center gap-0.5 rounded-lg border border-line bg-surface-sunken p-0.5">
      {MODES.map(({ key, icon: Icon, label }) => (
        <button
          key={key}
          type="button"
          aria-label={label}
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
