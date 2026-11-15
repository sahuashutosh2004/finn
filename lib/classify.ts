// Keyword rules for exchange filings, using the categories from the challenge's reference PDF.

export const CATEGORIES = [
  "results",
  "M&A",
  "management_change",
  "litigation",
  "credit_rating",
  "fund_raise",
  "pledging",
  "capex",
  "insider_trading",
  "earnings_call",
  "dividend",
  "bonus_split",
  "press_release",
  "investor_meetings",
  "agm_egm",
  "postal_ballot",
  "unclassified",
] as const;

export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABEL: Record<Category, string> = {
  results: "Results",
  "M&A": "M&A",
  management_change: "Management",
  litigation: "Litigation",
  credit_rating: "Credit rating",
  fund_raise: "Fund raise",
  pledging: "Pledging",
  capex: "Capex",
  insider_trading: "Insider trade",
  earnings_call: "Earnings call",
  dividend: "Dividend",
  bonus_split: "Bonus / split",
  press_release: "Press release",
  investor_meetings: "Investor meet",
  agm_egm: "AGM / EGM",
  postal_ballot: "Postal ballot",
  unclassified: "Other",
};

/** 1 = important, 2 = notable, 3 = other, 4 = routine (collapsed). */
export type Tier = 1 | 2 | 3 | 4;

export const CATEGORY_TIER: Record<Category, Tier> = {
  results: 1,
  "M&A": 1,
  management_change: 1,
  litigation: 1,
  credit_rating: 1,
  fund_raise: 2,
  pledging: 2,
  capex: 2,
  insider_trading: 2,
  earnings_call: 3,
  dividend: 3,
  bonus_split: 3,
  press_release: 3,
  investor_meetings: 4,
  agm_egm: 4,
  postal_ballot: 4,
  unclassified: 4,
};

const EARNINGS_CALL =
  /transcript|audio recording|audio\/video recording|video recording|earnings call|earnings conference call|conference call|\bconcall\b/i;

const MANAGEMENT =
  /change in (?:directorate|management|key managerial|kmp|director)|resignation|resigns?\b|appointment|re-?appoint|cessation|superannuat|retire|chief executive|\bceo\b|\bcfo\b|chief financial|managing director|\bmd\b|whole[- ]time director|executive director|independent director|company secretary|compliance officer/i;

