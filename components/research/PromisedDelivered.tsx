import Num from "@/components/Num";
import Tag from "@/components/ui/Tag";
import type { CheckedItem, GuidanceResult, Verdict } from "@/lib/guidance";
import { calcReceipt, docReceipt } from "@/lib/receipts";

const VERDICT: Record<Verdict, { label: string; tone: "up" | "down" | "neutral" | "accent" }> = {
  on_track: { label: "On track", tone: "up" },
  missed: { label: "Missed", tone: "down" },
  too_early: { label: "Too early", tone: "neutral" },
  cant_check: { label: "Can't check", tone: "neutral" },
};

const TOPIC = { growth: "Growth", margin: "Margin", capex: "Capex" } as const;

function target(it: CheckedItem): string {
  const u = it.unit === "cr" ? " Cr" : it.unit ?? "";
  if (it.low !== null && it.high !== null && it.low !== it.high) return `${it.low}–${it.high}${u}`;
  const v = it.low ?? it.high;
  return v === null ? "No number given" : `${v}${u}`;
}

function TranscriptLink({ url, period }: { url: string; period: string }) {
  return (
    <a href={url} target="_blank" rel="noreferrer" className="font-medium text-accent transition-opacity duration-150 active:opacity-60">
      {period} transcript ↗
    </a>
  );
}

export default function PromisedDelivered({ g }: { g: GuidanceResult }) {
  if (g.status === "no-transcript") {
    return <p className="py-3 text-[13px] leading-5 text-muted">No earnings-call transcript on Screener for this company, so there&apos;s nothing to check. Bull vs bear below uses only the tables.</p>;
  }
  if (g.status === "no-key") {
    return (
      <p className="py-3 text-[13px] leading-5 text-muted">
        The latest transcript is here (<TranscriptLink url={g.transcriptUrl} period={g.period} />) but no model key is set, so FINN didn&apos;t read the guidance out of it. Add{" "}
        <code className="rounded bg-fill px-1 text-[12px]">GEMINI_API_KEY</code> or <code className="rounded bg-fill px-1 text-[12px]">GROQ_API_KEY</code> to{" "}
        <code className="rounded bg-fill px-1 text-[12px]">.env.local</code>. Bull vs bear below uses only the tables.
      </p>
    );
  }
  if (g.status === "unavailable") {
    return (
      <p className="py-3 text-[13px] leading-5 text-muted">
        {g.reason === "limit"
          ? "The model's free-tier limit is used up for now, so FINN didn't read the "
          : "FINN is still reading the "}
        <TranscriptLink url={g.transcriptUrl} period={g.period} />
        {g.reason === "limit" ? ". It will be read on the next refresh." : ". Reload in a minute to see what management promised."} Bull vs bear below uses only the tables.
      </p>
    );
  }
  if (g.status === "error") {
    return (
      <p className="py-3 text-[13px] leading-5 text-muted">
        Couldn&apos;t read the <TranscriptLink url={g.transcriptUrl} period={g.period} /> ({g.error}). Bull vs bear below uses only the tables.
      </p>
    );
  }

  return (
    <div>
      <div className="py-3">
        {g.of > 0 ? (
          <p className="text-[22px] font-bold leading-7 tracking-[-0.02em]">
            Management hit <span className={g.hit === g.of ? "text-up" : g.hit === 0 ? "text-down" : ""}>{g.hit}</span> of {g.of} targets
          </p>
        ) : (
          <p className="text-[17px] font-semibold">
            {g.items.length ? "No target that can be checked yet" : g.rejected.length ? "No guidance passed the checks" : "No explicit guidance on growth, margin or capex"}
          </p>
        )}
        <p className="mt-0.5 text-[12px] text-muted">
          From the <TranscriptLink url={g.transcriptUrl} period={g.period} />, read by {g.model}. Each quote was matched word for word in the transcript.
          {g.rejected.length ? ` ${g.rejected.length} model claim${g.rejected.length > 1 ? "s" : ""} rejected: the quote wasn't in the transcript, a number wasn't in the quote, or it was an analyst's question.` : ""}
        </p>
      </div>
      {g.items.map((it, i) => {
        const v = VERDICT[it.verdict];
        const d = it.delivered;
        const quoteR = docReceipt("Transcript PDF", `${TOPIC[it.topic]} guidance`, target(it), g.transcriptUrl, `${g.period} earnings call · quote checked against the PDF text`, null);
        return (
          <div key={i} className="py-3">
            <div className="flex items-center gap-1.5">
              <span className="text-[15px] font-semibold">{TOPIC[it.topic]}</span>
              {it.period ? <span className="text-[13px] text-muted">{it.period}</span> : null}
              <span className="ml-auto">
                <Tag tone={v.tone}>{v.label}</Tag>
              </span>
            </div>
            <blockquote className="mt-1.5 border-l-2 border-accent pl-2.5 text-[13px] leading-5 text-fg/90">“{it.quote}”</blockquote>
            <div className="mt-2 grid grid-cols-2 gap-x-4 text-[13px]">
              <span className="text-muted">Guided</span>
              <span className="text-right font-semibold tabular-nums">
                <Num r={quoteR}>{target(it)}</Num>
              </span>
              {d?.actual != null ? (
                <>
                  <span className="text-muted">
                    {d.measure}, {d.actualLabel.toLowerCase()}
                  </span>
                  <span className="text-right font-semibold tabular-nums">
                    <Num r={calcReceipt(d.measure, `${d.actual}%`, d.formula, [])}>{d.actual}%</Num>
                  </span>
                </>
              ) : null}
            </div>
            {d && d.quarters.length ? (
              <div className="mt-2 grid grid-cols-4 gap-1 rounded-lg bg-fill px-2 py-1.5 text-center">
                {d.quarters.map((q) => (
                  <div key={q.label}>
                    <p className="text-[11px] text-muted">{q.label}</p>
                    <p className="text-[13px] font-semibold tabular-nums">{q.value === null ? "—" : `${q.value}%`}</p>
                  </div>
                ))}
              </div>
            ) : null}
            {it.note ? <p className="mt-1.5 text-[12px] text-muted">{it.note}</p> : null}
          </div>
        );
      })}
    </div>
  );
}
