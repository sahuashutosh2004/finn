// Company data for any NSE symbol: the refresh snapshot first, then a 1-day file cache,
// then a live fetch with the same parsers (the result is cached for the next visitor).
import { after } from "next/server";
import { fetchBseFilings, type BseFiling } from "./bse";
import { DAY_MS, readCache, writeCache } from "./cache";
import { mergeFilings, type Filing } from "./filings";
import { getGuidance, latestTranscript, type GuidanceResult } from "./guidance";
import { fetchScreener, type ScreenerData } from "./screener";
import { loadSnapshot, screenerFor } from "./snapshot";

export type Origin = "snapshot" | "cache" | "live";

export async function getScreenerData(symbol: string): Promise<{ data: ScreenerData; origin: Origin } | { error: string }> {
  const snap = await loadSnapshot();
  const hit = screenerFor(snap, symbol);
  if (hit) return { data: hit, origin: "snapshot" };

  const cached = await readCache<ScreenerData>("screener", symbol, DAY_MS);
  if (cached) return { data: cached.value, origin: "cache" };

  const live = await fetchScreener(symbol);
  if (!live.ok) return { error: live.error };
  await writeCache("screener", symbol, live);
  return { data: live, origin: "live" };
}

export async function getFilings(sd: ScreenerData): Promise<{ filings: Filing[]; source: "BSE" | "Screener"; bseError: string | null }> {
  const snap = await loadSnapshot();
  let bse: BseFiling[] | null = null;
  let bseError: string | null = null;

  if (snap.status === "ok" && sd.symbol in snap.bseFilings) {
    bse = snap.bseFilings[sd.symbol];
    if (!bse) bseError = snap.snapshot.bse?.[sd.symbol]?.ok === false ? (snap.snapshot.bse[sd.symbol] as { error: string }).error : "unavailable";
  } else if (sd.bseCode) {
    const cached = await readCache<BseFiling[]>("bse", sd.bseCode, DAY_MS);
    if (cached) bse = cached.value;
    else {
      try {
        bse = await fetchBseFilings(sd.bseCode, 30);
        await writeCache("bse", sd.bseCode, bse);
      } catch (e) {
        bseError = e instanceof Error ? e.message : String(e);
      }
    }
  } else {
    bseError = "no BSE code on Screener page";
  }

  return { filings: mergeFilings({ symbol: sd.symbol, bse, screener: sd.announcements }), source: bse ? "BSE" : "Screener", bseError };
}

const LIVE_BUDGET_MS = 20_000;

/**
 * Precomputed by refresh for snapshot symbols; otherwise read now (PDF and model output are cached by URL).
 * A live read gets a time budget so a new symbol can't hold the page open: past it, the page shows the
 * tables-only view and the read finishes in the background for the next visit.
 */
export async function guidanceFor(sd: ScreenerData): Promise<GuidanceResult> {
  const snap = await loadSnapshot();
  const pre = snap.status === "ok" ? snap.snapshot.guidance?.[sd.symbol] : undefined;
  const t = latestTranscript(sd);
  const sameTranscript = pre && (pre.status === "no-transcript" ? !t : "transcriptUrl" in pre && pre.transcriptUrl === t?.url);
  if (pre && sameTranscript && (pre.status === "ok" || pre.status === "no-transcript")) return pre;
  if (!t) return { status: "no-transcript" };

  const work = getGuidance(sd, { live: true });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), LIVE_BUDGET_MS);
  });
  const res = await Promise.race([work, timeout]);
  clearTimeout(timer);
  if (res) return res;
  after(() => work.catch(() => undefined));
  return { status: "unavailable", transcriptUrl: t.url, period: t.period, reason: "busy" };
}
