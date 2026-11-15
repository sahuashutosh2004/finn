"use client";

import { useState, type ReactNode } from "react";
import FilingDetail from "@/components/FilingDetail";
import FilingRow from "@/components/FilingRow";
import ListenButton from "@/components/ListenButton";
import MoveDetail from "@/components/MoveDetail";
import Num from "@/components/Num";
import SwipeRow from "@/components/SwipeRow";
import ChangePill from "@/components/ui/ChangePill";
import EmptyState from "@/components/ui/EmptyState";
import ListRow from "@/components/ui/ListRow";
import Section from "@/components/ui/Section";
import SegmentedControl from "@/components/ui/SegmentedControl";
import { useSheet } from "@/components/ui/Sheet";
import Sparkline from "@/components/ui/Sparkline";
import Tag from "@/components/ui/Tag";
import { byBiggestMove, summarize, type BriefStock } from "@/lib/brief";
import type { BriefTitle } from "@/lib/briefTitle";
import { CATEGORY_LABEL } from "@/lib/classify";
import type { Enrichment } from "@/lib/enrich";
import { WINDOW_DAYS, inWindow, rankFilings, type Filing, type Mover, type RankedFiling, type WindowKey } from "@/lib/filings";
import { formatDate, formatINR, formatPct, formatRatio } from "@/lib/format";
import type { ResultsView } from "@/lib/results";
import { useSettings } from "@/lib/settings";
import { companyHref } from "@/lib/symbol";
import { topThree, type TopItem } from "@/lib/triage";
import { toggleDone, togglePin, useTriage } from "@/lib/triageStore";
import { speechScript } from "@/lib/voice";

type Props = {
  title: BriefTitle;
  today: string; // IST date the page was rendered
  asOf: string | null;
  refDate: string;
  generatedAt: string;
  marketClosed: boolean;
  stocks: BriefStock[];
  errors: { symbol: string; error: string }[];
  filings: Filing[];
  movers: Record<string, Mover & { date: string }>;
  enrichment: Record<string, Enrichment>;
  results: Record<string, ResultsView>;
  sourceNote: { bse: string[]; fallback: string[] };
  priceFlags: string[];
  priceChecked: number;
};

const WINDOWS: { value: WindowKey; label: string }[] = [
  { value: "1D", label: "1D" },
  { value: "7D", label: "7D" },
  { value: "30D", label: "30D" },
];
const TIER_TITLE = { 1: "Important", 2: "Notable", 3: "Other" } as const;

function Sym({ s }: { s: BriefStock }) {
  return <span className="font-semibold text-fg">{s.symbol}</span>;
}

function Pct({ s }: { s: BriefStock }) {
  const n = s.dayChangePct;
  const tone = n == null || n === 0 ? "text-muted" : n > 0 ? "text-up" : "text-down";
  return (
    <Num r={s.receipts.change} className={`font-semibold ${tone}`}>
      {formatPct(n)}
    </Num>
  );
}

function symbolList(list: BriefStock[]): ReactNode {
  return list.map((s, i) => (
    <span key={s.symbol}>
      {i > 0 ? ", " : ""}
      <Sym s={s} />
    </span>
  ));
}

