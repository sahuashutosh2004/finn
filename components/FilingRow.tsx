import { Pin } from "lucide-react";
import Tag from "@/components/ui/Tag";
import { CATEGORY_LABEL, CATEGORY_TIER } from "@/lib/classify";
import type { Filing } from "@/lib/filings";
import { formatDate, formatPct, formatRatio } from "@/lib/format";

export type Boost = { pct: number | null; ratio: number | null; priceHit: boolean; volumeHit: boolean } | null;

type Props = {
  filing: Filing;
  boost?: Boost;
  showSymbol?: boolean;
  why?: string | null;
  pinned?: boolean;
  isNew?: boolean;
};

/** Row content only; the list wraps it in a SwipeRow that opens the detail sheet. */
export default function FilingRow({ filing, boost, showSymbol = true, why, pinned, isNew }: Props) {
  return (
    <div className="py-2.5">
      <div className="flex items-center gap-1.5">
        {isNew ? <span aria-label="New" className="size-1.5 shrink-0 rounded-full bg-accent" /> : null}
        {showSymbol ? <span className="text-[15px] font-semibold">{filing.symbol}</span> : null}
        <Tag tone={CATEGORY_TIER[filing.category] === 1 ? "accent" : "neutral"}>{CATEGORY_LABEL[filing.category]}</Tag>
        {boost?.priceHit ? <Tag tone={boost.pct! >= 0 ? "up" : "down"}>{formatPct(boost.pct)}</Tag> : null}
        {boost?.volumeHit ? <Tag tone="accent">Vol {formatRatio(boost.ratio)}</Tag> : null}
        <span className="ml-auto flex shrink-0 items-center gap-1 text-[12px] text-muted">
          {pinned ? <Pin size={12} className="text-accent" aria-label="Pinned" /> : null}
          {formatDate(filing.date, false)}
        </span>
      </div>
      <p className="mt-0.5 line-clamp-3 text-[13px] leading-[18px] text-fg/90">{filing.summary ?? filing.title}</p>
      {why ? <p className="mt-1 line-clamp-2 text-[12px] leading-4 text-muted">Why it matters: {why}</p> : null}
    </div>
  );
}
