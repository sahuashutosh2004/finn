export type Company = {
  symbol: string; // NSE symbol
  name: string;
  industry: string;
};

export const PORTFOLIO: Company[] = [
  { symbol: "RELIANCE", name: "Reliance Industries", industry: "Oil, Gas & Conglomerate" },
  { symbol: "TCS", name: "Tata Consultancy Services", industry: "IT Services" },
  { symbol: "HDFCBANK", name: "HDFC Bank", industry: "Private Bank" },
  { symbol: "ICICIBANK", name: "ICICI Bank", industry: "Private Bank" },
  { symbol: "INFY", name: "Infosys", industry: "IT Services" },
  { symbol: "ITC", name: "ITC", industry: "FMCG" },
  { symbol: "LT", name: "Larsen & Toubro", industry: "Engineering & Construction" },
  { symbol: "SUNPHARMA", name: "Sun Pharmaceutical Industries", industry: "Pharmaceuticals" },
  { symbol: "MARUTI", name: "Maruti Suzuki India", industry: "Automobiles" },
  { symbol: "AXISBANK", name: "Axis Bank", industry: "Private Bank" },
  { symbol: "POLYCAB", name: "Polycab India", industry: "Cables & Wires" },
  { symbol: "PERSISTENT", name: "Persistent Systems", industry: "IT Services" },
  { symbol: "DIXON", name: "Dixon Technologies (India)", industry: "Electronics Manufacturing" },
  { symbol: "POLICYBZR", name: "PB Fintech", industry: "Insurance & Lending Marketplace" },
  { symbol: "DELHIVERY", name: "Delhivery", industry: "Logistics" },
  { symbol: "ASTRAL", name: "Astral", industry: "Pipes & Building Products" },
  { symbol: "KPITTECH", name: "KPIT Technologies", industry: "Automotive Software" },
  { symbol: "BIKAJI", name: "Bikaji Foods International", industry: "Packaged Foods" },
];

// Not held. Shown on the Company tab as research starting points.
export const SUGGESTIONS: Company[] = [
  { symbol: "HAL", name: "Hindustan Aeronautics", industry: "Aerospace & Defence" },
  { symbol: "TRENT", name: "Trent", industry: "Retail" },
  { symbol: "BAJFINANCE", name: "Bajaj Finance", industry: "NBFC" },
  { symbol: "TATAPOWER", name: "Tata Power", industry: "Power" },
  { symbol: "ETERNAL", name: "Eternal", industry: "Internet" },
];

// Prefetched by `npm run refresh` so the research demo never depends on a live fetch.
export const RESEARCH_DEMO = SUGGESTIONS.map((c) => c.symbol);

const KNOWN: Company[] = [...PORTFOLIO, ...SUGGESTIONS];

// Ranked: symbol prefix, then a word in the name starting with the query, then anywhere in the name.
export function searchCompanies(query: string, limit = 6): Company[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const rank = (c: Company) => {
    const sym = c.symbol.toLowerCase();
    const name = c.name.toLowerCase();
    if (sym.startsWith(q)) return 0;
    if (name.split(/[\s()&-]+/).some((w) => w.startsWith(q))) return 1;
    if (name.includes(q) || sym.includes(q)) return 2;
    return -1;
  };
  return KNOWN.map((c, i) => ({ c, r: rank(c), i }))
    .filter((x) => x.r >= 0)
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .slice(0, limit)
    .map((x) => x.c);
}

export function findCompany(symbol: string): Company | undefined {
  const s = symbol.trim().toUpperCase();
  return PORTFOLIO.find((c) => c.symbol === s) ?? SUGGESTIONS.find((c) => c.symbol === s);
}

export function isHeld(symbol: string): boolean {
  const s = symbol.trim().toUpperCase();
  return PORTFOLIO.some((c) => c.symbol === s);
}
