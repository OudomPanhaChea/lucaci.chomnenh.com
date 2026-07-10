import { format, parseISO } from "date-fns";

export const money = (n: number | string | null | undefined) =>
  `$${Number(n ?? 0).toFixed(2)}`;

export const khr = (usd: number, rate: number) =>
  `${Math.round(Number(usd) * Number(rate)).toLocaleString()}៛`;

export const unitPrice = (sellPrice: number, discountPct: number) =>
  Math.round(sellPrice * (1 - discountPct / 100) * 100) / 100;

export const fmtDate = (d: string | Date | null | undefined, pattern = "dd MMM yyyy HH:mm") => {
  if (!d) return "";
  const date = typeof d === "string" ? parseISO(d) : d;
  return format(date, pattern);
};
