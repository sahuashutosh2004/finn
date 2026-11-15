import { findCompany, isHeld } from "@/data/portfolio";
import type { AlertInput } from "./alerts";
import type { BriefStock } from "./brief";
import { collectFilings, type Filing, type Mover } from "./filings";
import type { StockData } from "./market";
import { priceReceipts } from "./receipts";
import type { SnapshotResult } from "./snapshot";

type Ok = Extract<SnapshotResult, { status: "ok" }>;

export function refDateOf(snap: Ok): string {
  return new Date(snap.snapshot.generatedAt).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

/** Brief and alerts cover holdings only; research-demo symbols in the snapshot are for the Company tab. */
export const heldStocks = (snap: Ok): StockData[] => snap.ok.filter((s) => isHeld(s.symbol));
export const heldErrors = (snap: Ok) => snap.errors.filter((e) => isHeld(e.symbol));

export function receiptsFor(snap: Ok, s: StockData) {
  return priceReceipts(s, snap.snapshot.generatedAt, snap.snapshot.priceChecks?.find((c) => c.symbol === s.symbol));
}

export function briefStocks(snap: Ok): BriefStock[] {
  return heldStocks(snap).map((s) => {
    const r = receiptsFor(snap, s);
    return {
      symbol: s.symbol,
      name: findCompany(s.symbol)?.name ?? s.name ?? "",
      lastDate: s.lastDate,
      lastClose: s.lastClose,
      dayChangePct: s.dayChangePct,
      volumeRatio: s.volumeRatio,
      closes30: s.history.slice(-30).map((b) => b.close),
      receipts: { close: r.close, change: r.change, volumeRatio: r.volumeRatio },
    };
  });
}

export function filingsOf(snap: Ok): Filing[] {
  const held = (snap.snapshot.screener ?? []).filter((s) => isHeld(s.symbol));
  return collectFilings(held, snap.bseFilings);
}

export function moversOf(snap: Ok): Record<string, Mover> {
  return Object.fromEntries(heldStocks(snap).map((s) => [s.symbol, { pct: s.dayChangePct, ratio: s.volumeRatio }]));
}

export function alertInputOf(snap: Ok, filings = filingsOf(snap)): AlertInput {
  return {
    refDate: refDateOf(snap),
    stocks: heldStocks(snap).map((s) => ({
      symbol: s.symbol,
      lastDate: s.lastDate,
      dayChangePct: s.dayChangePct,
      volumeRatio: s.volumeRatio,
    })),
    filings: filings.map(({ id, symbol, date, category }) => ({ id, symbol, date, category })),
  };
}

/** Where the Brief's filings came from, for the footnote. */
export function filingSourceNote(snap: Ok): { bse: string[]; fallback: string[] } {
  const bse = snap.snapshot.bse ?? {};
  const held = snap.snapshot.portfolio ?? [];
  return {
    bse: held.filter((s) => bse[s]?.ok),
    fallback: held.filter((s) => !bse[s]?.ok),
  };
}
