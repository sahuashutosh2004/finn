import AlertsView from "@/components/AlertsView";
import Code from "@/components/ui/Code";
import EmptyState from "@/components/ui/EmptyState";
import { buildResults, type ResultsView } from "@/lib/results";
import { loadSnapshot } from "@/lib/snapshot";
import { alertInputOf, briefStocks, filingsOf } from "@/lib/viewData";

export default async function AlertsPage() {
  const snap = await loadSnapshot();

  if (snap.status !== "ok") {
    return (
      <main className="pt-4">
        <EmptyState
          title="No alerts yet."
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

  return (
    <AlertsView
      input={alertInputOf(snap, filings)}
      today={new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" })}
      stocks={briefStocks(snap)}
      filings={Object.fromEntries(filings.map((f) => [f.id, f]))}
      results={results}
      enrichment={Object.fromEntries(Object.entries(snap.snapshot.enrichment ?? {}).filter(([id]) => ids.has(id)))}
    />
  );
}
