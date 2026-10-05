import dayjs, { Dayjs } from "dayjs";

// Bonus pages share one optional period filter: null = all time (the
// default, so old clients and every purchase show up without picking dates).
export type BonusPeriod = [Dayjs, Dayjs] | null;

// API params / URL query for a period ({} = all time)
export function periodParams(range: BonusPeriod): { from?: string; to?: string } {
  return range ? { from: range[0].format("YYYY-MM-DD"), to: range[1].format("YYYY-MM-DD") } : {};
}

export function periodFromQuery(from: string | null, to: string | null): BonusPeriod {
  return from && to && dayjs(from).isValid() && dayjs(to).isValid() ? [dayjs(from), dayjs(to)] : null;
}
