import Num from "@/components/Num";
import type { BarSeries } from "@/lib/research";

const IN0 = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const HEIGHT = 56;

/** One small bar row per series, each on its own scale. Losses are drawn in red. */
export default function QuarterBars({ series, unit }: { series: BarSeries[]; unit: string }) {
  return (
    <div className="space-y-4 py-3">
      {series.map((s) => {
        const vals = s.bars.map((b) => b.value).filter((v): v is number => v !== null);
        const max = Math.max(1, ...vals.map(Math.abs));
        const last = s.bars[s.bars.length - 1];
        return (
          <div key={s.name}>
            <div className="flex items-baseline justify-between">
              <span className="text-[13px] font-semibold">{s.name}</span>
              <span className="text-[13px] tabular-nums text-muted">
                {last ? (
                  <>
                    {last.label}:{" "}
                    <Num r={last.receipt} className="font-semibold text-fg">
                      {last.value === null ? "—" : `₹${IN0.format(last.value)}`}
                    </Num>{" "}
                    {unit}
                  </>
                ) : null}
              </span>
            </div>
            <div className="mt-2 flex items-end gap-1.5" style={{ height: HEIGHT }}>
              {s.bars.map((b, i) => {
                const h = b.value === null ? 0 : Math.max(2, Math.round((Math.abs(b.value) / max) * HEIGHT));
                const latest = i === s.bars.length - 1;
                return (
                  <Num key={b.label} r={b.receipt} className="!mx-0 flex h-full flex-1 items-end !px-0">
                    <span
                      aria-hidden
                      className={`block w-full rounded-[3px] transition-opacity duration-150 ${
                        b.value === null ? "" : b.value < 0 ? "bg-down" : latest ? "bg-accent" : "bg-accent/35"
                      }`}
                      style={{ height: h }}
                    />
                    <span className="sr-only">
                      {b.label}: {b.value === null ? "blank" : IN0.format(b.value)}
                    </span>
                  </Num>
                );
              })}
            </div>
            <div className="mt-1 flex justify-between text-[11px] text-muted">
              <span>{s.bars[0]?.label}</span>
              <span>{last?.label}</span>
            </div>
          </div>
        );
      })}
      {series.some((s) => s.bars.some((b) => b.value !== null && b.value < 0)) ? <p className="text-[11px] text-muted">Red bars are losses.</p> : null}
    </div>
  );
}
