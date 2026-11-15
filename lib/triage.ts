// "Top 3 for today": the most important filings and price/volume moves, one per stock.
import { CATEGORY_TIER } from "./classify";
import { WINDOW_DAYS, inWindow, isMover, type Filing, type Mover, type Thresholds } from "./filings";

export type TopItem =
  | { kind: "filing"; id: string; symbol: string; score: number; filing: Filing; boosted: boolean }
  | { kind: "move"; id: string; symbol: string; score: number; pct: number | null; ratio: number | null; priceHit: boolean; volumeHit: boolean; date: string };

const TIER_SCORE = { 1: 100, 2: 70 } as const;

export function moveId(symbol: string, date: string) {
  return `m-${symbol}-${date}`;
}

export function topThree(
  filings: Filing[],
  movers: Record<string, Mover & { date: string }>,
  t: Thresholds,
  refDate: string,
  done: ReadonlySet<string> = new Set(),
): TopItem[] {
  // Same window rule as the digest: the last day, or the last 7 days if the day was empty.
  const day = filings.filter((f) => inWindow(f, refDate, WINDOW_DAYS["1D"]));
  const pool = day.length ? day : filings.filter((f) => inWindow(f, refDate, WINDOW_DAYS["7D"]));

  const items: TopItem[] = [];
  for (const f of pool) {
    const tier = CATEGORY_TIER[f.category];
    // Only material filings; fewer than 3 items is better than padding with routine ones.
    if (tier > 2 || done.has(f.id)) continue;
    const boosted = isMover(movers[f.symbol], t);
    const age = f.date ? Math.max(0, (Date.parse(refDate) - Date.parse(f.date)) / 86_400_000) : 7;
    items.push({ kind: "filing", id: f.id, symbol: f.symbol, filing: f, boosted, score: TIER_SCORE[tier as 1 | 2] + (boosted ? 25 : 0) - 4 * age });
  }
  for (const [symbol, m] of Object.entries(movers)) {
    const priceHit = m.pct !== null && Math.abs(m.pct) >= t.priceMovePct;
    const volumeHit = m.ratio !== null && m.ratio >= t.volumeX;
    if (!priceHit && !volumeHit) continue;
    const id = moveId(symbol, m.date);
    if (done.has(id)) continue;
    const p = priceHit ? 60 + Math.min(40, 15 * (Math.abs(m.pct!) / t.priceMovePct - 1)) : 0;
    const v = volumeHit ? 50 + Math.min(30, 10 * (m.ratio! / t.volumeX - 1)) : 0;
    items.push({ kind: "move", id, symbol, pct: m.pct, ratio: m.ratio, priceHit, volumeHit, date: m.date, score: Math.max(p, v) + (priceHit && volumeHit ? 15 : 0) });
  }

  items.sort((a, b) => b.score - a.score || a.symbol.localeCompare(b.symbol));
  const seen = new Set<string>();
  const out: TopItem[] = [];
  for (const it of items) {
    if (seen.has(it.symbol)) continue;
    seen.add(it.symbol);
    out.push(it);
    if (out.length === 3) break;
  }
  return out;
}
