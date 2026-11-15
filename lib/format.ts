const INR = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const INT = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

const MINUS = "\u2212";

export function formatINR(n: number | null | undefined): string {
  return n == null ? "—" : INR.format(n);
}

export function formatSignedINR(n: number | null | undefined): string {
  if (n == null) return "—";
  const sign = n > 0 ? "+" : n < 0 ? MINUS : "";
  return sign + INR.format(Math.abs(n));
}

export function formatPct(n: number | null | undefined): string {
  if (n == null) return "—";
  const sign = n > 0 ? "+" : n < 0 ? MINUS : "";
  return `${sign}${Math.abs(n).toFixed(2)}%`;
}

// Indian units: 1 L (lakh) = 1,00,000; 1 Cr (crore) = 1,00,00,000.
export function formatVolume(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1e7) return `${(n / 1e7).toFixed(2)} Cr`;
  if (n >= 1e5) return `${(n / 1e5).toFixed(2)} L`;
  return INT.format(n);
}

export function formatRatio(n: number | null | undefined): string {
  return n == null ? "—" : `${n.toFixed(1)}x`;
}

// Dates are exchange-local (IST) calendar days in YYYY-MM-DD form.
export function formatDate(isoDay: string | null | undefined, withYear = true): string {
  if (!isoDay) return "—";
  const parts = new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).formatToParts(new Date(`${isoDay}T12:00:00+05:30`));
  const get = (t: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === t)?.value ?? "";
  const base = `${get("weekday")}, ${get("day")} ${get("month")}`;
  return withYear ? `${base} ${get("year")}` : base;
}

export function changeTone(n: number | null | undefined): "up" | "down" | "flat" {
  if (n == null || n === 0) return "flat";
  return n > 0 ? "up" : "down";
}
