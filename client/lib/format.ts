import { format, parseISO } from "date-fns";
import { km } from "date-fns/locale/km";
import { getLang } from "@/lib/i18n/current";

export const money = (n: number | string | null | undefined) => {
  const v = Number(n ?? 0);
  const abs = Math.abs(v).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${v < 0 ? "-" : ""}$${abs}`;
};

export const num = (n: number | string | null | undefined) =>
  Number(n ?? 0).toLocaleString("en-US");

// The smallest riel bill in circulation is 100៛, so displayed KHR amounts
// round to the nearest 100 (tens digit 5 and above rounds up).
export const khr = (usd: number, rate: number) =>
  `${(Math.round((Number(usd) * Number(rate)) / 100) * 100).toLocaleString("en-US")}៛`;

// Exact riel (dollars x rate, capped at 2 decimals only to hide float noise like
// 1.1 x 4100 = 4510.000000000001). Used by the invoice template, which prints the
// figure the rate gives, not the 100៛-rounded screen amount above.
export const khrAmount = (usd: number, rate: number) =>
  (Number(usd) * Number(rate)).toLocaleString("en-US", { maximumFractionDigits: 2 });

// How a NAME prints on paper. The first letter of every word is uppercased and
// everything after it is left exactly as typed, so a name the owner meant to be
// uppercase ("NC Brand", "SOK LTD") is never rewritten, and Khmer, which has no
// case, passes through untouched. A word whose SECOND letter is already a capital
// ("iPhone") is left alone. Display only: applied where the invoice template
// renders a name, never to what is stored.
export const capitalizeName = (s: string | null | undefined) =>
  (s ?? "").replace(
    /(^|[\s'’"(\[\/-])(\p{L})(?!\p{Lu})/gu,
    (_m, sep: string, ch: string) => sep + ch.toUpperCase(),
  );

export const unitPrice =(sellPrice: number, discountPct: number) =>
  Math.round(sellPrice * (1 - discountPct / 100) * 100) / 100;

export const fmtDate = (d: string | Date | null | undefined, pattern = "dd MMM yyyy HH:mm") => {
  if (!d) return "";
  const date = typeof d === "string" ? parseISO(d) : d;
  return format(date, pattern, getLang() === "km" ? { locale: km } : undefined);
};
