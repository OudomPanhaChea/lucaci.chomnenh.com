// Server-safe half of the i18n layer: app/layout.tsx (a server component)
// reads the cookie with these, so nothing here may be a "use client" export.
export type Lang = "en" | "km";

export const LANG_COOKIE = "chomnenh_lang";

export function parseLang(value?: string | null): Lang {
  return value === "km" ? "km" : "en";
}
