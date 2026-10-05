import type { Lang } from "./config";

// Module copy of the active language for code that runs outside React (toasts
// raised from services, apiError, fmtDate). Set by LanguageProvider, and only
// meaningful in the browser: during SSR renders go through the React context.
let current: Lang = "en";

export const getLang = () => current;
export const setCurrentLang = (lang: Lang) => {
  current = lang;
};
