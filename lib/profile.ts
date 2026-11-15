// "Brief profile" of an appointed person, from the exchange filing PDF (SEBI LODR filings carry one).
import { askJson } from "./llm";
import { checkQuote, containsPhrase } from "./verify";

export type Profile = {
  name: string | null;
  role: string | null; // as written in the filing
  quote: string; // verbatim background from the filing
  verifiedBy: "text" | "model+check";
};

const HONORIFIC = /\b(?:Mr|Ms|Mrs|Dr|Shri|Smt|Prof)\.?\s+/;
const NAME = /\b(?:Mr|Ms|Mrs|Dr|Shri|Smt|Prof)\.?\s+((?:[A-Z]\.\s*){0,3}[A-Z][a-zA-Z'-]+(?:\s+(?:[A-Z]\.\s*)*[A-Z][a-zA-Z'-]+){0,3})/;

const squash = (s: string) => s.replace(/\s+/g, " ").trim();

// A full stop after these doesn't end a sentence ("Mr. V. Srinivasa Rangan", "w.e.f. July 1").
const NO_BREAK = /(?:^|\s)(?:Mr|Ms|Mrs|Dr|Shri|Smt|Prof|Ltd|Co|No|Nos|viz|i\.e|e\.g|w\.e\.f|St|Jr|Sr|[A-Z])\.$/;

export function sentences(s: string): string[] {
  const text = squash(s);
  const out: string[] = [];
  let start = 0;
  for (const m of text.matchAll(/[.!?](?=\s+["“(]?[A-Z0-9])/g)) {
    const end = m.index! + 1;
    if (NO_BREAK.test(text.slice(start, end))) continue;
    out.push(text.slice(start, end).trim());
    start = end;
  }
  const rest = text.slice(start).trim();
  if (rest) out.push(rest);
  return out;
}

/**
 * Finds the profile paragraph. Disclosure tables often say "Brief profile … As per Annexure",
 * so every "profile" heading is tried and the first one followed by prose about a person wins.
 */
export function findProfile(text: string): { name: string | null; quote: string } | null {
  for (const m of text.matchAll(/profile/gi)) {
    const after = text.slice(m.index! + m[0].length, m.index! + 2500);
    const lines = after.split("\n");
    // Skip the rest of the heading line ("(in case of appointment)", "— MR. X").
    const body = lines.slice(1).join("\n");
    const firstPerson = body.search(HONORIFIC);
    if (firstPerson < 0 || firstPerson > 300) continue;
    const prose = sentences(body.slice(firstPerson)).filter((s) => s.split(" ").length >= 6);
    if (prose.length === 0 || prose[0].length < 60) continue;

    let quote = "";
    for (const s of prose.slice(0, 3)) {
      if (quote && quote.length + s.length > 480) break;
      quote = quote ? `${quote} ${s}` : s;
    }
    const name = squash(body.slice(firstPerson)).match(NAME)?.[1]?.replace(/\s+/g, " ") ?? null;
    return { name, quote };
  }
  return null;
}

const DESIGNATION = new RegExp(
  "(?:" +
    [
      "Managing Director\\s*(?:&|and)\\s*(?:Chief Executive Officer|CEO)",
      "MD\\s*(?:&|and)\\s*CEO",
      "Whole[- ]?time Director",
      "(?:Non[- ])?Executive Director",
      "(?:Additional\\s+)?(?:Non[- ]Executive\\s+)?Independent Director",
      "Additional Director",
      "Managing Director",
      "Joint Managing Director",
      "Deputy Managing Director",
      "Director\\s*\\((?:Operations|Finance|Commercial|Technical|HR|Human Resources|Marketing|Production|Projects|Personnel)\\)",
      "Chief (?:Executive|Financial|Operating|Technology|Risk|Compliance|Information|Human Resources|Business|Digital|Credit|Marketing) Officer",
      "Company Secretary(?:\\s*(?:&|and)\\s*Compliance Officer)?",
      "Compliance Officer",
      "Group Head[\\w ,&-]{0,40}?(?=[,.;(]|\\s+(?:of|with|w\\.e\\.f|effective|from|for)\\b)",
      "Chief Executive Officer",
      "(?:Non[- ]Executive\\s+)?Chair(?:man|person)",
      "Senior Management Personnel",
      "(?:(?:Associate|Senior|Executive)\\s+)?(?:Vice\\s+)?President",
      "CEO",
      "CFO",
    ].join("|") +
    ")",
  "i",
);

/** The new designation, copied from the first appointment sentence. "Designated as X" wins over the formal title. */
export function findRole(text: string): string | null {
  for (const s of sentences(text)) {
    if (!/\b(?:re-?appoint|appoint|designat|elevat|promot|elect)/i.test(s) || /cessation|ceas|resign|superannuat|retire/i.test(s)) continue;
    const full = `${DESIGNATION.source}(?:\\s+in the capacity of (?:an? |the )?${DESIGNATION.source})?`;
    const designated = s.match(new RegExp(`designated as (?:the |an? )?(${full})`, "i"));
    if (designated) return squash(designated[1]);
    const from = s.search(/\b(?:re-?appoint|appoint|designat|elevat|promot|elect)/i);
    const m = s.slice(from).match(new RegExp(full, "i"));
    if (m) return squash(m[0]);
  }
  return null;
}

/** Profiles often say "Mr. Prithvi …"; the appointment line has the full name. */
export function fullName(text: string, short: string | null): string | null {
  if (!short) return null;
  const all = [...squash(text).matchAll(new RegExp(NAME.source, "g"))].map((m) => m[1].replace(/\s+/g, " ").replace(/\s+(?:Mr|Ms|Mrs|Dr|Shri|Smt|Prof)\b.*$/, ""));
  return all.filter((n) => n.startsWith(`${short} `) && n.split(" ").length <= 4).sort((a, b) => b.length - a.length)[0] ?? short;
}

type ModelProfile = { name?: string | null; new_role?: string | null; background_quote?: string | null };

export async function buildProfile(pdfUrl: string, text: string, filingLine: string): Promise<Profile | null> {
  const found = findProfile(text);
  if (!found) return null;
  const base: Profile = { name: fullName(text, found.name), role: findRole(text), quote: found.quote, verifiedBy: "text" };

  const start = Math.max(0, text.indexOf(found.quote.slice(0, 30)) - 1500);
  const excerpt = squash(text.slice(0, 1800)) + "\n...\n" + squash(text.slice(start, start + 3500));
  const res = await askJson<ModelProfile>({
    task: "profile",
    sourceUrl: pdfUrl,
    maxTokens: 300,
    system:
      "You read Indian stock-exchange filings about a management change. Use only the filing text. " +
      'Return JSON {"name": string|null, "new_role": string|null, "background_quote": string|null}. ' +
      "name: the person appointed or re-appointed, as written. new_role: their new designation, copied exactly as written in the filing. " +
      "background_quote: 2-3 consecutive sentences about their background, copied word for word. Use null when not stated.",
    user: `Filing line: ${filingLine}\n\nFiling text:\n${excerpt}`,
  });
  if (!res.ok) return base;

  const name = res.json.name && containsPhrase(res.json.name, text) ? squash(res.json.name) : base.name;
  const role = res.json.new_role && containsPhrase(res.json.new_role, text) ? squash(res.json.new_role) : base.role;
  const q = res.json.background_quote;
  const quote = q && checkQuote(q, text).ok ? squash(q) : base.quote;
  return { name, role, quote, verifiedBy: role !== base.role || quote !== base.quote ? "model+check" : "text" };
}
