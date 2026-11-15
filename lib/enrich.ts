// Push-side enrichment read from each filing's PDF: the appointee's profile for management
// changes and a one-line "why it matters" for important filings. Both are grounded checks:
// a profile quote must be in the PDF, and every number in "why it matters" must be too.
import { CATEGORY_TIER } from "./classify";
import type { Filing } from "./filings";
import { askJson } from "./llm";
import { pdfText } from "./pdf";
import { buildProfile, type Profile } from "./profile";
import { checkNumbers } from "./verify";

export type Enrichment = {
  profile?: Profile | null; // null = the PDF has no profile section
  why?: string | null;
  pdfError?: string;
  rejected?: string; // why a model line was dropped
};

export function wantsEnrichment(f: Filing): boolean {
  return Boolean(f.url) && (f.category === "management_change" || CATEGORY_TIER[f.category] === 1);
}

export async function enrichFiling(f: Filing): Promise<Enrichment> {
  if (!f.url) return {};
  const pdf = await pdfText(f.url);
  if (!pdf.ok) return { pdfError: pdf.error };

  const out: Enrichment = {};
  if (f.category === "management_change") {
    out.profile = await buildProfile(f.url, pdf.text, f.summary ?? f.title);
  }

  const res = await askJson<{ why?: string | null }>({
    task: "why",
    sourceUrl: f.url,
    maxTokens: 120,
    system:
      "You help an investor triage stock-exchange filings. From the filing text only, write ONE plain sentence (max 25 words) on why this filing matters to a shareholder. " +
      'No hype, no advice, no outside knowledge. Only use numbers that are written in the filing. Return JSON {"why": string|null}; null if it is routine.',
    user: `Filing: ${f.title}\n\n${pdf.text.replace(/\s+/g, " ").slice(0, 7000)}`,
  });
  if (res.ok && res.json.why) {
    const why = res.json.why.replace(/\s+/g, " ").trim();
    const nums = checkNumbers(why, pdf.text);
    if (nums.ok && why.split(" ").length <= 40) out.why = why;
    else out.rejected = nums.ok ? "too long" : `numbers not in the PDF: ${nums.missing.join(", ")}`;
  }
  return out;
}
