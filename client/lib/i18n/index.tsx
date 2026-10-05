"use client";
import { createContext, ReactNode, useCallback, useContext, useMemo, useState } from "react";
import dayjs from "dayjs";
import "dayjs/locale/km";
import { km, serverMessages, serverPatterns } from "./km";
import { LANG_COOKIE, type Lang } from "./config";
import { getLang, setCurrentLang } from "./current";

export type { Lang } from "./config";

// English text is the key; km.ts maps it to Khmer. Keys are typed from the
// Khmer dictionary, so a string without a translation fails `tsc`.
export type TKey = keyof typeof km;
type Vars = Record<string, string | number>;

function fill(text: string, vars?: Vars) {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

export function translate(lang: Lang, key: TKey, vars?: Vars) {
  return fill(lang === "km" ? km[key] : key, vars);
}

// For code outside React (services, toasts): uses the module copy of the language.
export function t(key: TKey, vars?: Vars) {
  return translate(getLang(), key, vars);
}

// Server messages arrive as English text; translate the ones we know and pass
// the rest (messages carrying names or amounts) through unchanged.
export function tServer(message: string) {
  if (getLang() !== "km") return message;
  if (serverMessages[message]) return serverMessages[message];
  for (const [re, out] of serverPatterns) if (re.test(message)) return message.replace(re, out);
  return message;
}

type Ctx = {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: TKey, vars?: Vars) => string;
  // Loose lookup for labels that come from data lists (field bindings, date
  // tokens): translated when the dictionary has them, shown as-is otherwise.
  tl: (text: string) => string;
};

const LangContext = createContext<Ctx | null>(null);

function apply(lang: Lang) {
  setCurrentLang(lang);
  dayjs.locale(lang);
}

export function LanguageProvider({ initialLang, children }: { initialLang: Lang; children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang);
  if (typeof window !== "undefined") apply(lang);

  const setLang = useCallback((next: Lang) => {
    document.cookie = `${LANG_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    document.documentElement.lang = next;
    apply(next);
    setLangState(next);
  }, []);

  const value = useMemo<Ctx>(
    () => ({
      lang,
      setLang,
      t: (key, vars) => translate(lang, key, vars),
      tl: (text) => (lang === "km" ? ((km as Record<string, string>)[text] ?? text) : text),
    }),
    [lang, setLang],
  );
  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export function useT() {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error("useT must be used inside LanguageProvider");
  return ctx;
}
