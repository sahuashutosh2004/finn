import Num from "@/components/Num";
import { resultsReceipts, type Receipt } from "@/lib/receipts";
import type { Change, ResultsView } from "@/lib/results";

const NUM = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });
const MINUS = "\u2212";
// Only rows where higher is unambiguously better get green/red; costs, tax and ratios stay neutral.
const TONED = /^(?:Revenue|Sales|EBITDA|Operating Profit|Financing Profit|PBT|Profit before tax|PAT|Net Profit|EPS in Rs)$/;

function signed(n: number, digits: number) {
  return `${n > 0 ? "+" : n < 0 ? MINUS : ""}${Math.abs(n).toFixed(digits)}`;
}

function ChangeCell({ c, toned, r }: { c: Change; toned: boolean; r: Receipt | null }) {
  if (c.kind === "missing") return <span className="text-[11px] leading-tight text-muted">not on Screener</span>;
  if (c.kind === "nm") return <Num r={r} className="text-muted">n/m</Num>;
  const tone = !toned ? "text-fg" : c.value > 0 ? "text-up" : c.value < 0 ? "text-down" : "text-muted";
  return (
    <Num r={r} className={tone}>
      {c.kind === "pct" ? `${signed(c.value, 1)}%` : `${signed(c.value, 1)} pp`}
    </Num>
  );
}

export default function ResultsTable({ view }: { view: ResultsView }) {
  const unit = view.unit === "Rs. Crores" ? "₹ Cr" : view.unit;
  const receipts = resultsReceipts(view);
  const hasNm = view.lines.some((l) => l.qoq.kind === "nm" || l.yoy.kind === "nm");

  return (
    <div>
      <p className="text-[12px] text-muted">
        Latest quarter on Screener: <span className="font-semibold text-fg">{view.latest.label}</span>
        {view.basis ? ` · ${view.basis}` : ""}
        {unit ? ` · ${unit}` : ""}
      </p>
      <table className="mt-1.5 w-full text-[13px]">
        <thead>
          <tr className="border-b border-divider text-[11px] text-muted">
            <th className="py-1.5 text-left font-medium">Metric</th>
            <th className="py-1.5 text-right font-medium">{view.latest.label}</th>
            <th className="w-[72px] py-1.5 text-right font-medium">
              QoQ<span className="block font-normal">{view.prevQuarter ? `vs ${view.prevQuarter}` : ""}</span>
            </th>
            <th className="w-[72px] py-1.5 text-right font-medium">
              YoY<span className="block font-normal">{view.yearAgoQuarter ? `vs ${view.yearAgoQuarter}` : ""}</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-divider">
          {view.lines.map((l, i) => (
            <tr key={l.label}>
              <td className="py-1.5 pr-2">
                <span className="font-medium">
                  {l.label}
                  {l.note ? "*" : ""}
                </span>
                {l.label !== l.source ? <span className="block text-[11px] text-muted">{l.source}</span> : null}
              </td>
              <td className="py-1.5 text-right font-medium">
                {l.current === null ? (
                  <span className="text-[11px] text-muted">not on Screener</span>
                ) : (
                  <Num r={receipts[i].current}>{l.percent ? `${NUM.format(l.current)}%` : NUM.format(l.current)}</Num>
                )}
              </td>
              <td className="py-1.5 text-right">
                <ChangeCell c={l.qoq} toned={TONED.test(l.label)} r={receipts[i].qoq} />
              </td>
              <td className="py-1.5 text-right">
                <ChangeCell c={l.yoy} toned={TONED.test(l.label)} r={receipts[i].yoy} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-1.5 space-y-0.5 text-[11px] leading-4 text-muted">
        {view.lines
          .filter((l) => l.note)
          .map((l) => (
            <p key={l.label}>
              *{l.label} is {l.note}.
            </p>
          ))}
        {view.format === "screener-rows" ? <p>Rows shown as Screener reports them for this company.</p> : null}
        {hasNm ? <p>n/m: not meaningful, the comparison quarter is zero or negative.</p> : null}
        {view.lines.some((l) => l.percent) ? <p>% rows change in percentage points (pp).</p> : null}
      </div>
    </div>
  );
}
