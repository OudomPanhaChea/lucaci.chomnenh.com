import { format, parseISO } from "date-fns";

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

export const khr = (usd: number, rate: number) =>
  `${Math.round(Number(usd) * Number(rate)).toLocaleString("en-US")}៛`;

export const unitPrice = (sellPrice: number, discountPct: number) =>
  Math.round(sellPrice * (1 - discountPct / 100) * 100) / 100;

export const fmtDate = (d: string | Date | null | undefined, pattern = "dd MMM yyyy HH:mm") => {
  if (!d) return "";
  const date = typeof d === "string" ? parseISO(d) : d;
  return format(date, pattern);
};
