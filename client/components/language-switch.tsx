"use client";
import { useT, type Lang } from "@/lib/i18n";

const OPTIONS: { key: Lang; label: string }[] = [
  { key: "en", label: "EN" },
  { key: "km", label: "ខ្មែរ" },
];

// Two-button EN / ខ្មែរ switch, same pill shape as the theme row in the user menu.
export default function LanguageSwitch({ className = "" }: { className?: string }) {
  const { lang, setLang, t } = useT();
  return (
    <div
      role="group"
      aria-label={t("Language")}
      className={`flex items-center gap-0.5 rounded-lg border border-line bg-surface-sunken p-0.5 ${className}`}
    >
      {OPTIONS.map((o) => (
        <button
          key={o.key}
          type="button"
          lang={o.key}
          aria-pressed={lang === o.key}
          onClick={() => setLang(o.key)}
          className={`flex h-7 min-w-10 cursor-pointer items-center justify-center rounded-md px-2 text-xs font-medium transition-colors duration-200 ${
            lang === o.key ? "bg-surface-raised text-fg shadow-card" : "text-fg-subtle hover:text-fg-muted"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
