import type { Metadata } from "next";
import { Suspense, type ReactNode } from "react";
import CompanyFilings from "@/components/CompanyFilings";
import Num from "@/components/Num";
import PriceChart from "@/components/PriceChart";
import ResultsTable from "@/components/ResultsTable";
import BullBear from "@/components/research/BullBear";
import PromisedDelivered from "@/components/research/PromisedDelivered";
import QuarterBars from "@/components/research/QuarterBars";
import EmptyState from "@/components/ui/EmptyState";
import ListRow from "@/components/ui/ListRow";
import Section from "@/components/ui/Section";
import { Skeleton, SkeletonList } from "@/components/ui/Skeleton";
import Tag from "@/components/ui/Tag";
import { findCompany, isHeld } from "@/data/portfolio";
import { getFilings, getScreenerData, guidanceFor, type Origin } from "@/lib/companyData";
import { formatINR, formatVolume } from "@/lib/format";
import { priceReceipts, type Receipt } from "@/lib/receipts";
import { balanceView, bullBear, growthLines, isBank, quarterBars, snapshotMetrics, type Metric } from "@/lib/research";
import { buildResults } from "@/lib/results";
import type { ScreenerData } from "@/lib/screener";
import { loadSnapshot } from "@/lib/snapshot";
import { getStock } from "@/lib/stockData";
import { isValidSymbol, normalizeSymbol } from "@/lib/symbol";

// A symbol outside the snapshot fetches Screener, BSE, a transcript PDF and the model in one request.
export const maxDuration = 60;

type Props = { params: Promise<{ symbol: string }> };

async function readSymbol(params: Props["params"]) {
  const { symbol } = await params;
  try {
    return normalizeSymbol(decodeURIComponent(symbol));
  } catch {
    return normalizeSymbol(symbol);
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: `${await readSymbol(params)} · Dreamstockifier` };
}

const fmtDay = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium" });

function Stat({ label, value, r, sub }: { label: string; value: string; r?: Receipt | null; sub?: string }) {
  return (
    <ListRow
      title={<span className="font-normal text-muted">{label}</span>}
      subtitle={sub}
      value={
        <span className="tabular-nums">
          <Num r={r}>{value}</Num>
        </span>
      }
    />
  );
}

const metricRow = (m: Metric) => <Stat key={m.label} label={m.label} value={m.display} r={m.receipt} sub={m.sub} />;

function Note({ children }: { children: ReactNode }) {
  return <p className="mt-2 text-[12px] leading-[18px] text-muted">{children}</p>;
}

// ---------- research (Screener) ----------

function ResearchSkeleton() {
  return (
    <div aria-busy>
      <Skeleton className="mt-6 h-3.5 w-24" />
      <Skeleton className="mt-3 h-3 w-full" />
      <Skeleton className="mt-1.5 h-3 w-4/5" />
      <div className="mt-4 grid grid-cols-2 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-12" />
        ))}
      </div>
      <Skeleton className="mt-8 h-3.5 w-28" />
      <SkeletonList rows={5} />
    </div>
  );
}

