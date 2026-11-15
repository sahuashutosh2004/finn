"use client";

import Link from "next/link";
import ResultsTable from "@/components/ResultsTable";
import Num from "@/components/Num";
import Tag from "@/components/ui/Tag";
import { useSheet } from "@/components/ui/Sheet";
import { CATEGORY_LABEL, CATEGORY_TIER } from "@/lib/classify";
import type { Enrichment } from "@/lib/enrich";
import type { Filing } from "@/lib/filings";
import { formatDate } from "@/lib/format";
import { docReceipt } from "@/lib/receipts";
import type { ResultsView } from "@/lib/results";
import { companyHref } from "@/lib/symbol";
import { toggleDone, togglePin, useTriage } from "@/lib/triageStore";

function Label({ children }: { children: React.ReactNode }) {
  return <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.04em] text-muted">{children}</p>;
}

export default function FilingDetail({
  filing: f,
  name,
  enrichment,
  results,
}: {
  filing: Filing;
  name?: string;
  enrichment?: Enrichment;
  results?: ResultsView | null;
}) {
  const sheet = useSheet();
  const triage = useTriage();
  const done = Boolean(triage.done[f.id]);
  const pinned = Boolean(triage.pinned[f.id]);
  const profile = enrichment?.profile;
  const dateReceipt = docReceipt(f.source === "BSE" ? "BSE" : "Filing PDF", "Filing date", formatDate(f.date), f.url, f.source === "BSE" ? "BSE announcements API · NEWS_DT" : "Screener · Announcements", null);

  return (
    <div>
      <div className="flex items-center gap-1.5">
        <Link href={companyHref(f.symbol)} onClick={() => sheet.close()} className="text-[20px] font-bold tracking-[-0.02em] transition-opacity duration-150 active:opacity-60">
          {f.symbol}
        </Link>
        <Tag tone={CATEGORY_TIER[f.category] === 1 ? "accent" : "neutral"}>{CATEGORY_LABEL[f.category]}</Tag>
        <span className="ml-auto text-[13px] text-muted">
          <Num r={dateReceipt}>{formatDate(f.date)}</Num>
        </span>
      </div>
      {name ? <p className="text-[13px] text-muted">{name}</p> : null}

      <Label>Exchange subject</Label>
      <p className="mt-1 text-[13px] leading-[18px] text-fg/90">{f.title}</p>

      {f.summary ? (
        <>
          <Label>{f.summarySource === "Screener" ? "Screener's summary" : "Filing headline (BSE)"}</Label>
          <p className="mt-1 text-[15px] leading-[22px]">{f.summary}</p>
        </>
      ) : null}

      {enrichment?.why ? (
        <>
          <Label>Why it matters</Label>
          <p className="mt-1 text-[15px] leading-[22px]">{enrichment.why}</p>
          <p className="mt-1 text-[11px] text-muted">One line written by a model from the PDF; every number in it was checked against the PDF.</p>
        </>
      ) : null}

      {f.category === "management_change" ? (
        profile ? (
          <div className="mt-4 rounded-xl bg-fill p-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.04em] text-muted">From the filing</p>
            {profile.name ? <p className="mt-1 text-[17px] font-semibold">{profile.name}</p> : null}
            {profile.role ? <p className="text-[13px] text-fg/90">{profile.role}</p> : null}
            <blockquote className="mt-2 border-l-2 border-accent pl-2.5 text-[13px] leading-5 text-fg/90">“{profile.quote}”</blockquote>
          </div>
        ) : (
          <p className="mt-4 text-[13px] leading-5 text-muted">
            {enrichment?.pdfError
              ? `Couldn't read the PDF (${enrichment.pdfError}), so only the filing line is shown.`
              : enrichment
                ? "The filing has no profile of the person, so only the filing line is shown."
                : "Profile not read for this filing yet."}
          </p>
        )
      ) : null}

      {f.category === "results" ? (
        results ? (
          <div className="mt-4">
            <ResultsTable view={results} />
          </div>
        ) : (
          <p className="mt-4 text-[13px] text-muted">Quarterly numbers not on Screener for this company.</p>
        )
      ) : null}

      <div className="mt-5 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => {
            toggleDone(f.id);
            sheet.close();
          }}
          className="h-11 rounded-xl bg-fill text-[15px] font-semibold transition-opacity duration-150 active:opacity-60"
        >
          {done ? "Not done" : "Mark done"}
        </button>
        <button
          type="button"
          onClick={() => togglePin(f.id)}
          className={`h-11 rounded-xl text-[15px] font-semibold transition-opacity duration-150 active:opacity-60 ${pinned ? "bg-accent text-white" : "bg-fill"}`}
        >
          {pinned ? "Pinned" : "Pin"}
        </button>
      </div>
      {f.url ? (
        <a
          href={f.url}
          target="_blank"
          rel="noreferrer"
          className="mt-2 flex h-11 items-center justify-center rounded-xl bg-accent/12 text-[15px] font-semibold text-accent transition-opacity duration-150 active:opacity-60"
        >
          Open filing PDF ↗
        </a>
      ) : null}
      <p className="mt-3 text-[11px] text-muted">Source: {f.source === "BSE" ? "BSE corporate announcements" : "Screener announcements"}.</p>
    </div>
  );
}
