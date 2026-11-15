import BriefView from "@/components/BriefView";
import Code from "@/components/ui/Code";
import EmptyState from "@/components/ui/EmptyState";
import { briefTitle } from "@/lib/briefTitle";
import { isNseCertainlyClosed } from "@/lib/marketStatus";
import { buildResults, type ResultsView } from "@/lib/results";
import { loadSnapshot } from "@/lib/snapshot";
import { briefStocks, filingSourceNote, filingsOf, heldErrors, heldStocks, refDateOf } from "@/lib/viewData";

export default async function BriefPage() {
  const snap = await loadSnapshot();
  const now = new Date();

  if (snap.status !== "ok") {
    return (
      <main className="pt-4">
        <h1 className="text-[28px] font-bold leading-8 tracking-[-0.03em]">{briefTitle(now)}</h1>
        <EmptyState
          title={snap.status === "missing" ? "No data yet." : "Snapshot couldn't be read."}
          description={
            <>
              Run <Code>npm run refresh</Code>.
            </>
          }
        />
      </main>
    );
  }

  const filings = filingsOf(snap);
  const results: Record<string, ResultsView> = {};
  for (const f of filings) {
    if (f.category !== "results" || results[f.symbol]) continue;
    const s = snap.screener.get(f.symbol);
    if (s?.ok && s.quarters?.periods.length) results[f.symbol] = buildResults(s.quarters, { url: s.url, fetchedAt: s.fetchedAt });
  }
  const ids = new Set(filings.map((f) => f.id));
  const enrichment = Object.fromEntries(Object.entries(snap.snapshot.enrichment ?? {}).filter(([id]) => ids.has(id)));
  const checks = (snap.snapshot.priceChecks ?? []).filter((c) => snap.snapshot.portfolio?.includes(c.symbol));

  return (
    <BriefView
      title={briefTitle(now)}
      today={now.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" })}
      asOf={snap.snapshot.asOf}
      refDate={refDateOf(snap)}
      generatedAt={snap.snapshot.generatedAt}
      marketClosed={isNseCertainlyClosed(now)}
      stocks={briefStocks(snap)}
      errors={heldErrors(snap).map((e) => ({ symbol: e.symbol, error: e.error }))}
      filings={filings}
      movers={Object.fromEntries(heldStocks(snap).map((s) => [s.symbol, { pct: s.dayChangePct, ratio: s.volumeRatio, date: s.lastDate }]))}
      enrichment={enrichment}
      results={results}
      sourceNote={filingSourceNote(snap)}
      priceFlags={checks.filter((c) => c.flagged).map((c) => c.symbol)}
      priceChecked={checks.length}
    />
  );
}
