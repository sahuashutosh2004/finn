// Parser + fetcher for screener.in company pages. Built against tests/fixtures/screener-*.html.
// Shared by scripts/refresh.ts and server code; keep imports relative and free of Next APIs.
import * as cheerio from "cheerio";
import { BROWSER_UA } from "./http";

const BASE = "https://www.screener.in";

export type QuarterPeriod = { key: string | null; label: string }; // key = quarter-end date, e.g. 2026-09-30

export type QuarterRow = {
  name: string; // exactly as Screener labels it, minus the "+" expand marker
  values: (number | null)[]; // aligned with periods
  percent: boolean;
};

export type FinTable = {
  basis: "Consolidated" | "Standalone" | null;
  unit: string | null; // e.g. "Rs. Crores"
  periods: QuarterPeriod[]; // annual tables end in a "TTM" column (key "TTM") where Screener shows one
  rows: QuarterRow[];
};

export type Quarters = FinTable & { rawPdfs: (string | null)[] };

export type TopRatio = { name: string; value: number | null; raw: string }; // raw = Screener's text, e.g. "₹ 1,19,121 Cr."
export type GrowthRange = { name: string; items: { label: string; value: number | null }[] }; // "Compounded Sales Growth"

export type Announcement = {
  date: string | null; // YYYY-MM-DD in IST
  dateInferred: boolean; // true when the year was inferred from a day-month label
  title: string;
  summary: string | null; // Screener's short text, verbatim
  url: string | null;
};

export type Concall = { period: string; transcript: string | null; ppt: string | null; recording: string | null };
export type DocLink = { label: string; url: string };

export type ScreenerData = {
  ok: true;
  symbol: string;
  url: string;
  fetchedAt: string;
  companyName: string | null;
  about: string | null;
  bseCode: string | null;
  topRatios: TopRatio[];
  quarters: Quarters | null;
  profitLoss: FinTable | null;
  balanceSheet: FinTable | null;
  cashFlow: FinTable | null;
  ratios: FinTable | null;
  growth: GrowthRange[];
  announcements: Announcement[];
  concalls: Concall[];
  annualReports: DocLink[];
};

export type ScreenerError = { ok: false; symbol: string; error: string; tried: string[] };
export type ScreenerResult = ScreenerData | ScreenerError;

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

function absolute(href: string | undefined): string | null {
  if (!href) return null;
  try {
    return new URL(href, BASE).toString();
  } catch {
    return null;
  }
}

/** Parses a Screener table cell. Returns null for anything that isn't a plain number. */
export function parseNumber(text: string): number | null {
  const t = text.replace(/,/g, "").replace(/%$/, "").trim();
  if (!/^[+-]?\d+(\.\d+)?$/.test(t)) return null;
  return Number(t);
}

