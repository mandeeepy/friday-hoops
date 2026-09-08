export type Period = "week" | "month" | "year" | "all" | "custom";
export function today() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Hong_Kong",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
export function shiftDate(s: string, days: number) {
  const d = new Date(s + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export function range(period: Period, anchor: string, earliest: string) {
  const d = new Date(anchor + "T12:00:00Z");
  if (period === "all") return { from: earliest, to: anchor };
  if (period === "year")
    return {
      from: `${d.getUTCFullYear()}-01-01`,
      to: `${d.getUTCFullYear()}-12-31`,
    };
  if (period === "month")
    return {
      from: anchor.slice(0, 7) + "-01",
      to: new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0, 12))
        .toISOString()
        .slice(0, 10),
    };
  const from = shiftDate(anchor, -((d.getUTCDay() + 6) % 7));
  return { from, to: shiftDate(from, 6) };
}
export function prettyDate(s: string) {
  return new Date(s + "T12:00:00Z").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}
