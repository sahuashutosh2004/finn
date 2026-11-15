import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { PORTFOLIO, RESEARCH_DEMO } from "../data/portfolio";
import { fetchBseFilings } from "../lib/bse";
import { enrichFiling, wantsEnrichment, type Enrichment } from "../lib/enrich";
import { collectFilings, inWindow } from "../lib/filings";
import { getGuidance, type GuidanceResult } from "../lib/guidance";
import { sleep } from "../lib/http";
import { ledger, provider } from "../lib/llm";
import { YAHOO_CHART_URL, fetchStock, type StockResult } from "../lib/market";
import { fetchScreener, type ScreenerResult } from "../lib/screener";
import type { BseResult, PriceCheck, Snapshot } from "../lib/snapshot";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const OUT = path.join(process.cwd(), "data", "snapshot.json");
const pad = (s: string) => s.padEnd(11);
const istDay = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

async function main() {
  const held = PORTFOLIO.map((c) => c.symbol);
  const all = [...held, ...RESEARCH_DEMO.filter((s) => !held.includes(s))];
  const now = new Date();

  console.log(`Prices (Yahoo) · ${held.length} holdings + ${all.length - held.length} research demo`);
  const stocks: StockResult[] = [];
  for (const symbol of all) {
    const result = await fetchStock(symbol);
    stocks.push(result);
    if (result.ok) {
      const pct = result.dayChangePct === null ? "n/a" : `${result.dayChangePct.toFixed(2)}%`;
      console.log(`  ok    ${pad(symbol)} ${result.lastDate}  close ${result.lastClose}  ${pct}  bars ${result.history.length}`);
    } else {
      console.log(`  FAIL  ${pad(symbol)} ${result.error}`);
    }
    await sleep(300);
  }

  console.log("\nFundamentals (Screener)");
  const screener: ScreenerResult[] = [];
  for (const symbol of all) {
    const r = await fetchScreener(symbol);
    screener.push(r);
    if (r.ok) {
      const basis = r.url.includes("/consolidated/") ? "consolidated" : "standalone";
      console.log(
        `  ok    ${pad(symbol)} ${basis.padEnd(12)} latest ${r.quarters?.periods.at(-1)?.label ?? "—"}  P&L ${r.profitLoss ? "✓" : "✗"} BS ${r.balanceSheet ? "✓" : "✗"} CF ${r.cashFlow ? "✓" : "✗"} ratios ${r.ratios ? "✓" : "✗"}  BSE ${r.bseCode ?? "—"}  concalls ${r.concalls.length}`,
      );
    } else {
      console.log(`  FAIL  ${pad(symbol)} ${r.error}`);
    }
    await sleep(1500);
  }

  console.log("\nFilings (BSE announcements API, last 30 days)");
  const bse: Record<string, BseResult> = {};
  const fetchBse = async (r: Extract<(typeof screener)[number], { ok: true }>, pass: number) => {
    const code = r.bseCode!;
    try {
      const filings = await fetchBseFilings(code, 30, now);
      bse[r.symbol] = { ok: true, code, filings };
      console.log(`  ok    ${pad(r.symbol)} ${code}  ${filings.length} filings (Screener lists ${r.announcements.length})${pass > 1 ? " · on retry" : ""}`);
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      bse[r.symbol] = { ok: false, code, error };
      console.log(`  ${pass > 1 ? "FAIL" : "wait"}  ${pad(r.symbol)} ${error}${pass > 1 ? ", using Screener's list" : ", will retry"}`);
    }
    await sleep(700);
  };
  for (const r of screener) {
    if (!r.ok) continue;
    if (!r.bseCode) {
      bse[r.symbol] = { ok: false, code: null, error: "no BSE code on Screener page" };
      console.log(`  FAIL  ${pad(r.symbol)} no BSE code on Screener page, using Screener's list`);
      continue;
    }
    await fetchBse(r, 1);
  }
  // BSE's edge throttles in bursts; one more pass after a pause recovers most of them.
  const retry = screener.filter((r): r is Extract<typeof r, { ok: true }> => r.ok && Boolean(r.bseCode) && bse[r.symbol]?.ok === false);
  if (retry.length) {
    await sleep(8000);
    for (const r of retry) await fetchBse(r, 2);
  }

  console.log("\nPrice cross-check (Yahoo last close vs Screener current price, flag > 1%)");
  const priceChecks: PriceCheck[] = [];
  for (const s of stocks) {
    if (!s.ok) continue;
    const sc = screener.find((x) => x.symbol === s.symbol);
    const cur = sc?.ok ? (sc.topRatios.find((t) => t.name === "Current Price")?.value ?? null) : null;
    const diffPct = cur === null ? null : Math.round(((cur - s.lastClose) / s.lastClose) * 10000) / 100;
    const flagged = diffPct === null || Math.abs(diffPct) > 1;
    priceChecks.push({ symbol: s.symbol, yahoo: s.lastClose, yahooDate: s.lastDate, screener: cur, diffPct, flagged });
    if (flagged) console.log(`  FLAG  ${pad(s.symbol)} Yahoo ${s.lastClose} vs Screener ${cur ?? "—"} (${diffPct ?? "n/a"}%)`);
  }
  const flagged = priceChecks.filter((p) => p.flagged);
  if (!flagged.length) console.log(`  all ${priceChecks.length} within 1%`);

  const p = provider();
  console.log(`\nFiling PDFs (profiles${p ? ", why it matters" : ""}) · model: ${p ? `${p.name} ${p.model}` : "none (no GEMINI_API_KEY / GROQ_API_KEY in .env.local)"}`);
  const refDate = istDay(now);
  const heldScreener = screener.filter((s) => held.includes(s.symbol));
  const filings = collectFilings(heldScreener, Object.fromEntries(Object.entries(bse).map(([k, v]) => [k, v.ok ? v.filings : null])));
  const enrichment: Record<string, Enrichment> = {};
  for (const f of filings.filter((f) => wantsEnrichment(f) && inWindow(f, refDate, 30))) {
    enrichment[f.id] = await enrichFiling(f);
    const e = enrichment[f.id];
    await sleep(250);
    const bits = [
      f.category === "management_change" ? (e.profile ? `profile: ${e.profile.name ?? "unnamed"}` : e.pdfError ? "" : "no profile in PDF") : "",
      e.why ? "why ✓" : e.rejected ? `why rejected (${e.rejected})` : "",
      e.pdfError ? `PDF error: ${e.pdfError}` : "",
    ].filter(Boolean);
    console.log(`  ${e.pdfError ? "FAIL" : "ok  "}  ${pad(f.symbol)} ${f.category.padEnd(18)} ${bits.join(" · ") || "read"}`);
  }

  console.log("\nTranscripts (promised vs delivered)");
  const guidance: Record<string, GuidanceResult> = {};
  for (const s of screener) {
    if (!s.ok) continue;
    const g = await getGuidance(s);
    guidance[s.symbol] = g;
    const line =
      g.status === "ok"
        ? `${g.period}  ${g.items.length} guided items (${g.rejected.length} rejected by quote check), hit ${g.hit} of ${g.of}`
        : g.status === "no-key"
          ? `${g.period}  transcript found; no API key, so it wasn't read`
          : g.status === "error"
            ? `${g.period}  ${g.error}`
            : g.status === "unavailable"
              ? `${g.period}  model rate limit reached, tables-only view`
              : "no transcript on Screener";
    console.log(`  ${g.status === "error" ? "FAIL" : "ok  "}  ${pad(s.symbol)} ${line}`);
  }

  const dates = stocks.flatMap((s) => (s.ok && held.includes(s.symbol) ? [s.lastDate] : [])).sort();
  const snapshot: Snapshot = {
    generatedAt: now.toISOString(),
    source: YAHOO_CHART_URL,
    asOf: dates.at(-1) ?? null,
    stocks,
    failed: stocks.filter((s) => !s.ok).map((s) => s.symbol),
    screener,
    screenerFailed: screener.filter((s) => !s.ok).map((s) => s.symbol),
    portfolio: held,
    research: all.filter((s) => !held.includes(s)),
    bse,
    priceChecks,
    enrichment,
    guidance,
    llm: { provider: p?.name ?? null, model: p?.model ?? null, calls: ledger.calls, cacheHits: ledger.cacheHits, failures: ledger.failures, input: ledger.input, output: ledger.output },
  };

  await mkdir(path.dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(snapshot) + "\n");

  const bseOk = Object.values(bse).filter((b) => b.ok).length;
  console.log(`\nWrote ${path.relative(process.cwd(), OUT)}`);
  console.log(`  prices    ${stocks.length - snapshot.failed.length}/${stocks.length} ok, as of ${snapshot.asOf ?? "—"}${snapshot.failed.length ? `; failed: ${snapshot.failed.join(", ")}` : ""}`);
  console.log(`  screener  ${screener.length - snapshot.screenerFailed!.length}/${screener.length} ok${snapshot.screenerFailed!.length ? `; failed: ${snapshot.screenerFailed!.join(", ")}` : ""}`);
  console.log(`  bse       ${bseOk}/${Object.keys(bse).length} ok${bseOk < Object.keys(bse).length ? `; fell back to Screener: ${Object.entries(bse).filter(([, b]) => !b.ok).map(([k]) => k).join(", ")}` : ""}`);
  console.log(`  price chk ${priceChecks.length - flagged.length}/${priceChecks.length} within 1%${flagged.length ? `; flagged: ${flagged.map((f) => f.symbol).join(", ")}` : ""}`);
  console.log(
    `  model     ${p ? `${p.name} ${p.model}` : "none"} · ${ledger.calls} calls, ${ledger.cacheHits} cache hits, ${ledger.failures} failures · tokens in ${ledger.input}, out ${ledger.output}, total ${ledger.input + ledger.output}`,
  );
  for (const [task, t] of Object.entries(ledger.byTask)) {
    console.log(`            ${task.padEnd(9)} ${t.calls} calls, ${t.cacheHits} cached, ${t.input + t.output} tokens`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
