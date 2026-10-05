// The invoice date, written the way the business writes dates.
//
// A date on a paper is not a machine field: Cambodian invoices spell it out
// ("ថ្ងៃទី 3 ខែ 9 ឆ្នាំ 2026"), an export invoice wants 03/09/2026, and a
// letterhead may want "3 September 2026". So a date element carries a PATTERN
// string instead of a fixed format: everything in it prints literally except
// the # tokens below, which are replaced with the invoice's own date.
//
// Tokens are matched longest-first, so `#month_name` is never mistaken for
// `#month` followed by the word "_name".

export interface DateToken {
  token: string;
  label: string;
  of: (d: Date) => string;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const pad = (n: number) => String(n).padStart(2, "0");

export const DATE_TOKENS: DateToken[] = [
  { token: "#month_name", label: "Month name (September)", of: (d) => MONTHS[d.getMonth()] },
  { token: "#month_short", label: "Month short (Sep)", of: (d) => MONTHS[d.getMonth()].slice(0, 3) },
  { token: "#weekday", label: "Weekday (Monday)", of: (d) => DAYS[d.getDay()] },
  { token: "#month2", label: "Month, 2 digits (09)", of: (d) => pad(d.getMonth() + 1) },
  { token: "#month", label: "Month number (9)", of: (d) => String(d.getMonth() + 1) },
  { token: "#day2", label: "Day, 2 digits (03)", of: (d) => pad(d.getDate()) },
  { token: "#day", label: "Day (3)", of: (d) => String(d.getDate()) },
  { token: "#year2", label: "Year, 2 digits (26)", of: (d) => pad(d.getFullYear() % 100) },
  { token: "#year", label: "Year (2026)", of: (d) => String(d.getFullYear()) },
];

// Ready-made patterns, so nobody has to learn the tokens to get a normal date.
export const DATE_FORMAT_PRESETS: { label: string; pattern: string }[] = [
  { label: "Day 3 Month 9 Year 2026", pattern: "Day #day Month #month Year #year" },
  { label: "ថ្ងៃទី 3 ខែ 9 ឆ្នាំ 2026", pattern: "ថ្ងៃទី #day ខែ #month ឆ្នាំ #year" },
  { label: "03/09/2026", pattern: "#day2/#month2/#year" },
  { label: "3 September 2026", pattern: "#day #month_name #year" },
  { label: "September 3, 2026", pattern: "#month_name #day, #year" },
  { label: "03 Sep 2026", pattern: "#day2 #month_short #year" },
  { label: "2026-09-03", pattern: "#year-#month2-#day2" },
];

export const DEFAULT_DATE_FORMAT = DATE_FORMAT_PRESETS[0].pattern;

// Accepts "2026-09-03" and a full timestamp alike. A plain calendar day is
// parsed field by field, NEVER through `new Date("2026-09-03")`, which reads it
// as UTC midnight and prints the day before for anyone west of Greenwich (the
// same trap that shifted DATE columns before dateStrings was pinned server-side).
function parseDay(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatInvoiceDate(value: string | null | undefined, pattern?: string): string {
  if (!value) return "";
  const d = parseDay(value);
  if (!d) return "";
  let out = pattern?.trim() ? pattern : DEFAULT_DATE_FORMAT;
  for (const t of DATE_TOKENS) out = out.split(t.token).join(t.of(d));
  return out;
}