async function Research({ symbol }: { symbol: string }) {
  const got = await getScreenerData(symbol);
  if ("error" in got) {
    return (
      <Section title="Research">
        <EmptyState title={`Couldn't load Screener for ${symbol}`} description={`${got.error}. Dreamstockifier shows nothing here rather than a guess.`} />
      </Section>
    );
  }
  const sd = got.data;
  const results = sd.quarters?.periods.length ? buildResults(sd.quarters, { url: sd.url, fetchedAt: sd.fetchedAt }) : null;
  const metrics = snapshotMetrics(sd);
  const growth = growthLines(sd);
  const bars = quarterBars(sd, 8);
  const bv = balanceView(sd);
  const unit = sd.quarters?.unit === "Rs. Crores" ? "Cr" : (sd.quarters?.unit ?? "");
  const growthCols = growth[0]?.items.map((i) => i.label) ?? [];
  const hasBalance = bv.rows.length || bv.cash.length || bv.days.length;

  return (
    <>
      <Section title="Snapshot" aside={sd.quarters?.basis ?? undefined}>
        {sd.about ? <p className="py-3 text-[13px] leading-5 text-fg/90">{sd.about}</p> : null}
        {metrics.length ? (
          metrics.map(metricRow)
        ) : (
          <p className="py-3 text-[13px] text-muted">Screener shows no market cap or ratios for this company.</p>
        )}
      </Section>

      <Section title="Latest quarter">
        {results ? (
          <div className="py-2.5">
            <ResultsTable view={results} />
          </div>
        ) : (
          <EmptyState title="Quarterly results not on Screener" />
        )}
      </Section>

      {growth.length || bars.length ? (
        <Section title="Trajectory">
          {growth.length ? (
            <table className="w-full text-[13px] tabular-nums">
              <thead>
                <tr className="text-[11px] text-muted">
                  <th className="py-2 text-left font-medium">Compounded growth</th>
                  {growthCols.map((c) => (
                    <th key={c} className="py-2 text-right font-medium">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-divider border-t border-divider">
                {growth.map((g) => (
                  <tr key={g.label}>
                    <td className="py-2.5 text-[15px] font-medium">{g.label}</td>
                    {growthCols.map((c) => {
                      const it = g.items.find((i) => i.label === c);
                      const neg = it?.display.startsWith("-");
                      return (
                        <td key={c} className={`py-2.5 text-right font-semibold ${neg ? "text-down" : ""}`}>
                          {it ? <Num r={it.receipt}>{it.display}</Num> : "—"}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
          {bars.length ? <QuarterBars series={bars} unit={unit} /> : null}
        </Section>
      ) : null}

      <Section title="Balance sheet & cash">
        {hasBalance ? (
          <>
            {bv.rows.map(metricRow)}
            {bv.cash5y ? metricRow(bv.cash5y) : null}
            {bv.cash.length ? (
              <div className="py-2">
                <table className="w-full text-[13px] tabular-nums">
                  <thead>
                    <tr className="text-[11px] text-muted">
                      <th className="pb-1 text-left font-medium">Year</th>
                      <th className="pb-1 text-right font-medium">Cash from ops</th>
                      <th className="pb-1 text-right font-medium">Net profit</th>
                      <th className="pb-1 text-right font-medium">Conversion</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bv.cash.map((c) => (
                      <tr key={c.label}>
                        <td className="py-1 text-muted">{c.label}</td>
                        <td className="py-1 text-right">{c.cfo === null ? "—" : formatINR(c.cfo).replace(/\.\d+$/, "")}</td>
                        <td className="py-1 text-right">{c.profit === null ? "—" : formatINR(c.profit).replace(/\.\d+$/, "")}</td>
                        <td className={`py-1 text-right font-semibold ${c.pct !== null && c.pct < 60 ? "text-down" : ""}`}>
                          {c.pct === null ? "—" : <Num r={c.receipt}>{c.pct}%</Num>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-1 text-[11px] text-muted">₹ Cr. Conversion = cash from operating activity ÷ net profit.</p>
              </div>
            ) : null}
            {bv.days.map(metricRow)}
            {bv.notes.map((n) => (
              <p key={n} className="py-2.5 text-[12px] leading-[18px] text-muted">
                {n}
              </p>
            ))}
          </>
        ) : (
          <EmptyState title="No balance sheet or cash flow on Screener" />
        )}
      </Section>

      <Suspense
        fallback={
          <div aria-busy>
            <Skeleton className="mt-6 h-3.5 w-36" />
            <Skeleton className="mt-3 h-7 w-64" />
            <SkeletonList rows={3} />
          </div>
        }
      >
        <Promises sd={sd} />
      </Suspense>

      <Suspense
        fallback={
          <div aria-busy>
            <Skeleton className="mt-6 h-3.5 w-20" />
            <SkeletonList rows={4} />
          </div>
        }
      >
        <Filings sd={sd} results={results} />
      </Suspense>

      {sd.concalls.length || sd.annualReports.length ? (
        <Section title="Documents">
          {sd.concalls.slice(0, 4).map((c) => (
            <div key={c.period} className="flex min-h-11 items-center gap-3 py-2">
              <span className="flex-1 text-[15px]">{c.period} call</span>
              {(
                [
                  ["Transcript", c.transcript],
                  ["PPT", c.ppt],
                  ["Recording", c.recording],
                ] as const
              ).map(([label, url]) =>
                url ? (
                  <a key={label} href={url} target="_blank" rel="noreferrer" className="text-[13px] font-medium text-accent transition-opacity duration-150 active:opacity-60">
                    {label}
                  </a>
                ) : null,
              )}
            </div>
          ))}
          {sd.annualReports.slice(0, 3).map((r) => (
            <a key={r.url} href={r.url} target="_blank" rel="noreferrer" className="flex min-h-11 items-center justify-between py-2 text-[15px] transition-colors duration-150 active:bg-fill">
              {r.label}
              <span className="text-[13px] font-medium text-accent">PDF ↗</span>
            </a>
          ))}
        </Section>
      ) : null}

      <SourceNote sd={sd} origin={got.origin} />
    </>
  );
}

function SourceNote({ sd, origin }: { sd: ScreenerData; origin: Origin }) {
  const how = origin === "snapshot" ? "saved at the last refresh" : origin === "cache" ? "fetched live earlier today and cached" : "fetched live just now";
  return (
    <Note>
      Research from{" "}
      <a href={sd.url} target="_blank" rel="noreferrer" className="text-accent">
        Screener
      </a>{" "}
      ({sd.quarters?.basis?.toLowerCase() ?? "figures"}), {how} on {fmtDay(sd.fetchedAt)}. ₹ figures are in crores. Tap any number for its table, row and column.
    </Note>
  );
}

async function Promises({ sd }: { sd: ScreenerData }) {
  const g = await guidanceFor(sd);
  const items = g.status === "ok" ? g.items : [];
  const { bull, bear } = bullBear(sd, items, g.status === "ok" ? g.transcriptUrl : undefined);
  return (
    <>
      <Section title="Promised vs delivered">
        <PromisedDelivered g={g} />
      </Section>
      <Section title="Bull vs bear" aside={isBank(sd) ? "Bank: ROE, not ROCE" : undefined}>
        <BullBear bull={bull} bear={bear} tablesOnly={g.status !== "ok" || !items.some((i) => i.verdict === "on_track" || i.verdict === "missed")} />
      </Section>
    </>
  );
}

async function Filings({ sd, results }: { sd: ScreenerData; results: ReturnType<typeof buildResults> | null }) {
  const [{ filings, source, bseError }, snap] = await Promise.all([getFilings(sd), loadSnapshot()]);
  const ids = new Set(filings.map((f) => f.id));
  const enrichment = snap.status === "ok" ? Object.fromEntries(Object.entries(snap.snapshot.enrichment ?? {}).filter(([id]) => ids.has(id))) : {};
  return (
    <Section title="Filings" aside={filings.length ? `${filings.length} · ${source === "BSE" ? "30 days" : "latest"}` : undefined}>
      {filings.length ? (
        <CompanyFilings filings={filings} name={sd.companyName ?? undefined} enrichment={enrichment} results={results} />
      ) : (
        <EmptyState title={source === "BSE" ? "No filings on BSE in the last 30 days" : "No filings listed"} />
      )}
      <p className="py-2 text-[12px] leading-[18px] text-muted">
        {source === "BSE"
          ? "From BSE corporate announcements. Swipe right to mark done, left to pin."
          : `From Screener's latest 5 (BSE unavailable: ${bseError ?? "unknown"}).`}
      </p>
    </Section>
  );
}

// ---------- page ----------

export default async function CompanyDetailPage({ params }: Props) {
  const symbol = await readSymbol(params);

  if (!isValidSymbol(symbol)) {
    return (
      <main className="pt-4">
        <EmptyState title="Not an NSE symbol" description="Symbols use letters, digits, & and -. Try searching instead." />
      </main>
    );
  }

  const company = findCompany(symbol);
  const held = isHeld(symbol);
  const [{ source, result }, snap] = await Promise.all([getStock(symbol), loadSnapshot()]);
  const name = company?.name ?? (result.ok ? result.name : null);
  const check = snap.status === "ok" ? snap.snapshot.priceChecks?.find((c) => c.symbol === symbol) : undefined;
  const fetchedAt = source === "snapshot" && snap.status === "ok" ? snap.snapshot.generatedAt : new Date().toISOString();
  const r = result.ok ? priceReceipts(result, fetchedAt, check) : null;

  return (
    <main className="pt-4">
      <div className="flex items-center gap-2">
        <h1 className="text-[22px] font-bold leading-7 tracking-[-0.02em]">{symbol}</h1>
        {held ? <Tag tone="accent">In portfolio</Tag> : null}
      </div>
      <p className="truncate text-[13px] text-muted">{[name, company?.industry, "NSE"].filter(Boolean).join(" · ")}</p>

      {result.ok && r ? (
        <>
          <div className="mt-4">
            <PriceChart
              history={result.history}
              lastClose={result.lastClose}
              lastDate={result.lastDate}
              dayChange={result.dayChange}
              dayChangePct={result.dayChangePct}
              closeReceipt={r.close}
              changeReceipt={r.change}
            />
          </div>

          <Section title="Stats">
            <Stat label="52W high" value={formatINR(result.high52w)} r={r.high52} />
            <Stat label="52W low" value={formatINR(result.low52w)} r={r.low52} />
            <Stat label="Avg vol (20D)" value={formatVolume(result.avgVolume20)} r={r.avgVolume} />
            <Stat label="Last vol" value={formatVolume(result.lastVolume)} r={r.lastVolume} />
          </Section>

          <Note>
            Yahoo Finance daily data ({source === "snapshot" ? "from last refresh" : "fetched live"})
            {check && check.screener !== null ? (check.flagged ? `; ${check.diffPct}% away from Screener's price, treat with care` : "; within 1% of Screener's price") : ""}. Chart by{" "}
            <a href="https://www.tradingview.com/" target="_blank" rel="noreferrer" className="text-accent">
              TradingView
            </a>
            .
          </Note>
        </>
      ) : (
        <Section>
          <EmptyState title={`Couldn't load prices for ${symbol}`} description={result.ok ? undefined : result.error} />
        </Section>
      )}

      <Suspense fallback={<ResearchSkeleton />}>
        <Research symbol={symbol} />
      </Suspense>
    </main>
  );
}
