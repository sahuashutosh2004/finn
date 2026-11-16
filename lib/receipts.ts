// A receipt says where a number on screen came from: source, table/row/column or document,
// the raw value there, a link and when it was fetched. Calculated numbers carry their formula
// and the receipts of their inputs.
import { formatDate, formatINR, formatPct, formatRatio, formatVolume } from "./format";
import { chartUrl, type StockData } from "./market";
import type { Change, ResultsView } from "./results";
import type { FinTable, ScreenerData } from "./screener";

export type Source = "Yahoo Finance" | "Screener" | "BSE" | "Filing PDF" | "Transcript PDF" | "Dreamstockifier calculation";

export type Receipt = {
  label: string;
  value: string; // as displayed
  raw: string | null; // as written at the source
  source: Source;
  where: string;
  url: string | null;
  fetchedAt: string | null;
  formula?: string;
  inputs?: Receipt[];
  note?: string;
};

export const TABLES = {
  quarters: { title: "Quarterly Results", anchor: "quarters" },
  profitLoss: { title: "Profit & Loss", anchor: "profit-loss" },
  balanceSheet: { title: "Balance Sheet", anchor: "balance-sheet" },
  cashFlow: { title: "Cash Flows", anchor: "cash-flow" },
  ratios: { title: "Ratios", anchor: "ratios" },
} as const;
export type TableKey = keyof typeof TABLES;

const IN = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });

/** Screener writes numbers with Indian grouping; this reproduces the cell as shown there. */
export function screenerRaw(v: number | null, percent = false): string | null {
  if (v === null) return null;
  return `${IN.format(v)}${percent ? "%" : ""}`;
}

export function pageUrl(sd: Pick<ScreenerData, "url">, anchor: string): string {
  return `${sd.url.replace(/#.*$/, "")}#${anchor}`;
}

export function cellReceipt(
  sd: Pick<ScreenerData, "url" | "fetchedAt">,
  key: TableKey,
  table: FinTable,
  rowName: string,
  col: number,
  display?: string,
): Receipt | null {
  const row = table.rows.find((r) => r.name === rowName);
  const period = table.periods[col];
  if (!row || !period) return null;
  const v = row.values[col] ?? null;
  const raw = screenerRaw(v, row.percent);
  const unit = !row.percent && table.unit === "Rs. Crores" && !/EPS|Days|%/.test(rowName) ? " Cr" : "";
  return {
    label: `${rowName} · ${period.label}`,
    value: display ?? (raw === null ? "blank" : `${raw}${unit}`),
    raw,
    source: "Screener",
    where: `${TABLES[key].title}${table.basis ? ` (${table.basis})` : ""} · row “${rowName}” · column “${period.label}”`,
    url: pageUrl(sd, TABLES[key].anchor),
    fetchedAt: sd.fetchedAt,
  };
}

export function calcReceipt(label: string, value: string, formula: string, inputs: (Receipt | null)[]): Receipt {
  return {
    label,
    value,
    raw: null,
    source: "Dreamstockifier calculation",
    where: "Calculated by Dreamstockifier from the inputs below",
    url: null,
    fetchedAt: inputs.find((i) => i?.fetchedAt)?.fetchedAt ?? null,
    formula,
    inputs: inputs.filter((i): i is Receipt => i !== null),
  };
}

export function topRatioReceipt(sd: ScreenerData, name: string, display: string): Receipt | null {
  const r = sd.topRatios.find((t) => t.name === name);
  if (!r) return null;
  return {
    label: name,
    value: display,
    raw: r.raw,
    source: "Screener",
    where: `Top ratios · “${name}”`,
    url: pageUrl(sd, "top-ratios"),
    fetchedAt: sd.fetchedAt,
  };
}

export function growthReceipt(sd: ScreenerData, rangeName: string, label: string, display: string): Receipt | null {
  const g = sd.growth.find((x) => x.name === rangeName)?.items.find((i) => i.label === label);
  if (!g) return null;
  return {
    label: `${rangeName} · ${label}`,
    value: display,
    raw: g.value === null ? null : `${g.value}%`,
    source: "Screener",
    where: `Profit & Loss · “${rangeName}” · “${label}”`,
    url: pageUrl(sd, "profit-loss"),
    fetchedAt: sd.fetchedAt,
  };
}

export function docReceipt(source: "Filing PDF" | "Transcript PDF" | "BSE", label: string, value: string, url: string | null, where: string, fetchedAt: string | null): Receipt {
  return { label, value, raw: value, source, where, url, fetchedAt };
}

export type PriceReceipts = { close: Receipt; change: Receipt | null; volumeRatio: Receipt | null; lastVolume: Receipt; avgVolume: Receipt | null; high52: Receipt | null; low52: Receipt | null };

