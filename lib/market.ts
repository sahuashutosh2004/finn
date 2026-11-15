// Shared by the Next app and scripts/refresh.ts, so keep imports relative and free of Next APIs.

export type Bar = { date: string; close: number; volume: number | null };

export type StockData = {
  ok: true;
  symbol: string;
  yahooSymbol: string;
  name: string | null; // Yahoo longName / shortName
  currency: string | null;
  history: Bar[]; // oldest first, one per trading day
  lastDate: string;
  lastClose: number;
  prevClose: number | null;
  dayChange: number | null;
  dayChangePct: number | null;
  lastVolume: number | null;
  avgVolume20: number | null; // mean of the 20 sessions before lastDate
  volumeRatio: number | null; // lastVolume / avgVolume20
  high52w: number | null;
  low52w: number | null;
  droppedPartialBar: boolean; // true if an in-session bar for today was excluded
};

export type StockError = {
  ok: false;
  symbol: string;
  yahooSymbol: string;
  error: string;
};

export type StockResult = StockData | StockError;

export const YAHOO_CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart/{SYMBOL}.NS?range=1y&interval=1d";

export function yahooSymbol(symbol: string): string {
  return `${symbol}.NS`;
}

export function chartUrl(symbol: string): string {
  return `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol(symbol))}?range=1y&interval=1d`;
}

type YahooChart = {
  chart?: {
    result?: Array<{
      meta?: {
        currency?: string;
        longName?: string;
        shortName?: string;
        fiftyTwoWeekHigh?: number;
        fiftyTwoWeekLow?: number;
        currentTradingPeriod?: { regular?: { start?: number; end?: number } };
      };
      timestamp?: number[];
      indicators?: { quote?: Array<{ close?: (number | null)[]; volume?: (number | null)[] }> };
    }> | null;
    error?: { code?: string; description?: string } | null;
  };
};

function istDate(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function parseChart(symbol: string, json: YahooChart, nowSeconds = Date.now() / 1000): StockResult {
  const ySym = yahooSymbol(symbol);
  const fail = (error: string): StockError => ({ ok: false, symbol, yahooSymbol: ySym, error });

  if (json.chart?.error) {
    return fail(`Yahoo: ${json.chart.error.description ?? json.chart.error.code ?? "unknown error"}`);
  }
  const result = json.chart?.result?.[0];
  if (!result) return fail("Yahoo returned no result");

  const ts = result.timestamp ?? [];
  const quote = result.indicators?.quote?.[0];
  const closes = quote?.close ?? [];
  const volumes = quote?.volume ?? [];

  let bars: (Bar & { ts: number })[] = [];
  ts.forEach((t, i) => {
    const close = closes[i];
    if (typeof close !== "number" || !Number.isFinite(close)) return;
    const v = volumes[i];
    bars.push({ ts: t, date: istDate(t), close: round2(close), volume: typeof v === "number" ? v : null });
  });

  // During market hours Yahoo's last daily bar is the live, unfinished session. Drop it so
  // every number is an end-of-day close.
  const regular = result.meta?.currentTradingPeriod?.regular;
  let droppedPartialBar = false;
  const last = bars.at(-1);
  if (last && regular?.start && regular?.end && last.ts >= regular.start && nowSeconds < regular.end) {
    bars = bars.slice(0, -1);
    droppedPartialBar = true;
  }

  if (bars.length === 0) return fail("Yahoo returned no daily closes");

  const lastBar = bars[bars.length - 1];
  const prevBar = bars.length > 1 ? bars[bars.length - 2] : null;
  const prior20 = bars
    .slice(-21, -1)
    .map((b) => b.volume)
    .filter((v): v is number => v !== null);
  const avgVolume20 = prior20.length === 20 ? Math.round(prior20.reduce((a, b) => a + b, 0) / 20) : null;

  const dayChange = prevBar ? round2(lastBar.close - prevBar.close) : null;
  const dayChangePct = prevBar && prevBar.close !== 0 ? ((lastBar.close - prevBar.close) / prevBar.close) * 100 : null;

  const meta = result.meta ?? {};
  return {
    ok: true,
    symbol,
    yahooSymbol: ySym,
    name: meta.longName ?? meta.shortName ?? null,
    currency: meta.currency ?? null,
    history: bars.map(({ date, close, volume }) => ({ date, close, volume })),
    lastDate: lastBar.date,
    lastClose: lastBar.close,
    prevClose: prevBar?.close ?? null,
    dayChange,
    dayChangePct: dayChangePct === null ? null : Math.round(dayChangePct * 100) / 100,
    lastVolume: lastBar.volume,
    avgVolume20,
    volumeRatio:
      lastBar.volume !== null && avgVolume20 ? Math.round((lastBar.volume / avgVolume20) * 100) / 100 : null,
    high52w: typeof meta.fiftyTwoWeekHigh === "number" ? meta.fiftyTwoWeekHigh : null,
    low52w: typeof meta.fiftyTwoWeekLow === "number" ? meta.fiftyTwoWeekLow : null,
    droppedPartialBar,
  };
}

export async function fetchStock(symbol: string, init?: RequestInit): Promise<StockResult> {
  const fail = (error: string): StockError => ({ ok: false, symbol, yahooSymbol: yahooSymbol(symbol), error });
  let lastError = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 1000));
    try {
      const res = await fetch(chartUrl(symbol), {
        ...init,
        headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json", ...init?.headers },
      });
      const text = await res.text();
      let json: YahooChart;
      try {
        json = JSON.parse(text) as YahooChart;
      } catch {
        lastError = `HTTP ${res.status}: response was not JSON`;
        if (res.status === 429 || res.status >= 500) continue;
        return fail(lastError);
      }
      if (!res.ok && !json.chart?.error) {
        lastError = `HTTP ${res.status}`;
        if (res.status === 429 || res.status >= 500) continue;
        return fail(lastError);
      }
      return parseChart(symbol, json);
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }
  }
  return fail(lastError || "Request failed");
}
