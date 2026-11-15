"use client";

import Link from "next/link";
import Num from "@/components/Num";
import { useSheet } from "@/components/ui/Sheet";
import type { BriefStock } from "@/lib/brief";
import { formatDate, formatINR, formatPct, formatRatio } from "@/lib/format";
import { companyHref } from "@/lib/symbol";
import { toggleDone, togglePin, useTriage } from "@/lib/triageStore";

function Line({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-11 items-center justify-between py-2">
      <span className="text-[15px] text-muted">{label}</span>
      <span className="text-[15px] font-medium">{children}</span>
    </div>
  );
}

export default function MoveDetail({ stock: s, id }: { stock: BriefStock; id: string }) {
  const sheet = useSheet();
  const triage = useTriage();
  const tone = (s.dayChangePct ?? 0) > 0 ? "text-up" : (s.dayChangePct ?? 0) < 0 ? "text-down" : "text-muted";
  return (
    <div>
      <p className="text-[20px] font-bold tracking-[-0.02em]">{s.symbol}</p>
      <p className="text-[13px] text-muted">
        {s.name} · close of {formatDate(s.lastDate)}
      </p>
      <div className="mt-3 divide-y divide-divider border-y border-divider">
        <Line label="Close">
          <Num r={s.receipts.close}>{formatINR(s.lastClose)}</Num>
        </Line>
        <Line label="Day change">
          <Num r={s.receipts.change} className={tone}>
            {formatPct(s.dayChangePct)}
          </Num>
        </Line>
        <Line label="Volume vs 20-day average">
          <Num r={s.receipts.volumeRatio}>{formatRatio(s.volumeRatio)}</Num>
        </Line>
      </div>
      <p className="mt-3 text-[13px] leading-5 text-muted">FINN doesn&apos;t explain a move without a filing behind it. Open the stock&apos;s page for its filings and results.</p>
      <div className="mt-5 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => {
            toggleDone(id);
            sheet.close();
          }}
          className="h-11 rounded-xl bg-fill text-[15px] font-semibold transition-opacity duration-150 active:opacity-60"
        >
          {triage.done[id] ? "Not done" : "Mark done"}
        </button>
        <button
          type="button"
          onClick={() => togglePin(id)}
          className={`h-11 rounded-xl text-[15px] font-semibold transition-opacity duration-150 active:opacity-60 ${triage.pinned[id] ? "bg-accent text-white" : "bg-fill"}`}
        >
          {triage.pinned[id] ? "Pinned" : "Pin"}
        </button>
      </div>
      <Link
        href={companyHref(s.symbol)}
        onClick={() => sheet.close()}
        className="mt-2 flex h-11 items-center justify-center rounded-xl bg-accent/12 text-[15px] font-semibold text-accent transition-opacity duration-150 active:opacity-60"
      >
        Open {s.symbol} research
      </Link>
    </div>
  );
}
