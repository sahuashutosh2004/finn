"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Clock, Search, X } from "lucide-react";
import ListRow from "@/components/ui/ListRow";
import Section from "@/components/ui/Section";
import Tag from "@/components/ui/Tag";
import { SUGGESTIONS, findCompany, isHeld, searchCompanies } from "@/data/portfolio";
import { addRecentSearch, clearRecentSearches, useRecentSearches } from "@/lib/recentSearches";
import { companyHref, isValidSymbol, normalizeSymbol } from "@/lib/symbol";

export default function CompanySearch({ autoFocus = false }: { autoFocus?: boolean }) {
  const router = useRouter();
  const recent = useRecentSearches();
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  const typed = normalizeSymbol(query);
  const matches = searchCompanies(query);
  const exact = matches.find((c) => c.symbol === typed);
  const showRawOption = typed !== "" && !exact && isValidSymbol(typed);

  function open(symbol: string) {
    addRecentSearch(symbol);
    router.push(companyHref(symbol));
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!typed) return;
    const target = exact?.symbol ?? matches[0]?.symbol ?? (isValidSymbol(typed) ? typed : null);
    if (!target) {
      setError("Enter an NSE symbol, like RELIANCE or HAL.");
      return;
    }
    open(target);
  }

  return (
    <>
      <form onSubmit={onSubmit} role="search">
        <label htmlFor="company-search" className="sr-only">
          Search by NSE symbol or company name
        </label>
        <div className="flex h-10 items-center gap-2 rounded-[10px] bg-fill px-2.5">
          <Search size={17} className="shrink-0 text-muted" aria-hidden />
          <input
            id="company-search"
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setError(null);
            }}
            placeholder="Symbol or company name"
            autoCapitalize="characters"
            autoCorrect="off"
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="search"
            autoFocus={autoFocus}
            className="min-w-0 flex-1 bg-transparent text-[16px] text-fg outline-none placeholder:text-muted [&::-webkit-search-cancel-button]:hidden"
          />
          {query ? (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setQuery("")}
              className="-mr-1 flex size-8 items-center justify-center text-muted"
            >
              <X size={16} aria-hidden />
            </button>
          ) : null}
        </div>
        {error ? <p className="mt-2 text-[13px] text-down">{error}</p> : null}
      </form>

      {typed ? (
        <Section title="Results">
          {matches.map((c) => (
            <ListRow
              key={c.symbol}
              onClick={() => open(c.symbol)}
              title={c.symbol}
              subtitle={c.name}
              value={isHeld(c.symbol) ? <Tag tone="accent">Held</Tag> : undefined}
              chevron
            />
          ))}
          {showRawOption ? (
            <ListRow
              onClick={() => open(typed)}
              title={typed}
              subtitle="Open as NSE symbol"
              chevron
            />
          ) : null}
          {matches.length === 0 && !showRawOption ? (
            <p className="py-3 text-[13px] text-muted">That doesn&apos;t look like an NSE symbol.</p>
          ) : null}
        </Section>
      ) : (
        <>
          {recent.length > 0 ? (
            <Section
              title="Recent"
              aside={
                <button type="button" onClick={clearRecentSearches} className="text-accent">
                  Clear
                </button>
              }
            >
              {recent.map((symbol) => (
                <ListRow
                  key={symbol}
                  onClick={() => open(symbol)}
                  leading={<Clock size={16} aria-hidden />}
                  title={symbol}
                  subtitle={findCompany(symbol)?.name}
                  chevron
                />
              ))}
            </Section>
          ) : null}

          <Section title="Suggestions">
            {SUGGESTIONS.map((c) => (
              <ListRow
                key={c.symbol}
                onClick={() => open(c.symbol)}
                title={c.symbol}
                subtitle={c.name}
                chevron
              />
            ))}
          </Section>
        </>
      )}
    </>
  );
}