function Collapsible({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  return (
    <details className="group mt-4">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between border-b border-divider text-[13px] font-semibold uppercase tracking-[0.04em] text-muted transition-opacity duration-150 active:opacity-60">
        <span>{title}</span>
        <span className="font-normal normal-case tracking-normal">
          {count} <span className="inline-block transition-transform duration-150 group-open:rotate-90">›</span>
        </span>
      </summary>
      <div className="divide-y divide-divider">{children}</div>
    </details>
  );
}

export default function BriefView(p: Props) {
  const settings = useSettings();
  const triage = useTriage();
  const sheet = useSheet();
  const t = { priceMovePct: settings.priceMovePct, volumeX: settings.volumeX };
  const sum = summarize(p.stocks, t);
  const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
  const byName = Object.fromEntries(p.stocks.map((s) => [s.symbol, s]));
  const nameOf = (sym: string) => byName[sym]?.name || sym;

  const [picked, setPicked] = useState<WindowKey>("1D");
  const inWin = (w: WindowKey) => p.filings.filter((f) => inWindow(f, p.refDate, WINDOW_DAYS[w]));
  const fellBack = picked === "1D" && inWin("1D").length === 0;
  const win: WindowKey = fellBack ? "7D" : picked;
  const visible = inWin(win);

  const isDone = (id: string) => Boolean(triage.done[id]);
  const isPinned = (id: string) => Boolean(triage.pinned[id]);
  const { tiers, routine } = rankFilings(visible, p.movers, t);
  const pinnedItems = [...tiers.flatMap((g) => g.items), ...routine].filter((f) => isPinned(f.id));
  const doneItems = [...tiers.flatMap((g) => g.items), ...routine].filter((f) => isDone(f.id));
  const material = tiers.flatMap((g) => g.items);
  const caughtUp = material.length > 0 && material.every((f) => isDone(f.id));

  const top = topThree(p.filings, p.movers, t, p.refDate, new Set(Object.keys(triage.done)));
  const script = speechScript({ title: p.title, dateLabel: formatDate(p.today), summary: sum, total: p.stocks.length, top, nameOf });

  const boostFor = (symbol: string) => {
    const m = p.movers[symbol];
    if (!m) return null;
    const priceHit = m.pct !== null && Math.abs(m.pct) >= t.priceMovePct;
    const volumeHit = m.ratio !== null && m.ratio >= t.volumeX;
    return priceHit || volumeHit ? { ...m, priceHit, volumeHit } : null;
  };

  const openFiling = (f: Filing) =>
    sheet.open(<FilingDetail filing={f} name={nameOf(f.symbol)} enrichment={p.enrichment[f.id]} results={p.results[f.symbol]} />, CATEGORY_LABEL[f.category]);

  const openMove = (it: Extract<TopItem, { kind: "move" }>) => {
    const s = byName[it.symbol];
    if (s) sheet.open(<MoveDetail stock={s} id={it.id} />, "Price & volume");
  };

  const row = (f: RankedFiling, withBoost = true) => (
    <SwipeRow
      key={f.id}
      label={`${f.symbol} ${CATEGORY_LABEL[f.category]}: ${f.summary ?? f.title}`}
      done={isDone(f.id)}
      pinned={isPinned(f.id)}
      onTap={() => openFiling(f)}
      onDone={() => toggleDone(f.id)}
      onPin={() => togglePin(f.id)}
    >
      <FilingRow filing={f} boost={withBoost && f.boosted ? boostFor(f.symbol) : null} why={p.enrichment[f.id]?.why} pinned={isPinned(f.id)} />
    </SwipeRow>
  );

  return (
    <main className="pt-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[28px] font-bold leading-8 tracking-[-0.03em]">{p.title}</h1>
          <p className="mt-0.5 text-[13px] text-muted">
            {formatDate(p.today)} · {p.marketClosed ? "Market closed · " : ""}prices as of {formatDate(p.asOf, false)} close
          </p>
        </div>
        <div className="pt-0.5">
          <ListenButton script={script} />
        </div>
      </div>

      <Section title="Top 3 for today" aside={top.length && top.length < 3 ? `Only ${top.length} stood out` : undefined}>
        {top.length === 0 ? (
          <p className="py-3 text-[15px] text-muted">Nothing needs you today.</p>
        ) : (
          top.map((it, i) => (
            <SwipeRow
              key={it.id}
              label={`Top ${i + 1}: ${it.symbol}`}
              pinned={isPinned(it.id)}
              onTap={() => (it.kind === "filing" ? openFiling(it.filing) : openMove(it))}
              onDone={() => toggleDone(it.id)}
              onPin={() => togglePin(it.id)}
            >
              <div className="flex gap-3 py-2.5">
                <span className="w-4 shrink-0 pt-px text-[15px] font-bold text-accent">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  {it.kind === "filing" ? (
                    <>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[15px] font-semibold">{it.symbol}</span>
                        <Tag tone="accent">{CATEGORY_LABEL[it.filing.category]}</Tag>
                        <span className="ml-auto shrink-0 text-[12px] text-muted">{formatDate(it.filing.date, false)}</span>
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-[13px] leading-[18px] text-fg/90">{p.enrichment[it.id]?.why ?? it.filing.summary ?? it.filing.title}</p>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[15px] font-semibold">{it.symbol}</span>
                        {it.priceHit ? (
                          <Tag tone={(it.pct ?? 0) >= 0 ? "up" : "down"}>
                            <Num r={byName[it.symbol]?.receipts.change}>{formatPct(it.pct)}</Num>
                          </Tag>
                        ) : null}
                        {it.volumeHit ? (
                          <Tag tone="accent">
                            Vol&nbsp;<Num r={byName[it.symbol]?.receipts.volumeRatio}>{formatRatio(it.ratio)}</Num>
                          </Tag>
                        ) : null}
                        <span className="ml-auto shrink-0 text-[12px] text-muted">{formatDate(it.date, false)}</span>
                      </div>
                      <p className="mt-0.5 text-[13px] leading-[18px] text-fg/90">
                        {nameOf(it.symbol)}
                        {it.priceHit && it.pct !== null ? ` ${it.pct >= 0 ? "rose" : "fell"} ${formatPct(Math.abs(it.pct)).replace("+", "")}` : ""}
                        {it.priceHit && it.volumeHit ? " on " : it.volumeHit ? " traded " : ""}
                        {it.volumeHit && it.ratio !== null ? `${formatRatio(it.ratio)} its 20-day average volume` : ""}.
                      </p>
                    </>
                  )}
                </div>
              </div>
            </SwipeRow>
          ))
        )}
      </Section>

      <section className="mt-6 border-b border-divider pb-4">
        <p className="text-[22px] font-bold leading-7 tracking-[-0.02em]">
          <span className="text-up">{sum.up} up</span>
          <span className="text-muted"> · </span>
          <span className="text-down">{sum.down} down</span>
          {sum.flat ? <span className="text-muted"> · {sum.flat} unchanged</span> : null}
        </p>
        <ul className="mt-2 space-y-1 text-[15px] leading-[22px] text-fg/90">
          {sum.gainer ? (
            <li>
              Biggest gainer: <Sym s={sum.gainer} /> <Pct s={sum.gainer} />
            </li>
          ) : null}
          {sum.loser ? (
            <li>
              Biggest loser: <Sym s={sum.loser} /> <Pct s={sum.loser} />
            </li>
          ) : null}
          <li>
            {sum.bigMoves.length === 0 ? (
              <>No stock moved {t.priceMovePct}% or more.</>
            ) : (
              <>
                {sum.bigMoves.length} {plural(sum.bigMoves.length, "stock", "stocks")} moved {t.priceMovePct}% or more: {symbolList(sum.bigMoves)}.
              </>
            )}
          </li>
          <li>
            {sum.volumeSpikes.length === 0 ? (
              <>No stock traded at {t.volumeX}x its 20-day average volume.</>
            ) : (
              <>
                {sum.volumeSpikes.length} traded at {t.volumeX}x or more its 20-day average volume: {symbolList(sum.volumeSpikes)}.
              </>
            )}
          </li>
          {p.errors.length ? (
            <li className="text-down">
              Couldn&apos;t fetch prices for {p.errors.length}: {p.errors.map((e) => e.symbol).join(", ")}.
            </li>
          ) : null}
        </ul>
      </section>

      <section className="mt-6">
        <div className="flex items-end justify-between border-b border-divider pb-1.5">
          <h2 className="text-[13px] font-semibold uppercase tracking-[0.04em] text-muted">Filings</h2>
          <span className="text-[13px] text-muted">up to {formatDate(p.refDate, false)}</span>
        </div>
        <div className="sticky top-[calc(env(safe-area-inset-top)+89px)] z-20 -mx-4 bg-bg/92 px-4 py-2 backdrop-blur-xl">
          <SegmentedControl label="Filings window" options={WINDOWS} value={win} onChange={setPicked} />
          <p className={`text-[13px] text-muted transition-opacity duration-150 ${fellBack ? "mt-1.5 opacity-100" : "h-0 overflow-hidden opacity-0"}`}>
            Nothing in the last day. Showing 7 days.
          </p>
        </div>

        {visible.length === 0 ? (
          <EmptyState title={`No filings in the last ${WINDOW_DAYS[win]} days.`} />
        ) : (
          <>
            {pinnedItems.length ? (
              <Section title="Pinned" aside={pinnedItems.length} className="!mt-2">
                {pinnedItems.map((f) => row(f))}
              </Section>
            ) : null}
            {caughtUp ? (
              <div className="py-8 text-center">
                <p className="text-[17px] font-semibold">All caught up · {formatDate(p.today, false)}</p>
                <p className="mt-1 text-[13px] text-muted">Every material filing in this window is done.</p>
              </div>
            ) : (
              tiers.map((g) => {
                const items = g.items.filter((f) => !isDone(f.id) && !isPinned(f.id));
                return items.length ? (
                  <Section key={g.tier} title={TIER_TITLE[g.tier]} aside={items.length} className="!mt-2">
                    {items.map((f) => row(f))}
                  </Section>
                ) : null;
              })
            )}
            {routine.filter((f) => !isDone(f.id) && !isPinned(f.id)).length ? (
              <Collapsible title="Routine" count={routine.filter((f) => !isDone(f.id) && !isPinned(f.id)).length}>
                {routine.filter((f) => !isDone(f.id) && !isPinned(f.id)).map((f) => row(f, false))}
              </Collapsible>
            ) : null}
            {doneItems.length ? (
              <Collapsible title="Done" count={doneItems.length}>
                {doneItems.map((f) => row(f, false))}
              </Collapsible>
            ) : null}
          </>
        )}
        <p className="mt-2 text-[12px] leading-[18px] text-muted">
          {p.sourceNote.bse.length
            ? `From BSE's announcements feed${p.sourceNote.fallback.length ? `; Screener's last 5 for ${p.sourceNote.fallback.join(", ")} (BSE failed)` : ""}.`
            : "From Screener, which lists each company's 5 most recent filings."}{" "}
          Swipe right to mark done, left to pin.
        </p>
      </section>

      <Section title="Holdings" aside="By biggest move">
        {byBiggestMove(p.stocks).map((s) => (
          <ListRow
            key={s.symbol}
            href={companyHref(s.symbol)}
            title={
              <span className="flex items-center gap-1.5">
                {s.symbol}
                {s.volumeRatio !== null && s.volumeRatio >= t.volumeX ? (
                  <Tag tone="accent">
                    Vol&nbsp;<Num r={s.receipts.volumeRatio}>{formatRatio(s.volumeRatio)}</Num>
                  </Tag>
                ) : null}
              </span>
            }
            subtitle={s.lastDate !== p.asOf ? `${s.name} · close of ${formatDate(s.lastDate, false)}` : s.name}
            middle={<Sparkline values={s.closes30} label={`${s.symbol} 30-day closes`} />}
            value={<Num r={s.receipts.close}>{formatINR(s.lastClose)}</Num>}
            valueSub={
              <Num r={s.receipts.change}>
                <ChangePill pct={s.dayChangePct} />
              </Num>
            }
          />
        ))}
      </Section>

      {p.errors.length ? (
        <Section title="Couldn't fetch">
          {p.errors.map((e) => (
            <ListRow key={e.symbol} href={companyHref(e.symbol)} title={e.symbol} subtitle={e.error} />
          ))}
        </Section>
      ) : null}

      <p className="mt-4 text-[12px] leading-[18px] text-muted">
        Prices: Yahoo Finance daily closes,{" "}
        {p.priceFlags.length
          ? `cross-checked with Screener; more than 1% apart for ${p.priceFlags.join(", ")}.`
          : `all ${p.priceChecked} within 1% of Screener's price.`}{" "}
        Refreshed {new Date(p.generatedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })} IST. Tap any number to see its source.
      </p>
    </main>
  );
}
