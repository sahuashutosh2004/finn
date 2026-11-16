// Promised vs delivered: what management guided on growth, margin and capex in the latest
// earnings call, checked against Screener's quarterly table.
import { askJson, provider } from "./llm";
import { pdfText } from "./pdf";
import { sentences } from "./profile";
import { findRow, indexOfKey, round, shiftQuarterEnd } from "./results";
import type { Quarters, ScreenerData } from "./screener";
import { checkQuote, numberInQuote } from "./verify";

export type GuidanceMetric = "revenue_growth" | "ebitda_margin" | "pat_growth" | "capex" | "other";
export type Verdict = "on_track" | "missed" | "too_early" | "cant_check";

export type GuidanceItem = {
  topic: "growth" | "margin" | "capex";
  metric: GuidanceMetric;
  quote: string;
  low: number | null;
  high: number | null;
  unit: "%" | "cr" | null;
  period: string | null;
  /** Why the target can't be held against Screener's company-wide table (set by the checker). */
  scope?: string | null;
};

export type Delivered = {
  measure: string; // "Sales growth YoY", "Operating margin"
  quarters: { label: string; value: number | null }[]; // last 4 quarters, oldest first
  actual: number | null; // compared with the target
  actualLabel: string; // "Last 4 quarters" or "FY27 so far (2 quarters)"
  formula: string;
};

export type CheckedItem = GuidanceItem & { verdict: Verdict; delivered: Delivered | null; note: string | null };

export type GuidanceResult =
  | { status: "no-transcript" }
  | { status: "no-key"; transcriptUrl: string; period: string }
  | { status: "error"; transcriptUrl: string; period: string; error: string }
  // The model is at its free-tier limit or still reading: the page shows the tables-only view.
  | { status: "unavailable"; transcriptUrl: string; period: string; reason: "limit" | "busy" }
  | {
      status: "ok";
      transcriptUrl: string;
      period: string;
      items: CheckedItem[];
      rejected: { quote: string; reason: string }[];
      hit: number;
      of: number;
      model: string;
    };

const FORWARD = /guid|outlook|expect|target|\baim\b|aspir|going forward|next year|\bFY\s?'?\d{2}|double[- ]digit|we will|we would|\bplan|\brange of\b|sustain/i;
const METRIC = /margin|capex|capital expenditure|growth|\bgrow|revenue|ebitda|top ?line|volume/i;

/** Picks guidance-looking sentences (plus the one before, for context) so the model reads ~2k tokens, not 15k. */
export function guidanceExcerpt(text: string, maxChars = 9000): string {
  const ss = sentences(text);
  const keep = new Set<number>();
  ss.forEach((s, i) => {
    if (/forward[- ]looking statements?/i.test(s)) return;
    if (FORWARD.test(s) && METRIC.test(s)) {
      keep.add(i);
      if (i > 0) keep.add(i - 1);
    }
  });
  let out = "";
  let last = -2;
  for (const i of [...keep].sort((a, b) => a - b)) {
    const piece = (i === last + 1 ? " " : "\n…\n") + ss[i];
    if (out.length + piece.length > maxChars) break;
    out += piece;
    last = i;
  }
  return out.trim();
}

// ---------- delivered numbers ----------

const salesRow = (q: Quarters) => findRow(q, "Sales") ?? findRow(q, "Revenue");

function sumAt(values: (number | null)[], idx: number[]): number | null {
  let s = 0;
  for (const i of idx) {
    const v = i >= 0 ? values[i] : null;
    if (v === null || v === undefined) return null;
    s += v;
  }
  return s;
}

