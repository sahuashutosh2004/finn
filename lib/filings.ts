import type { BseFiling } from "./bse";
import { CATEGORY_TIER, classify, type Category, type Tier } from "./classify";
import type { Announcement, ScreenerResult } from "./screener";

export type Filing = {
  id: string;
  symbol: string;
  date: string | null; // YYYY-MM-DD, IST
  title: string;
  summary: string | null;
  summarySource: "Screener" | "BSE" | null;
  url: string | null;
  category: Category;
  source: "BSE" | "Screener";
};

export type Mover = { pct: number | null; ratio: number | null };
export type Thresholds = { priceMovePct: number; volumeX: number };

export type WindowKey = "1D" | "7D" | "30D";
export const WINDOW_DAYS: Record<WindowKey, number> = { "1D": 1, "7D": 7, "30D": 30 };

/** FNV-1a: a short stable id that works on server and client. */
export function stableId(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

const pdfName = (url: string | null) => url?.match(/([0-9a-f-]{36}\.pdf)/i)?.[1]?.toLowerCase() ?? null;

/** Exchange text often carries SQL-escaped apostrophes ("Company''s"). */
const unescape = (s: string | null) => (s ? s.replace(/''/g, "'") : s);

export type FilingInput = { symbol: string; bse: BseFiling[] | null; screener: Announcement[] };

/** BSE is the full list; Screener's short text is reused when it describes the same PDF. Without BSE, Screener's 5 are used. */
export function mergeFilings({ symbol, bse, screener }: FilingInput): Filing[] {
  if (bse) {
    const bySummary = new Map(screener.flatMap((a) => (pdfName(a.url) && a.summary ? [[pdfName(a.url)!, a.summary] as const] : [])));
    return bse.map((b) => {
      const sc = unescape(bySummary.get(pdfName(b.url) ?? "") ?? null);
      const summary = sc ?? b.headline;
      return {
        id: `b-${b.newsId}`,
        symbol,
        date: b.date,
        title: b.title,
        summary,
        summarySource: sc ? "Screener" : b.headline ? "BSE" : null,
        url: b.url,
        category: classify(b.title, summary, b.bseSubcategory),
        source: "BSE",
      };
    });
  }
  return screener.map((a) => ({
    id: `s-${stableId(`${symbol}|${a.date}|${a.title}`)}`,
    symbol,
    date: a.date,
    title: unescape(a.title) ?? a.title,
    summary: unescape(a.summary),
    summarySource: a.summary ? "Screener" : null,
    url: a.url,
    category: classify(a.title, a.summary),
    source: "Screener",
  }));
}

export function collectFilings(results: ScreenerResult[], bse: Record<string, BseFiling[] | null> = {}): Filing[] {
  return results
    .flatMap((r) => (r.ok ? mergeFilings({ symbol: r.symbol, bse: bse[r.symbol] ?? null, screener: r.announcements }) : []))
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
}

export function dayDiff(from: string, to: string): number {
  const [a, b] = [from, to].map((d) => {
    const [y, m, day] = d.split("-").map(Number);
    return Date.UTC(y, m - 1, day);
  });
  return Math.round((b - a) / 86_400_000);
}

/** Filings dated within `days` calendar days before refDate (inclusive). 1D = refDate and the day before. */
export function inWindow(f: Pick<Filing, "date">, refDate: string, days: number): boolean {
  if (!f.date) return false;
  const diff = dayDiff(f.date, refDate);
  return diff >= 0 && diff <= days;
}

export function isMover(m: Mover | undefined, t: Thresholds): boolean {
  if (!m) return false;
  return (m.pct !== null && Math.abs(m.pct) >= t.priceMovePct) || (m.ratio !== null && m.ratio >= t.volumeX);
}

export type RankedFiling = Filing & { tier: Tier; boosted: boolean };

/**
 * Tier 1–3 filings for a stock that crossed the move/volume thresholds are pushed up one
 * tier (tier 1 sorts first within tier 1). Routine filings stay routine.
 */
export function rankFilings(filings: Filing[], movers: Record<string, Mover>, t: Thresholds) {
  const ranked: RankedFiling[] = filings.map((f) => {
    const base = CATEGORY_TIER[f.category];
    const boosted = base < 4 && isMover(movers[f.symbol], t);
    const tier = (boosted ? Math.max(1, base - 1) : base) as Tier;
    return { ...f, tier, boosted };
  });
  ranked.sort(
    (a, b) => a.tier - b.tier || Number(b.boosted) - Number(a.boosted) || (b.date ?? "").localeCompare(a.date ?? ""),
  );
  return {
    tiers: ([1, 2, 3] as const).map((tier) => ({ tier, items: ranked.filter((f) => f.tier === tier) })),
    routine: ranked.filter((f) => f.tier === 4),
  };
}
