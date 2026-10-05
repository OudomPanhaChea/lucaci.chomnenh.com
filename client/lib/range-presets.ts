import dayjs, { Dayjs } from "dayjs";
import type { TKey } from "@/lib/i18n";

// One preset list for every date-range picker. Built per render so "today"
// is never stale on a tablet left open overnight, and labels follow the language.
export function rangePresets(t: (key: TKey) => string): { label: string; value: [Dayjs, Dayjs] }[] {
  const now = dayjs();
  const lastMonth = now.subtract(1, "month");
  return [
    { label: t("Today"), value: [now, now] },
    { label: t("Last 7 days"), value: [now.subtract(6, "day"), now] },
    { label: t("This month"), value: [now.startOf("month"), now] },
    { label: t("Last month"), value: [lastMonth.startOf("month"), lastMonth.endOf("month")] },
    { label: t("This year"), value: [now.startOf("year"), now] },
  ];
}
