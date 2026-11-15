"use client";

import { useEffect, type ReactNode } from "react";
import AlertSettings from "@/components/AlertSettings";
import FilingDetail from "@/components/FilingDetail";
import FilingRow from "@/components/FilingRow";
import MoveDetail from "@/components/MoveDetail";
import Num from "@/components/Num";
import SwipeRow from "@/components/SwipeRow";
import EmptyState from "@/components/ui/EmptyState";
import Section from "@/components/ui/Section";
import { useSheet } from "@/components/ui/Sheet";
import Tag from "@/components/ui/Tag";
import { ALERT_FILING_DAYS, buildAlerts, type Alert, type AlertInput } from "@/lib/alerts";
import type { BriefStock } from "@/lib/brief";
import { CATEGORY_LABEL } from "@/lib/classify";
import type { Enrichment } from "@/lib/enrich";
import type { Filing } from "@/lib/filings";
import { formatDate, formatPct, formatRatio } from "@/lib/format";
import type { ResultsView } from "@/lib/results";
import { useSettings } from "@/lib/settings";
import { toggleDone, togglePin, useTriage, visitAlerts } from "@/lib/triageStore";

type Props = {
  input: AlertInput;
  today: string;
  stocks: BriefStock[];
  filings: Record<string, Filing>;
  results: Record<string, ResultsView>;
  enrichment: Record<string, Enrichment>;
};

function MoveRow({ symbol, date, isNew, pinned, tag, children }: { symbol: string; date: string; isNew: boolean; pinned: boolean; tag: ReactNode; children: ReactNode }) {
  return (
    <div className="py-2.5">
      <div className="flex items-center gap-1.5">
        {isNew ? <span aria-label="New" className="size-1.5 shrink-0 rounded-full bg-accent" /> : null}
        <span className="text-[15px] font-semibold">{symbol}</span>
        {tag}
        <span className="ml-auto shrink-0 text-[12px] text-muted">
          {pinned ? "Pinned · " : ""}
          {formatDate(date, false)}
        </span>
      </div>
      <p className="mt-0.5 text-[13px] leading-[18px] text-fg/90">{children}</p>
    </div>
  );
}

export default function AlertsView({ input, today, stocks, filings, results, enrichment }: Props) {
  const settings = useSettings();
  const triage = useTriage();
  const sheet = useSheet();
  const alerts = buildAlerts(input, settings);
  const keys = alerts.map((a) => a.key).join("|");
  const bySymbol = Object.fromEntries(stocks.map((s) => [s.symbol, s]));
  const fresh = new Set(triage.fresh ?? []);

  useEffect(() => {
    visitAlerts(keys ? keys.split("|") : []);
  }, [keys]);

  const open = (a: Alert) => {
    if (a.kind === "filing") {
      const f = filings[a.filingId];
      if (f) sheet.open(<FilingDetail filing={f} name={bySymbol[f.symbol]?.name} enrichment={enrichment[f.id]} results={results[f.symbol]} />, CATEGORY_LABEL[f.category]);
    } else if (bySymbol[a.symbol]) {
      sheet.open(<MoveDetail stock={bySymbol[a.symbol]} id={a.key} />, a.kind === "price" ? "Price move" : "Volume spike");
    }
  };

  const content = (a: Alert) => {
    const s = bySymbol[a.symbol];
    const pinned = Boolean(triage.pinned[a.key]);
    if (a.kind === "price") {
      return (
        <MoveRow symbol={a.symbol} date={a.date} isNew={fresh.has(a.key)} pinned={pinned} tag={<Tag tone={a.pct >= 0 ? "up" : "down"}>Price</Tag>}>
          {a.pct >= 0 ? "Up" : "Down"}{" "}
          <Num r={s?.receipts.change} className={`font-semibold ${a.pct >= 0 ? "text-up" : "text-down"}`}>
            {formatPct(a.pct)}
          </Num>{" "}
          on the day (alert at {settings.priceMovePct}%).
        </MoveRow>
      );
    }
    if (a.kind === "volume") {
      return (
        <MoveRow symbol={a.symbol} date={a.date} isNew={fresh.has(a.key)} pinned={pinned} tag={<Tag tone="accent">Volume</Tag>}>
          Traded{" "}
          <Num r={s?.receipts.volumeRatio} className="font-semibold">
            {formatRatio(a.ratio)}
          </Num>{" "}
          its 20-day average volume (alert at {settings.volumeX}x).
        </MoveRow>
      );
    }
    const f = filings[a.filingId];
    return f ? <FilingRow filing={f} why={enrichment[f.id]?.why} pinned={pinned} isNew={fresh.has(a.key)} /> : null;
  };

  const row = (a: Alert) => (
    <SwipeRow
      key={a.key}
      label={`${a.symbol} ${a.kind} alert`}
      done={Boolean(triage.done[a.key])}
      pinned={Boolean(triage.pinned[a.key])}
      onTap={() => open(a)}
      onDone={() => toggleDone(a.key)}
      onPin={() => togglePin(a.key)}
    >
      {content(a)}
    </SwipeRow>
  );

  const pinned = alerts.filter((a) => triage.pinned[a.key]);
  const done = alerts.filter((a) => triage.done[a.key]);
  const open_ = alerts.filter((a) => !triage.pinned[a.key] && !triage.done[a.key]);

  return (
    <main className="pt-3">
      <p className="text-[13px] text-muted">
        Prices for the last close, filings from the {ALERT_FILING_DAYS} days up to {formatDate(input.refDate, false)}.
      </p>
      <AlertSettings settings={settings} />
      {alerts.length === 0 ? (
        <EmptyState title="No alerts" description="Nothing crossed your alert settings." />
      ) : (
        <>
          {pinned.length ? (
            <Section title="Pinned" aside={pinned.length}>
              {pinned.map(row)}
            </Section>
          ) : null}
          {open_.length ? (
            <Section title="Alerts" aside={open_.length}>
              {open_.map(row)}
            </Section>
          ) : pinned.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-[17px] font-semibold">All caught up · {formatDate(today, false)}</p>
              <p className="mt-1 text-[13px] text-muted">Everything here is marked done.</p>
            </div>
          ) : null}
          {done.length ? (
            <details className="group mt-6">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between border-b border-divider text-[13px] font-semibold uppercase tracking-[0.04em] text-muted transition-opacity duration-150 active:opacity-60">
                <span>Done</span>
                <span className="font-normal normal-case tracking-normal">
                  {done.length} <span className="inline-block transition-transform duration-150 group-open:rotate-90">›</span>
                </span>
              </summary>
              <div className="divide-y divide-divider">{done.map(row)}</div>
            </details>
          ) : null}
        </>
      )}
      <p className="mt-4 text-[12px] leading-[18px] text-muted">
        Swipe right to mark done, left to pin; saved on this phone. Source: Yahoo Finance prices, BSE and Screener filings. Tap any number to see where it came from.
      </p>
    </main>
  );
}
