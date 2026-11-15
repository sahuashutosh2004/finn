const SYMBOL_PATTERN = /^[A-Z0-9&-]{1,20}$/;

export function normalizeSymbol(raw: string): string {
  return raw.trim().toUpperCase();
}

export function isValidSymbol(symbol: string): boolean {
  return SYMBOL_PATTERN.test(symbol);
}

export function companyHref(symbol: string): string {
  return `/company/${encodeURIComponent(normalizeSymbol(symbol))}`;
}
