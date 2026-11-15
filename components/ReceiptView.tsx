"use client";

import { ChevronRight } from "lucide-react";
import { useSheet } from "@/components/ui/Sheet";
import type { Receipt } from "@/lib/receipts";

function fetched(iso: string | null) {
  if (!iso) return "—";
  return `${new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })} IST`;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-11 items-start justify-between gap-4 py-2.5">
      <span className="shrink-0 text-[13px] text-muted">{label}</span>
      <span className="min-w-0 text-right text-[13px] leading-[18px] break-words">{children}</span>
    </div>
  );
}

export default function ReceiptView({ r }: { r: Receipt }) {
  const sheet = useSheet();
  return (
    <div>
      <p className="text-[13px] text-muted">{r.label}</p>
      <p className="mt-0.5 text-[28px] font-bold leading-9 tracking-[-0.02em]">{r.value}</p>

      <div className="mt-3 divide-y divide-divider border-y border-divider">
        <Row label="Source">{r.source}</Row>
        <Row label="Where">{r.where}</Row>
        {r.raw !== null ? <Row label="Raw value">{r.raw}</Row> : null}
        {r.formula ? <Row label="Formula">{r.formula}</Row> : null}
        <Row label="Fetched">{fetched(r.fetchedAt)}</Row>
      </div>

      {r.note ? <p className="mt-3 text-[13px] leading-5 text-fg/85">{r.note}</p> : null}

      {r.inputs?.length ? (
        <div className="mt-5">
          <p className="border-b border-divider pb-1.5 text-[13px] font-semibold uppercase tracking-[0.04em] text-muted">Inputs</p>
          <div className="divide-y divide-divider">
            {r.inputs.map((i, k) => (
              <button
                key={k}
                type="button"
                onClick={() => sheet.open(<ReceiptView r={i} />, "Where this number comes from")}
                className="flex min-h-11 w-full items-center gap-3 py-2 text-left transition-colors duration-150 active:bg-fill"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px]">{i.label}</span>
                  <span className="block truncate text-[12px] text-muted">{i.source}</span>
                </span>
                <span className="text-[15px] font-medium">{i.value}</span>
                <ChevronRight size={16} className="-mr-1 text-muted/60" aria-hidden />
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {r.url ? (
        <a
          href={r.url}
          target="_blank"
          rel="noreferrer"
          className="mt-5 flex h-11 items-center justify-center rounded-xl bg-fill text-[15px] font-semibold text-accent transition-opacity duration-150 active:opacity-60"
        >
          Open {r.source === "Yahoo Finance" ? "Yahoo data" : r.source === "Screener" ? "on Screener" : "PDF"} ↗
        </a>
      ) : null}
    </div>
  );
}