/** FY27 -> 2027 (Indian fiscal year ending March). */
export function fiscalYearEnd(period: string | null): number | null {
  const m = period?.match(/\bFY\s?'?(\d{4}|\d{2})\b/i);
  if (!m) return null;
  const y = Number(m[1]);
  return y < 100 ? 2000 + y : y;
}

/** The fiscal year an earnings call falls in: a call in "Oct 2026" is in FY27. */
export function callFiscalYear(period: string | null): number | null {
  const m = period?.match(/\b([A-Za-z]{3})[a-z]*\s+(\d{4})\b/);
  if (!m) return null;
  const month = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(m[1].toLowerCase());
  if (month < 0) return null;
  const y = Number(m[2]);
  return month >= 3 ? y + 1 : y;
}

const THIS_YEAR = /\b(this|current|the) (financial |fiscal )?year\b|\bfull[- ]year\b|\bthis fiscal\b/i;
const QUARTER = /\bQ([1-4])\b|\bquarter ?([1-4])\b|\b([1-4])(?:st|nd|rd|th) quarter\b/i;

/** Which quarter-end dates the target covers: one quarter, a fiscal year, or (no period stated) none. */
export function targetPeriod(item: GuidanceItem, callFy: number | null): { fy: number | null; quarter: number | null } {
  const text = `${item.period ?? ""} ${item.quote}`;
  // Only the period field names a target quarter; a quote can mention "our Q2 performance" in passing.
  const qm = (item.period ?? "").match(QUARTER);
  const quarter = qm ? Number(qm[1] ?? qm[2] ?? qm[3]) : null;
  const fy = fiscalYearEnd(item.period) ?? fiscalYearEnd(item.quote) ?? (quarter || THIS_YEAR.test(text) ? callFy : null);
  return { fy, quarter: fy ? quarter : null };
}

const fyLabel = (fy: number) => `FY${String(fy).slice(2)}`;
const QUARTER_END = ["", "-06-30", "-09-30", "-12-31", "-03-31"];

export function delivered(item: GuidanceItem, q: Quarters, callFy: number | null = null): { delivered: Delivered | null; verdict: Verdict; note: string | null } {
  if (item.metric === "capex" || item.metric === "other") {
    const note = item.scope ?? (item.metric === "capex" ? "Screener has no quarterly capex to check against." : "Not a company-wide revenue, EBITDA margin or profit target, so Screener's table can't check it.");
    return { delivered: null, verdict: "cant_check", note };
  }
  if (item.unit !== "%" || (item.low === null && item.high === null)) {
    return { delivered: null, verdict: "cant_check", note: "No numeric % target to check." };
  }
  const sales = salesRow(q);
  const num = item.metric === "ebitda_margin" ? findRow(q, "Operating Profit") : item.metric === "pat_growth" ? findRow(q, "Net Profit") : sales;
  if (!num || !sales) return { delivered: null, verdict: "cant_check", note: "Screener's table has no matching row for this company." };

  const n = q.periods.length;
  const last4 = [n - 4, n - 3, n - 2, n - 1].filter((i) => i >= 0);
  const yearAgo = (i: number) => indexOfKey(q, q.periods[i].key ? shiftQuarterEnd(q.periods[i].key!, 12) : null);

  const margin = item.metric === "ebitda_margin";
  const measure = margin ? "EBITDA margin" : `${num.name} growth YoY`;
  const perQuarter = last4.map((i) => {
    if (margin) {
      const op = num.values[i];
      const s = sales.values[i];
      return { label: q.periods[i].label, value: op != null && s ? round((op / s) * 100, 1) : null };
    }
    const cur = num.values[i];
    const base = num.values[yearAgo(i)] ?? null;
    return { label: q.periods[i].label, value: cur != null && base != null && base > 0 ? round(((cur - base) / base) * 100, 1) : null };
  });

  // The window the target applies to: the guided quarter, the guided fiscal year so far, else the last 4 quarters.
  const { fy, quarter } = targetPeriod(item, callFy);
  const latest = q.periods[n - 1]?.key ?? "";
  let window = last4;
  let actualLabel = "Last 4 quarters (no period stated)";
  let partial = false;
  if (fy && quarter) {
    const key = `${quarter === 4 ? fy : fy - 1}${QUARTER_END[quarter]}`;
    const label = `Q${quarter} ${fyLabel(fy)}`;
    const i = indexOfKey(q, key);
    if (i < 0) {
      return {
        delivered: { measure, quarters: perQuarter, actual: null, actualLabel: label, formula: "" },
        verdict: latest < key ? "too_early" : "cant_check",
        note: latest < key ? `The target is for ${label}, which isn't reported yet.` : `Screener's table doesn't have ${label}.`,
      };
    }
    window = [i];
    actualLabel = label;
  } else if (fy) {
    const start = `${fy - 1}-04-01`;
    const end = `${fy}-03-31`;
    window = q.periods.map((p, i) => (p.key && p.key >= start && p.key <= end ? i : -1)).filter((i) => i >= 0);
    if (window.length === 0) {
      return {
        delivered: { measure, quarters: perQuarter, actual: null, actualLabel: fyLabel(fy), formula: "" },
        verdict: latest < start ? "too_early" : "cant_check",
        note: latest < start ? `No quarter of ${fyLabel(fy)} reported yet.` : "Screener's table doesn't cover that year.",
      };
    }
    partial = window.length < 4;
    actualLabel = `${fyLabel(fy)}${partial ? ` so far (${window.length} quarter${window.length > 1 ? "s" : ""})` : ""}`;
  }

  let actual: number | null = null;
  let formula: string;
  if (margin) {
    const op = sumAt(num.values, window);
    const s = sumAt(sales.values, window);
    actual = op !== null && s ? round((op / s) * 100, 1) : null;
    formula = `Σ Operating Profit ÷ Σ Sales over ${window.map((i) => q.periods[i].label).join(", ")}`;
  } else {
    const cur = sumAt(num.values, window);
    const base = sumAt(num.values, window.map(yearAgo));
    actual = cur !== null && base !== null && base > 0 ? round(((cur - base) / base) * 100, 1) : null;
    formula = `Σ ${num.name} over ${window.map((i) => q.periods[i].label).join(", ")} vs the same quarters a year earlier`;
  }

  const target = item.low ?? item.high!;
  const base = margin ? "EBITDA here is Screener's Operating Profit ÷ Sales." : null;
  const out = { measure, quarters: perQuarter, actual, actualLabel, formula };
  if (actual === null) return { delivered: out, verdict: "cant_check", note: base };
  if (/aspir/i.test(item.quote)) {
    return { delivered: out, verdict: "too_early", note: "A long-term aim, not a dated target; the recent figure is shown for reference." };
  }
  if (partial && actual < target) {
    return { delivered: out, verdict: "too_early", note: `Behind so far: ${actual}% against ${target}% with ${4 - window.length} quarter${4 - window.length > 1 ? "s" : ""} of ${fyLabel(fy!)} to go.` };
  }
  return { delivered: out, verdict: actual >= target ? "on_track" : "missed", note: base };
}

// ---------- extraction ----------

type Raw = { items?: (Partial<GuidanceItem> & { speaker?: string })[] };

const TOPICS = new Set(["growth", "margin", "capex"]);
const METRICS = new Set(["revenue_growth", "ebitda_margin", "pat_growth", "capex", "other"]);

// A target is compared with Screener's company-wide table only when the quote names that measure
// for the whole company, in rupees. Anything narrower is shown but marked "can't check".
const NAMES: Record<"revenue_growth" | "ebitda_margin" | "pat_growth", RegExp> = {
  revenue_growth: /revenue|sales|top ?line|turnover/i,
  ebitda_margin: /ebitda/i,
  pat_growth: /profit|\bpat\b|earnings|bottom ?line/i,
};
const CURRENCY = /constant currency|\bcc\b|\bUSD\b|dollar/i;
const PART =
  /segment|portfolio|division|vertical|\bAUM\b|assets under management|\bloans?\b|advances|deposits?|order inflow|order book|fee income|volumes?\b|subsidiar|export/i;

// An analyst addressing management ("you are guiding for…") is not management's own guidance.
const ANALYST_VOICE = /\byou(?:'re| are| have| had)? (?:guid|mention|said|indicat|talk)|\byour (?:guidance|target)/i;

/** Why a guided number can't be held against Screener's company-wide quarterly table, or null if it can. */
export function scopeIssue(metric: GuidanceMetric, quote: string): string | null {
  if (metric !== "revenue_growth" && metric !== "ebitda_margin" && metric !== "pat_growth") return null;
  if (!NAMES[metric].test(quote)) {
    return metric === "ebitda_margin"
      ? "The quote doesn't say EBITDA, and Screener's margin is EBITDA, so the two may not be comparable."
      : `The quote doesn't name the company's ${metric === "pat_growth" ? "profit" : "revenue"}, so Dreamstockifier doesn't compare it with Screener's table.`;
  }
  if (CURRENCY.test(quote)) return "Guided in constant currency or dollars; Screener reports rupee figures.";
  const part = quote.match(PART);
  if (part) return `The target is for ${part[0].toLowerCase()}, not the whole company, so Screener's company-wide table can't check it.`;
  return null;
}

/** Keeps only items whose quote is in the transcript and whose target numbers are written in the quote. */
export function verifyItems(raw: Raw, transcript: string): { items: GuidanceItem[]; rejected: { quote: string; reason: string }[] } {
  const items: GuidanceItem[] = [];
  const rejected: { quote: string; reason: string }[] = [];
  const seen = new Set<string>();
  for (const r of raw.items ?? []) {
    const quote = (r.quote ?? "").replace(/\s+/g, " ").trim();
    const q = checkQuote(quote, transcript);
    if (!q.ok) {
      rejected.push({ quote, reason: q.reason });
      continue;
    }
    if (quote.includes("?") || ANALYST_VOICE.test(quote) || /^(analyst|moderator)$/i.test(r.speaker?.trim() ?? "")) {
      rejected.push({ quote, reason: "a question from the call, not management guidance" });
      continue;
    }
    const low = typeof r.low === "number" && Number.isFinite(r.low) ? r.low : null;
    const high = typeof r.high === "number" && Number.isFinite(r.high) ? r.high : null;
    const bad = [low, high].filter((v): v is number => v !== null && !numberInQuote(v, quote));
    if (bad.length) {
      rejected.push({ quote, reason: `target ${bad.join(", ")} isn't written in the quote` });
      continue;
    }
    if (seen.has(quote)) continue;
    seen.add(quote);
    const metric = METRICS.has(r.metric as string) ? (r.metric as GuidanceMetric) : "other";
    const scope = scopeIssue(metric, quote);
    items.push({
      topic: TOPICS.has(r.topic as string) ? (r.topic as GuidanceItem["topic"]) : "growth",
      metric: scope ? "other" : metric,
      quote,
      low,
      high,
      unit: r.unit === "%" || r.unit === "cr" ? r.unit : null,
      period: typeof r.period === "string" && r.period.trim() && !/^null$/i.test(r.period.trim()) ? r.period.trim() : null,
      scope,
    });
  }
  return { items, rejected };
}

export function latestTranscript(sd: ScreenerData): { url: string; period: string } | null {
  const c = sd.concalls.find((x) => x.transcript);
  return c?.transcript ? { url: c.transcript, period: c.period } : null;
}

export function check(items: GuidanceItem[], q: Quarters, callFy: number | null = null): { items: CheckedItem[]; hit: number; of: number } {
  const checked = items.map((it) => ({ ...it, ...delivered(it, q, callFy) }));
  const hit = checked.filter((c) => c.verdict === "on_track").length;
  const of = hit + checked.filter((c) => c.verdict === "missed").length;
  return { items: checked, hit, of };
}

function guidanceFailure(res: { error: string; limited?: boolean }, t: { url: string; period: string }): GuidanceResult {
  if (res.error === "no API key" && !provider()) return { status: "no-key", transcriptUrl: t.url, period: t.period };
  if (res.limited) return { status: "unavailable", transcriptUrl: t.url, period: t.period, reason: "limit" };
  return { status: "error", transcriptUrl: t.url, period: t.period, error: res.error };
}

export async function getGuidance(sd: ScreenerData, opts: { live?: boolean } = {}): Promise<GuidanceResult> {
  const t = latestTranscript(sd);
  if (!t || !sd.quarters) return { status: "no-transcript" };
  if (!provider()) return { status: "no-key", transcriptUrl: t.url, period: t.period };

  const pdf = await pdfText(t.url);
  if (!pdf.ok) return { status: "error", transcriptUrl: t.url, period: t.period, error: pdf.error };

  const excerpt = guidanceExcerpt(pdf.text);
  const res = await askJson<Raw>({
    task: "guidance",
    version: "v2",
    sourceUrl: t.url,
    maxTokens: 1000,
    attempts: opts.live ? 1 : 3,
    system:
      "You extract forward-looking guidance that company management gave on an earnings call. Use only the excerpt. " +
      "Only statements made by the company's management count: never quote an analyst's question, the moderator, or management repeating an analyst's number back. " +
      "Ignore macro commentary and past results. Return JSON " +
      '{"items":[{"speaker":"management"|"analyst","topic":"growth"|"margin"|"capex","metric":"revenue_growth"|"ebitda_margin"|"pat_growth"|"capex"|"other",' +
      '"quote":"one or two sentences copied word for word from the excerpt","low":number|null,"high":number|null,"unit":"%"|"cr"|null,"period":"as stated, e.g. FY27 or Q4 FY27, or null"}]}. ' +
      "metric revenue_growth, ebitda_margin or pat_growth only when the target is for the whole company's revenue, EBITDA margin or profit; " +
      "targets for a segment, product, region, loans, deposits, AUM, order inflow, volumes, fee income, EBIT/operating margin, or in constant currency are metric other. " +
      "At most 6 items. low/high must be numbers written in the quote (a range 11% to 13% is low 11, high 13). " +
      'If management gave no explicit guidance return {"items":[]}.',
    user: `Company: ${sd.companyName ?? sd.symbol}\nExcerpt from the ${t.period} earnings call transcript:\n${excerpt}`,
  });
  if (!res.ok) return guidanceFailure(res, t);
  const { items, rejected } = verifyItems(res.json, pdf.text);
  return { status: "ok", transcriptUrl: t.url, period: t.period, rejected, model: res.model, ...check(items, sd.quarters, callFiscalYear(t.period)) };
}
