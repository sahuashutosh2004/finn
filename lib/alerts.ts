import type { Category } from "./classify";
import { inWindow } from "./filings";
import type { Settings } from "./settings";

export const ALERT_FILING_DAYS = 7;

export type AlertInput = {
  refDate: string; // IST date of the last refresh
  stocks: { symbol: string; lastDate: string; dayChangePct: number | null; volumeRatio: number | null }[];
  filings: { id: string; symbol: string; date: string | null; category: Category }[];
};

export type Alert =
  | { kind: "price"; key: string; symbol: string; date: string; pct: number }
  | { kind: "volume"; key: string; symbol: string; date: string; ratio: number }
  | { kind: "filing"; key: string; symbol: string; date: string; filingId: string; category: Category };

export function buildAlerts(input: AlertInput, s: Settings): Alert[] {
  const out: Alert[] = [];
  for (const st of input.stocks) {
    if (st.dayChangePct !== null && Math.abs(st.dayChangePct) >= s.priceMovePct) {
      out.push({ kind: "price", key: `p-${st.symbol}-${st.lastDate}`, symbol: st.symbol, date: st.lastDate, pct: st.dayChangePct });
    }
    if (st.volumeRatio !== null && st.volumeRatio >= s.volumeX) {
      out.push({ kind: "volume", key: `v-${st.symbol}-${st.lastDate}`, symbol: st.symbol, date: st.lastDate, ratio: st.volumeRatio });
    }
  }
  for (const f of input.filings) {
    if (s.categories[f.category] && f.date && inWindow(f, input.refDate, ALERT_FILING_DAYS)) {
      out.push({ kind: "filing", key: f.id, symbol: f.symbol, date: f.date, filingId: f.id, category: f.category });
    }
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}
