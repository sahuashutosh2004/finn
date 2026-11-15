import type { Thresholds } from "./filings";
import type { Receipt } from "./receipts";

export type BriefStock = {
  symbol: string;
  name: string;
  lastDate: string;
  lastClose: number;
  dayChangePct: number | null;
  volumeRatio: number | null;
  closes30: number[];
  receipts: { close: Receipt; change: Receipt | null; volumeRatio: Receipt | null };
};

export type BriefSummary = {
  up: number;
  down: number;
  flat: number;
  gainer: BriefStock | null;
  loser: BriefStock | null;
  bigMoves: BriefStock[];
  volumeSpikes: BriefStock[];
};

export function summarize(stocks: BriefStock[], t: Thresholds): BriefSummary {
  const withChange = stocks.filter((s) => s.dayChangePct !== null);
  const pct = (s: BriefStock) => s.dayChangePct as number;
  const sorted = [...withChange].sort((a, b) => pct(b) - pct(a));
  const top = sorted[0];
  const bottom = sorted[sorted.length - 1];

  return {
    up: withChange.filter((s) => pct(s) > 0).length,
    down: withChange.filter((s) => pct(s) < 0).length,
    flat: withChange.filter((s) => pct(s) === 0).length,
    gainer: top && pct(top) > 0 ? top : null,
    loser: bottom && pct(bottom) < 0 ? bottom : null,
    bigMoves: withChange.filter((s) => Math.abs(pct(s)) >= t.priceMovePct),
    volumeSpikes: stocks.filter((s) => s.volumeRatio !== null && s.volumeRatio >= t.volumeX),
  };
}

export function byBiggestMove<T extends { dayChangePct: number | null }>(stocks: T[]): T[] {
  return [...stocks].sort((a, b) => {
    if (a.dayChangePct === null) return 1;
    if (b.dayChangePct === null) return -1;
    return Math.abs(b.dayChangePct) - Math.abs(a.dayChangePct);
  });
}
