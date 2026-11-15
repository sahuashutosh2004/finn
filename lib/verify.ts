// Grounding checks for anything a model hands back. A quote is accepted only if its words appear
// contiguously in the source (ignoring case, punctuation, line breaks and PDF hyphenation);
// a number is accepted only if the same number appears in the source text or the given tables.

function normalize(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\u2018\u2019\u201a\u201b\u2032`´]/g, "'")
    .replace(/[\u201c\u201d\u201e\u2033]/g, '"')
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/-\s*\n\s*/g, "") // word broken across a PDF line
    .replace(/(\d),(?=\d)/g, "$1"); // 1,19,121 -> 119121
}

function tokens(text: string): string[] {
  return normalize(text).match(/[a-z]+|\d+(?:\.\d+)?%?/g) ?? [];
}

const MIN_QUOTE_TOKENS = 5;

export type QuoteCheck = { ok: true } | { ok: false; reason: string };

/** Quotes may skip text with "..." / "…"; each fragment must appear, in order. */
export function checkQuote(quote: string, source: string): QuoteCheck {
  const fragments = quote
    .split(/\.{3,}|…/)
    .map((f) => tokens(f))
    .filter((t) => t.length > 0);
  const total = fragments.reduce((n, f) => n + f.length, 0);
  if (total < MIN_QUOTE_TOKENS) return { ok: false, reason: "quote too short to check" };

  const hay = ` ${tokens(source).join(" ")} `;
  let from = 0;
  for (const f of fragments) {
    const at = hay.indexOf(` ${f.join(" ")} `, from);
    if (at < 0) return { ok: false, reason: `not in source: "${f.slice(0, 8).join(" ")}${f.length > 8 ? " …" : ""}"` };
    from = at + f.join(" ").length;
  }
  return { ok: true };
}

/** Like checkQuote without the minimum length, for short spans such as a name or a job title. */
export function containsPhrase(phrase: string, source: string): boolean {
  const p = tokens(phrase);
  return p.length > 0 && ` ${tokens(source).join(" ")} `.includes(` ${p.join(" ")} `);
}

/** Numbers as written, normalised: commas dropped, trailing decimal zeros dropped ("12.50" -> "12.5"). */
export function numbersIn(text: string): string[] {
  const out: string[] = [];
  for (const m of normalize(text).matchAll(/\d+(?:\.\d+)?/g)) out.push(canon(m[0]));
  return out;
}

function canon(n: string): string {
  return n.includes(".") ? n.replace(/0+$/, "").replace(/\.$/, "") : n.replace(/^0+(?=\d)/, "");
}

export type NumberCheck = { ok: true } | { ok: false; missing: string[] };

/** Every number in `claim` must appear exactly in `source` or in `allowed` (e.g. table values). */
export function checkNumbers(claim: string, source: string, allowed: number[] = []): NumberCheck {
  const have = new Set(numbersIn(source));
  for (const v of allowed) if (Number.isFinite(v)) have.add(canon(String(Math.abs(v))));
  const missing = [...new Set(numbersIn(claim))].filter((n) => !have.has(n));
  return missing.length ? { ok: false, missing } : { ok: true };
}

/** A model-extracted number (e.g. a guidance target) must be written in its own quote. */
export function numberInQuote(value: number, quote: string): boolean {
  return numbersIn(quote).includes(canon(String(Math.abs(value))));
}
