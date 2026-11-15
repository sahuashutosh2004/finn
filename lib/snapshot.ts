import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import type { BseFiling } from "./bse";
import type { Enrichment } from "./enrich";
import type { GuidanceResult } from "./guidance";
import type { StockData, StockError, StockResult } from "./market";
import type { ScreenerData, ScreenerResult } from "./screener";

export type BseResult = { ok: true; code: string; filings: BseFiling[] } | { ok: false; code: string | null; error: string };
export type PriceCheck = { symbol: string; yahoo: number; yahooDate: string; screener: number | null; diffPct: number | null; flagged: boolean };
export type LlmLog = { provider: string | null; model: string | null; calls: number; cacheHits: number; failures: number; input: number; output: number };

export const SNAPSHOT_PATH = path.join(process.cwd(), "data", "snapshot.json");

export type Snapshot = {
  generatedAt: string; // ISO time the refresh ran
  source: string;
  asOf: string | null; // latest close date across stocks
  stocks: StockResult[];
  failed: string[];
  screener?: ScreenerResult[];
  screenerFailed?: string[];
  portfolio?: string[];
  research?: string[];
  bse?: Record<string, BseResult>;
  priceChecks?: PriceCheck[];
  enrichment?: Record<string, Enrichment>;
  guidance?: Record<string, GuidanceResult>;
  llm?: LlmLog;
};

export type SnapshotResult =
  | { status: "missing" }
  | { status: "invalid" }
  | {
      status: "ok";
      snapshot: Snapshot;
      ok: StockData[];
      errors: StockError[];
      screener: Map<string, ScreenerResult>;
      bseFilings: Record<string, BseFiling[] | null>;
    };

let cache: { mtimeMs: number; result: SnapshotResult } | null = null;

export async function loadSnapshot(): Promise<SnapshotResult> {
  let raw: string;
  let mtimeMs: number;
  try {
    mtimeMs = (await stat(SNAPSHOT_PATH)).mtimeMs;
    if (cache && cache.mtimeMs === mtimeMs) return cache.result;
    raw = await readFile(SNAPSHOT_PATH, "utf8");
  } catch {
    return { status: "missing" };
  }
  let result: SnapshotResult;
  try {
    const snapshot = JSON.parse(raw) as Snapshot;
    result = Array.isArray(snapshot.stocks)
      ? {
          status: "ok",
          snapshot,
          ok: snapshot.stocks.filter((s): s is StockData => s.ok),
          errors: snapshot.stocks.filter((s): s is StockError => !s.ok),
          screener: new Map((snapshot.screener ?? []).map((s) => [s.symbol, s])),
          bseFilings: Object.fromEntries(Object.entries(snapshot.bse ?? {}).map(([k, v]) => [k, v.ok ? v.filings : null])),
        }
      : { status: "invalid" };
  } catch {
    result = { status: "invalid" };
  }
  cache = { mtimeMs, result };
  return result;
}

export function screenerFor(result: SnapshotResult, symbol: string): ScreenerData | null {
  if (result.status !== "ok") return null;
  const s = result.screener.get(symbol);
  return s && s.ok ? s : null;
}