function istDay(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

/**
 * Screener shows "6 Nov" for recent items. The year is the latest one that doesn't put
 * the date in the future relative to when the page was fetched (1 day of slack for time zones).
 */
export function inferYear(day: number, monthIndex: number, ref: Date): number {
  const y = Number(istDay(ref).slice(0, 4));
  const candidate = Date.UTC(y, monthIndex, day);
  return candidate > ref.getTime() + 86_400_000 ? y - 1 : y;
}

export function parseDayLabel(text: string, ref: Date): { date: string; inferred: boolean } | null {
  const m = clean(text).match(/^(\d{1,2})\s+([A-Za-z]{3})[a-z]*\.?(?:,?\s+(\d{4}))?$/);
  if (!m) return null;
  const day = Number(m[1]);
  const month = MONTHS.indexOf(m[2].toLowerCase());
  if (month < 0 || day < 1 || day > 31) return null;
  const year = m[3] ? Number(m[3]) : inferYear(day, month, ref);
  const iso = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return { date: iso, inferred: !m[3] };
}

function parseTable($: cheerio.CheerioAPI, sectionId: string): (FinTable & { rawPdfs: (string | null)[] }) | null {
  const section = $(`section#${sectionId}`);
  const table = section.find("table.data-table").first();
  if (!table.length) return null;

  const periods: QuarterPeriod[] = table
    .find("thead th")
    .slice(1)
    .map((_, th) => ({ key: $(th).attr("data-date-key") ?? null, label: clean($(th).text()) }))
    .get();

  const rows: QuarterRow[] = [];
  let rawPdfs: (string | null)[] = periods.map(() => null);

  table.find("tbody tr").each((_, tr) => {
    const cells = $(tr).find("td");
    const head = cells.first().clone();
    head.find(".has-tooltip, .tooltip").remove();
    const name = clean(head.text()).replace(/\s*\+$/, "");
    if (!name) return;
    const valueCells = cells.slice(1);
    if (name === "Raw PDF") {
      rawPdfs = valueCells.map((_, td) => absolute($(td).find("a").attr("href"))).get();
      return;
    }
    const texts = valueCells.map((_, td) => clean($(td).text())).get();
    rows.push({
      name,
      values: texts.map(parseNumber),
      percent: texts.some((t) => t.endsWith("%")),
    });
  });

  if (periods.length === 0 || rows.length === 0) return null;

  const sub = clean(section.find("p.sub").first().text());
  const basis = /^Consolidated/i.test(sub) ? "Consolidated" : /^Standalone/i.test(sub) ? "Standalone" : null;
  const unit = sub.match(/Figures in ([^/]+?)(?:\s*\/|$)/)?.[1]?.trim() ?? null;

  return { basis, unit, periods, rows, rawPdfs };
}

function finTable($: cheerio.CheerioAPI, sectionId: string): FinTable | null {
  const t = parseTable($, sectionId);
  if (!t) return null;
  const { rawPdfs: _unused, ...rest } = t;
  void _unused;
  return rest;
}

function parseTopRatios($: cheerio.CheerioAPI): TopRatio[] {
  return $("#top-ratios > li")
    .map((_, li) => {
      const name = clean($(li).find(".name").text());
      const raw = clean($(li).find(".value").text());
      const numbers = $(li).find(".value .number").map((_, n) => clean($(n).text())).get();
      // "High / Low" has two numbers; a single value is only taken when there's exactly one.
      return { name, raw, value: numbers.length === 1 ? parseNumber(numbers[0]) : null };
    })
    .get()
    .filter((r) => r.name);
}

function parseGrowth($: cheerio.CheerioAPI): GrowthRange[] {
  return $("section#profit-loss table.ranges-table")
    .map((_, t) => {
      const name = clean($(t).find("th").first().text());
      const items = $(t)
        .find("tr")
        .slice(1)
        .map((_, tr) => {
          const tds = $(tr).find("td");
          return { label: clean(tds.eq(0).text()).replace(/:$/, ""), value: parseNumber(clean(tds.eq(1).text())) };
        })
        .get();
      return { name, items };
    })
    .get()
    .filter((g) => g.name);
}

function parseBseCode($: cheerio.CheerioAPI): string | null {
  const href = $('a[href*="bseindia.com/stock-share-price/"]').first().attr("href") ?? "";
  const fromLink = href.match(/\/(\d{6})\/?$/)?.[1];
  if (fromLink) return fromLink;
  const label = $("a, span")
    .filter((_, el) => /^BSE:\s*\d{6}$/.test(clean($(el).text())))
    .first();
  return clean(label.text()).match(/\d{6}/)?.[0] ?? null;
}

function parseAnnouncements($: cheerio.CheerioAPI, ref: Date): Announcement[] {
  const out: Announcement[] = [];
  $("#company-announcements-tab ul.list-links > li").each((_, li) => {
    const a = $(li).find("a").first();
    const meta = a.find(".ink-600").first();
    const title = clean(a.clone().children(".ink-600").remove().end().text());
    if (!title) return;

    const time = meta.find("time").first();
    const timeText = clean(time.text());
    const metaText = clean(meta.text());
    let summary: string | null = null;
    if (metaText.startsWith(timeText)) {
      summary = metaText.slice(timeText.length).replace(/^\s*-\s*/, "").trim() || null;
    }

    let date: string | null = null;
    let dateInferred = false;
    const dt = time.attr("datetime");
    const parsed = dt ? new Date(dt) : null;
    if (parsed && !Number.isNaN(parsed.getTime())) {
      date = istDay(parsed);
    } else {
      const label = parseDayLabel(timeText || metaText.split(" - ")[0] || "", ref);
      if (label) {
        date = label.date;
        dateInferred = label.inferred;
      }
    }

    out.push({ date, dateInferred, title, summary, url: absolute(a.attr("href")) });
  });
  return out;
}

function parseConcalls($: cheerio.CheerioAPI): Concall[] {
  return $(".documents.concalls ul.list-links > li")
    .map((_, li) => {
      const chip = (label: string) => {
        const a = $(li)
          .find("a.button-chip")
          .filter((_, el) => clean($(el).text()) === label)
          .first();
        return absolute(a.attr("href"));
      };
      return {
        period: clean($(li).children("div").first().text()),
        transcript: chip("Transcript"),
        ppt: chip("PPT"),
        recording: chip("REC"),
      };
    })
    .get()
    .filter((c) => c.period);
}

function parseAnnualReports($: cheerio.CheerioAPI): DocLink[] {
  const seen = new Set<string>();
  const out: DocLink[] = [];
  $(".documents.annual-reports ul.list-links > li").each((_, li) => {
    const a = $(li).find("a").first();
    const url = absolute(a.attr("href"));
    const label = clean(a.text());
    if (!url || !label || seen.has(url)) return;
    seen.add(url);
    out.push({ label, url });
  });
  return out;
}

function parseAbout($: cheerio.CheerioAPI): string | null {
  const el = $(".company-profile .about, .sub.show-more-box.about").first().clone();
  if (!el.length) return null;
  el.find("sup").remove();
  el.find("br").replaceWith("\n");
  const text = el
    .text()
    .split("\n")
    .map(clean)
    .filter(Boolean)
    .join("\n");
  return text || null;
}

export function parseScreener(
  html: string,
  opts: { symbol: string; url: string; fetchedAt: Date },
): ScreenerData {
  const $ = cheerio.load(html);
  return {
    ok: true,
    symbol: opts.symbol,
    url: opts.url,
    fetchedAt: opts.fetchedAt.toISOString(),
    companyName: clean($("h1").first().text()) || null,
    about: parseAbout($),
    bseCode: parseBseCode($),
    topRatios: parseTopRatios($),
    quarters: parseTable($, "quarters"),
    profitLoss: finTable($, "profit-loss"),
    balanceSheet: finTable($, "balance-sheet"),
    cashFlow: finTable($, "cash-flow"),
    ratios: finTable($, "ratios"),
    growth: parseGrowth($),
    announcements: parseAnnouncements($, opts.fetchedAt),
    concalls: parseConcalls($),
    annualReports: parseAnnualReports($),
  };
}

const HEADERS = { "User-Agent": BROWSER_UA, Accept: "text/html" };

async function getPage(url: string): Promise<{ status: number; html: string }> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { headers: HEADERS, redirect: "follow" });
    if (res.status === 429 && attempt === 0) {
      await new Promise((r) => setTimeout(r, 10_000));
      continue;
    }
    return { status: res.status, html: await res.text() };
  }
}

export async function fetchScreener(symbol: string): Promise<ScreenerResult> {
  const slug = encodeURIComponent(symbol);
  const urls = [`${BASE}/company/${slug}/consolidated/`, `${BASE}/company/${slug}/`];
  const tried: string[] = [];
  const problems: string[] = [];

  for (const url of urls) {
    if (tried.length > 0) await new Promise((r) => setTimeout(r, 1500));
    tried.push(url);
    try {
      const { status, html } = await getPage(url);
      if (status !== 200) {
        problems.push(`${url} → HTTP ${status}`);
        continue;
      }
      const data = parseScreener(html, { symbol, url, fetchedAt: new Date() });
      if (!data.quarters) {
        problems.push(`${url} → no quarterly table`);
        continue;
      }
      return data;
    } catch (e) {
      problems.push(`${url} → ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { ok: false, symbol, error: problems.join("; "), tried };
}