// First match wins, so order matters: routine paperwork that shares words with material
// categories ("trading window", "ESOP allotment", "appointment of auditor") comes first.
const RULES: [Category, RegExp][] = [
  // Another entity's results (e.g. a parent company's), not this company's.
  ["press_release", /results? (?:issued|announced|declared|published|released) by\b/i],
  ["unclassified", /trading window|\besop\b|\besos\b|\besps\b|employee stock|compliance certificate|74\s*\(\s*5\s*\)|secretarial audit|statutory auditor|cost auditor|appointment of (?:the )?auditor|duplicate share certificate|loss of share certificate|\bbrsr\b|business responsibility|\besg\b|registrar (?:and|&) (?:share )?transfer agent|interest payment|payment of interest/i],
  ["results", /financial results?|quarterly results?|\b(?:q[1-4](?:\s*fy\s*'?\d{2,4})?|quarter|half[- ]year)\b[^.]{0,40}\bresults?\b|results? for the (?:quarter|half|year)|un-?audited|audited (?:standalone|consolidated|financial)|integrated filing\s*\(?\s*financial|investor presentation|earnings presentation|results? presentation/i],
  ["earnings_call", EARNINGS_CALL],
  ["investor_meetings", /analyst|investor\(?s?\)? meet|institutional investor|investor conference|roadshow|road show/i],
  ["credit_rating", /credit rating|\brating\b|\bcrisil\b|\bicra\b|care ratings|india ratings|\bfitch\b|moody/i],
  ["pledging", /pledge|encumbrance|invocation/i],
  ["management_change", MANAGEMENT],
  ["M&A", /acqui|merger|amalgamat|demerg|scheme of arrangement|joint venture|\bjv\b|\bstake\b|subsidiar|divest|disinvest|slump sale|business transfer/i],
  ["fund_raise", /preferential|\bqip\b|qualified institution|rights issue|buy-?back|commercial paper|non-convertible|debenture|\bncds?\b|\bbonds?\b|fund rais|raising of funds|raise funds|warrants|private placement/i],
  ["insider_trading", /insider trading|prohibition of insider|regulation 7\s*\(\s*2\s*\)|\bsast\b|substantial acquisition|regulation 29/i],
  ["litigation", /litigation|dispute|penalt|show cause|demand order|tax demand|assessment order|\bnclt\b|\bnclat\b|insolvency|\bcirp\b|\bcourt\b|tribunal|sebi order|adjudicat|\bfine[sd]?\b|regulatory action|enforcement directorate|search and seizure/i],
  ["dividend", /dividend/i],
  ["bonus_split", /\bbonus\b|\bsplit\b|sub-?division/i],
  ["capex", /\bcapex\b|capital expenditure|capacity expansion|expansion of (?:the )?capacity|new plant|new facility|greenfield|brownfield|commissioning|commercial production|commencement of (?:operations|production)|\bexpansion of\b/i],
  ["postal_ballot", /postal[ _]ballot|e-voting/i],
  ["agm_egm", /\bagm\b|\begm\b|annual general meeting|extra-?ordinary general meeting|general meeting/i],
  ["press_release", /press release|media release|rumou?r|\border\b|bags|\bwins?\b|launch|partnership|collaborat|\bmou\b|memorandum of understanding|clarification|\baward|contract|agreement/i],
];

function match(text: string): Category | null {
  for (const [category, re] of RULES) if (re.test(text)) return category;
  return null;
}

/**
 * Classifies on the exchange title first. Many titles are generic ("Disclosure Under
 * Regulation 30", "Board Meeting Outcome"), so when the title matches nothing the
 * short summary is tried; if neither matches, the filing is unclassified.
 */
// BSE's own subcategory, used only when the keyword rules find nothing.
const BSE_HINTS: [RegExp, Category][] = [
  [/result/i, "results"],
  [/change in (?:directorate|management|kmp)|resignation|appointment/i, "management_change"],
  [/credit rating/i, "credit_rating"],
  [/acquisition|amalgamation|merger|scheme of arrangement/i, "M&A"],
  [/insider trading|sast/i, "insider_trading"],
  [/pledge|encumbrance/i, "pledging"],
  [/analyst|investor meet/i, "investor_meetings"],
  [/postal ballot/i, "postal_ballot"],
  [/agm|egm|general meeting/i, "agm_egm"],
  [/dividend/i, "dividend"],
  [/bonus|split/i, "bonus_split"],
  [/litigation|dispute|cirp|insolvency/i, "litigation"],
  [/press release|media release/i, "press_release"],
];

export function classify(title: string, summary?: string | null, bseSubcategory?: string | null): Category {
  const c = classifyText(title, summary);
  if (c !== "unclassified" || !bseSubcategory) return c;
  return BSE_HINTS.find(([re]) => re.test(bseSubcategory))?.[1] ?? c;
}

function classifyText(title: string, summary?: string | null): Category {
  const byTitle = match(title);
  // "Analyst / Investor Meet - Outcome" is also the exchange title used for earnings-call
  // recordings and transcripts; the reference puts those under earnings_call.
  if (byTitle === "investor_meetings" && summary && EARNINGS_CALL.test(summary)) return "earnings_call";
  // Some companies file board outcomes under "Change in Management"; trust the summary when it
  // names no management change but clearly matches another category.
  if (byTitle === "management_change" && summary && !MANAGEMENT.test(summary)) {
    const bySummary = match(summary);
    if (bySummary && bySummary !== "unclassified") return bySummary;
  }
  return byTitle ?? (summary ? match(summary) : null) ?? "unclassified";
}
