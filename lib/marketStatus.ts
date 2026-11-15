// NSE regular session is 09:15–15:30 IST, Monday to Friday. Exchange holidays aren't known
// here, so this only ever asserts "closed" when that is certain from the clock.
export function isNseCertainlyClosed(now = new Date()): boolean {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  if (get("weekday") === "Sat" || get("weekday") === "Sun") return true;
  const minutes = Number(get("hour")) * 60 + Number(get("minute"));
  return minutes < 9 * 60 + 15 || minutes >= 15 * 60 + 30;
}
