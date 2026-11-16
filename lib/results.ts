// QoQ / YoY comparisons on Screener's quarterly table. Quarters are matched by their
// quarter-end date (Screener's data-date-key), never by column position.
import type { FinTable, QuarterRow, Quarters } from "./screener";

export type Change =
  | { kind: "pct"; value: number } // percentage change for amount rows
  | { kind: "pp"; value: number } // percentage-point change for % rows
  | { kind: "missing" } // comparison quarter or value is not on Screener
  | { kind: "nm" }; // not meaningful: base is zero or negative

export type MetricLine = {
  label: string; // what Dreamstockifier calls it
  source: string; // Screener's row name
  note?: string;
  percent: boolean;
  current: number | null;
  prev: number | null;
  yearAgo: number | null;
  qoq: Change;
  yoy: Change;
};

export type ResultsView = {
  latest: { key: string | null; label: string };
  prevQuarter: string | null; // label of the QoQ comparison quarter, if Screener has it
  yearAgoQuarter: string | null;
  basis: Quarters["basis"];
  unit: string | null;
  format: "standard" | "screener-rows";
  lines: MetricLine[];
  cols: { latest: number; prev: number; yearAgo: number }; // column indexes in the quarterly table (-1 = absent)
  source: { url: string; fetchedAt: string } | null; // the Screener page, for receipts
};

/** Shifts a quarter-end date (YYYY-MM-DD) back by whole months, landing on that month's last day. */
export function shiftQuarterEnd(key: string, months: number): string {
  const [y, m] = key.split("-").map(Number);
  const end = new Date(Date.UTC(y, m - 1 - months + 1, 0)); // day 0 = last day of previous month
  return end.toISOString().slice(0, 10);
}

export function change(current: number | null, base: number | null, percent: boolean): Change {
  if (current === null || base === null) return { kind: "missing" };
  if (percent) return { kind: "pp", value: round(current - base, 2) };
  if (base <= 0) return { kind: "nm" };
  return { kind: "pct", value: round(((current - base) / base) * 100, 2) };
}

export function round(n: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

/** Index of the latest quarter column (Screener puts it last). */
function latestIndex(q: FinTable): number {
  return q.periods.length - 1;
}

export function indexOfKey(q: FinTable, key: string | null): number {
  if (!key) return -1;
  return q.periods.findIndex((p) => p.key === key);
}

export function findRow(q: FinTable, name: string): QuarterRow | undefined {
  return q.rows.find((r) => r.name.toLowerCase() === name.toLowerCase());
}

const STANDARD: { label: string; source: string; note?: string }[] = [
  { label: "Revenue", source: "Sales" },
  { label: "EBITDA", source: "Operating Profit", note: "Screener's Operating Profit (Sales − Expenses, before Other Income)" },
  { label: "PBT", source: "Profit before tax" },
  { label: "PAT", source: "Net Profit" },
];

// Derived helper rows Screener adds; Dreamstockifier computes YoY itself.
const SKIP = /^YoY .* growth$/i;

export function buildResults(q: Quarters, source: { url: string; fetchedAt: string } | null = null): ResultsView {
  const li = latestIndex(q);
  const latest = q.periods[li];
  const prevKey = latest.key ? shiftQuarterEnd(latest.key, 3) : null;
  const yearKey = latest.key ? shiftQuarterEnd(latest.key, 12) : null;
  const pi = indexOfKey(q, prevKey);
  const yi = indexOfKey(q, yearKey);

  const line = (label: string, source: string, row: QuarterRow | undefined, note?: string): MetricLine => {
    if (!row) {
      return { label, source, note, percent: false, current: null, prev: null, yearAgo: null, qoq: { kind: "missing" }, yoy: { kind: "missing" } };
    }
    const current = row.values[li] ?? null;
    const prev = pi >= 0 ? (row.values[pi] ?? null) : null;
    const yearAgo = yi >= 0 ? (row.values[yi] ?? null) : null;
    return {
      label,
      source,
      note,
      percent: row.percent,
      current,
      prev,
      yearAgo,
      qoq: change(current, prev, row.percent),
      yoy: change(current, yearAgo, row.percent),
    };
  };

  // Standard companies have Sales + Operating Profit. Banks and NBFCs use different rows
  // (Revenue, Financing Profit, …), so for them every Screener row is shown under its own name.
  const standard = Boolean(findRow(q, "Sales") && findRow(q, "Operating Profit"));
  const lines = standard
    ? STANDARD.map((m) => line(m.label, m.source, findRow(q, m.source), m.note))
    : q.rows.filter((r) => !SKIP.test(r.name)).map((r) => line(r.name, r.name, r));

  return {
    latest: { key: latest.key, label: latest.label },
    prevQuarter: pi >= 0 ? q.periods[pi].label : null,
    yearAgoQuarter: yi >= 0 ? q.periods[yi].label : null,
    basis: q.basis,
    unit: q.unit,
    format: standard ? "standard" : "screener-rows",
    lines,
    cols: { latest: li, prev: pi, yearAgo: yi },
    source,
  };
}
