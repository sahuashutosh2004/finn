"use client";

import { useState } from "react";
import FilingDetail from "@/components/FilingDetail";
import FilingRow from "@/components/FilingRow";
import SwipeRow from "@/components/SwipeRow";
import { useSheet } from "@/components/ui/Sheet";
import { CATEGORY_LABEL } from "@/lib/classify";
import type { Enrichment } from "@/lib/enrich";
import type { Filing } from "@/lib/filings";
import type { ResultsView } from "@/lib/results";
import { toggleDone, togglePin, useTriage } from "@/lib/triageStore";

const FIRST = 8;

export default function CompanyFilings({
  filings,
  name,
  enrichment,
  results,
}: {
  filings: Filing[];
  name?: string;
  enrichment: Record<string, Enrichment>;
  results: ResultsView | null;
}) {
  const triage = useTriage();
  const sheet = useSheet();
  const [all, setAll] = useState(false);
  const pinned = filings.filter((f) => triage.pinned[f.id]);
  const rest = filings.filter((f) => !triage.pinned[f.id]);
  const shown = [...pinned, ...(all ? rest : rest.slice(0, Math.max(0, FIRST - pinned.length)))];

  return (
    <>
      {shown.map((f) => (
        <SwipeRow
          key={f.id}
          label={`${CATEGORY_LABEL[f.category]}: ${f.summary ?? f.title}`}
          done={Boolean(triage.done[f.id])}
          pinned={Boolean(triage.pinned[f.id])}
          onTap={() => sheet.open(<FilingDetail filing={f} name={name} enrichment={enrichment[f.id]} results={results} />, CATEGORY_LABEL[f.category])}
          onDone={() => toggleDone(f.id)}
          onPin={() => togglePin(f.id)}
        >
          <div className={`transition-opacity duration-150 ${triage.done[f.id] ? "opacity-45" : ""}`}>
            <FilingRow filing={f} showSymbol={false} why={enrichment[f.id]?.why} pinned={Boolean(triage.pinned[f.id])} />
          </div>
        </SwipeRow>
      ))}
      {shown.length < filings.length ? (
        <button
          type="button"
          onClick={() => setAll(true)}
          className="flex min-h-11 w-full items-center justify-center text-[15px] font-medium text-accent transition-opacity duration-150 active:opacity-60"
        >
          Show all {filings.length}
        </button>
      ) : null}
    </>
  );
}
