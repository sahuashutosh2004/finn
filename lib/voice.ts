// The spoken brief: market summary plus Top 3, kept under 45 seconds (~105 words at a calm pace).
import type { BriefSummary } from "./brief";
import { CATEGORY_LABEL } from "./classify";
import type { TopItem } from "./triage";

export const MAX_WORDS = 105;

const pct = (n: number) => `${Math.abs(n).toFixed(1)} percent`;
const clip = (s: string, words: number) => {
  const w = s.replace(/\s+/g, " ").trim().split(" ");
  return w.length <= words ? w.join(" ") : `${w.slice(0, words).join(" ")}…`;
};
const ORDINAL = ["One", "Two", "Three"];

export function speechScript(opts: {
  title: string;
  dateLabel: string;
  summary: BriefSummary;
  total: number;
  top: TopItem[];
  nameOf: (symbol: string) => string;
}): string {
  const { summary: s, top, nameOf } = opts;
  const parts: string[] = [`${opts.title}, ${opts.dateLabel}.`];
  parts.push(`Of your ${opts.total} holdings, ${s.up} rose and ${s.down} fell.`);
  if (s.gainer?.dayChangePct) parts.push(`${nameOf(s.gainer.symbol)} gained ${pct(s.gainer.dayChangePct)}.`);
  if (s.loser?.dayChangePct) parts.push(`${nameOf(s.loser.symbol)} fell ${pct(s.loser.dayChangePct)}.`);

  if (top.length) {
    parts.push(top.length === 3 ? "Top 3 for today." : `Top ${top.length} for today.`);
    top.forEach((it, i) => {
      const lead = `${ORDINAL[i]}: ${nameOf(it.symbol)},`;
      if (it.kind === "filing") {
        parts.push(`${lead} ${CATEGORY_LABEL[it.filing.category].toLowerCase()}. ${clip(it.filing.summary ?? it.filing.title, 13)}`);
      } else {
        const bits = [
          it.priceHit && it.pct !== null ? `${it.pct >= 0 ? "up" : "down"} ${pct(it.pct)}` : "",
          it.volumeHit && it.ratio !== null ? `${it.ratio.toFixed(1)} times its usual volume` : "",
        ].filter(Boolean);
        parts.push(`${lead} ${bits.join(", on ")}.`);
      }
    });
  } else {
    parts.push("Nothing needs your attention today.");
  }

  // Trim whole sentences from the end until it fits; the title and market line always stay.
  let words = parts.join(" ").split(" ");
  while (words.length > MAX_WORDS && parts.length > 2) {
    parts.pop();
    words = parts.join(" ").split(" ");
  }
  return parts.join(" ");
}