/** Receipts for Yahoo numbers. `check` is the refresh's Yahoo-vs-Screener price comparison, when there is one. */
export function priceReceipts(s: StockData, fetchedAt: string, check?: { screener: number | null; diffPct: number | null; flagged: boolean }): PriceReceipts {
  const url = chartUrl(s.symbol);
  const y = (label: string, value: string, raw: string, where: string, note?: string): Receipt => ({
    label,
    value,
    raw,
    source: "Yahoo Finance",
    where: `Chart API ${s.yahooSymbol} (1y, daily) · ${where}`,
    url,
    fetchedAt,
    ...(note ? { note } : {}),
  });
  const day = formatDate(s.lastDate);
  const checkNote = check
    ? check.screener === null
      ? "Couldn't cross-check: Screener had no current price."
      : `Cross-check: Screener shows ₹${new Intl.NumberFormat("en-IN").format(check.screener)} (${check.diffPct}% off)${check.flagged ? " — more than 1% apart, treat with care." : "."}`
    : undefined;
  const close = y(`Close · ${day}`, formatINR(s.lastClose), String(s.lastClose), `close on ${s.lastDate}`, checkNote);
  const prev = y("Previous close", formatINR(s.prevClose), String(s.prevClose ?? "—"), "close of the session before");
  const lastVolume = y(`Volume · ${day}`, formatVolume(s.lastVolume), String(s.lastVolume ?? "—"), `volume on ${s.lastDate}`);
  const avgVolume =
    s.avgVolume20 === null
      ? null
      : calcReceipt("Average volume (20D)", formatVolume(s.avgVolume20), "Mean volume of the 20 sessions before the last close (Yahoo daily bars)", []);
  return {
    close,
    change:
      s.dayChangePct === null
        ? null
        : calcReceipt("Day change", formatPct(s.dayChangePct), `(close − previous close) ÷ previous close = (${s.lastClose} − ${s.prevClose}) ÷ ${s.prevClose}`, [close, prev]),
    volumeRatio:
      s.volumeRatio === null || !avgVolume
        ? null
        : calcReceipt("Volume vs 20-day average", formatRatio(s.volumeRatio), `Last volume ÷ 20-day average = ${s.lastVolume} ÷ ${Math.round(s.avgVolume20!)}`, [lastVolume, avgVolume]),
    lastVolume,
    avgVolume,
    high52: s.high52w === null ? null : y("52-week high", formatINR(s.high52w), String(s.high52w), "meta.fiftyTwoWeekHigh"),
    low52: s.low52w === null ? null : y("52-week low", formatINR(s.low52w), String(s.low52w), "meta.fiftyTwoWeekLow"),
  };
}

/** Receipts for each cell of the results table: the Screener cells and the QoQ/YoY arithmetic. */
export function resultsReceipts(view: ResultsView) {
  const src = view.source;
  const where = (row: string, col: string) => `${TABLES.quarters.title}${view.basis ? ` (${view.basis})` : ""} · row “${row}” · column “${col}”`;
  const cell = (row: string, col: string | null, v: number | null, percent: boolean): Receipt | null =>
    col === null
      ? null
      : {
          label: `${row} · ${col}`,
          value: v === null ? "blank" : `${screenerRaw(v, percent)}${percent || /EPS/.test(row) || view.unit !== "Rs. Crores" ? "" : " Cr"}`,
          raw: screenerRaw(v, percent),
          source: "Screener",
          where: where(row, col),
          url: src ? pageUrl(src, "quarters") : null,
          fetchedAt: src?.fetchedAt ?? null,
        };
  const calc = (label: string, c: Change, cur: Receipt | null, base: Receipt | null, curV: number | null, baseV: number | null, percent: boolean): Receipt | null => {
    if (c.kind === "missing" || curV === null || baseV === null) return null;
    if (c.kind === "nm") return calcReceipt(label, "n/m", `Not meaningful: the comparison value (${screenerRaw(baseV)}) is zero or negative`, [cur, base]);
    const shown = `${c.value > 0 ? "+" : c.value < 0 ? "\u2212" : ""}${Math.abs(c.value).toFixed(1)}${c.kind === "pp" ? " pp" : "%"}`;
    const formula = percent
      ? `${screenerRaw(curV)}% − ${screenerRaw(baseV)}% (percentage points)`
      : `(${screenerRaw(curV)} − ${screenerRaw(baseV)}) ÷ ${screenerRaw(baseV)}`;
    return calcReceipt(label, shown, formula, [cur, base]);
  };
  return view.lines.map((l) => {
    const cur = cell(l.source, view.latest.label, l.current, l.percent);
    const prev = cell(l.source, view.prevQuarter, l.prev, l.percent);
    const ya = cell(l.source, view.yearAgoQuarter, l.yearAgo, l.percent);
    return {
      current: l.current === null ? null : cur,
      qoq: calc(`${l.label} QoQ`, l.qoq, cur, prev, l.current, l.prev, l.percent),
      yoy: calc(`${l.label} YoY`, l.yoy, cur, ya, l.current, l.yearAgo, l.percent),
    };
  });
}
