import Num from "@/components/Num";
import type { Point } from "@/lib/research";

function Column({ title, tone, points }: { title: string; tone: "up" | "down"; points: Point[] }) {
  return (
    <div className="py-3">
      <p className={`text-[13px] font-semibold uppercase tracking-[0.04em] ${tone === "up" ? "text-up" : "text-down"}`}>{title}</p>
      {points.length === 0 ? (
        <p className="mt-1 text-[13px] text-muted">Nothing in the tables clears FINN&apos;s bar for a {tone === "up" ? "bull" : "bear"} point.</p>
      ) : (
        <ol className="mt-1 space-y-2">
          {points.map((p, i) => (
            <li key={i} className="flex gap-2 text-[15px] leading-[22px]">
              <span className={`mt-[9px] size-1.5 shrink-0 rounded-full ${tone === "up" ? "bg-up" : "bg-down"}`} aria-hidden />
              <div className="min-w-0">
                <p>{p.text}</p>
                <p className="text-[12px] text-muted">
                  Source:{" "}
                  {p.receipts.map((r, k) => (
                    <span key={k}>
                      {k > 0 ? ", " : ""}
                      <Num r={r} className="text-accent">
                        {r.value}
                      </Num>
                    </span>
                  ))}
                </p>
                {p.quote ? (
                  <blockquote className="mt-1 border-l-2 border-divider pl-2 text-[12px] leading-[18px] text-muted">
                    “{p.quote.text}”{" "}
                    <a href={p.quote.url} target="_blank" rel="noreferrer" className="text-accent">
                      transcript ↗
                    </a>
                  </blockquote>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export default function BullBear({ bull, bear, tablesOnly }: { bull: Point[]; bear: Point[]; tablesOnly: boolean }) {
  return (
    <>
      <Column title="Bull" tone="up" points={bull} />
      <Column title="Bear" tone="down" points={bear} />
      <p className="py-2 text-[12px] leading-[18px] text-muted">
        Rules, not opinions: each point is a threshold on a Screener number{tablesOnly ? "" : " or a guidance check with its quote"}. Tap a source to see the cell. Not investment advice.
      </p>
    </>
  );
}
