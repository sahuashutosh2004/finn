export type BriefTitle = "Morning brief" | "Market live" | "Evening brief" | "Weekend brief";

/** By the IST clock: before 09:15 morning, 09:15–15:30 live, after that evening; Sat/Sun weekend. */
export function briefTitle(now = new Date()): BriefTitle {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  if (get("weekday") === "Sat" || get("weekday") === "Sun") return "Weekend brief";
  const m = Number(get("hour")) * 60 + Number(get("minute"));
  if (m < 9 * 60 + 15) return "Morning brief";
  if (m < 15 * 60 + 30) return "Market live";
  return "Evening brief";
}
