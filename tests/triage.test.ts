import { test } from "node:test";
import assert from "node:assert/strict";
import type { BriefStock } from "../lib/brief";
import { summarize } from "../lib/brief";
import { briefTitle } from "../lib/briefTitle";
import type { Filing } from "../lib/filings";
import { moveId, topThree } from "../lib/triage";
import { MAX_WORDS, speechScript } from "../lib/voice";

const T = { priceMovePct: 3, volumeX: 2 };
const filing = (id: string, symbol: string, date: string, category: Filing["category"], summary = "Something happened at the company today."): Filing => ({
  id,
  symbol,
  date,
  title: summary,
  summary,
  summarySource: "BSE",
  url: null,
  category,
  source: "BSE",
});

test("briefTitle follows the IST clock", () => {
  assert.equal(briefTitle(new Date("2026-11-16T08:00:00+05:30")), "Morning brief");
  assert.equal(briefTitle(new Date("2026-11-16T09:15:00+05:30")), "Market live");
  assert.equal(briefTitle(new Date("2026-11-16T15:29:00+05:30")), "Market live");
  assert.equal(briefTitle(new Date("2026-11-16T15:30:00+05:30")), "Evening brief");
  assert.equal(briefTitle(new Date("2026-11-14T11:00:00+05:30")), "Weekend brief");
  assert.equal(briefTitle(new Date("2026-11-16T02:00:00Z")), "Morning brief", "07:30 IST even though it's 02:00 UTC");
});

test("topThree mixes material filings and big moves, one per stock", () => {
  const filings = [
    filing("a", "HDFCBANK", "2026-11-13", "management_change"),
    filing("b", "INFY", "2026-11-13", "press_release"),
    filing("c", "LT", "2026-11-12", "capex"),
    filing("d", "HDFCBANK", "2026-11-13", "results"),
  ];
  const movers = {
    POLICYBZR: { pct: 5.2, ratio: 3.1, date: "2026-11-13" },
    TCS: { pct: -1, ratio: 1, date: "2026-11-13" },
  };
  const top = topThree(filings, movers, T, "2026-11-13");
  assert.deepEqual(top.map((t) => `${t.kind}:${t.symbol}`), ["filing:HDFCBANK", "move:POLICYBZR", "filing:LT"]);
  assert.ok(!top.some((t) => t.symbol === "INFY"), "tier-3 press releases never pad the list");
  assert.ok(!top.some((t) => t.symbol === "TCS"), "small moves are not news");
});

test("topThree skips done items and can return fewer than 3", () => {
  const filings = [filing("a", "HDFCBANK", "2026-11-13", "management_change")];
  const movers = { POLICYBZR: { pct: 5.2, ratio: 3.1, date: "2026-11-13" } };
  const done = new Set(["a", moveId("POLICYBZR", "2026-11-13")]);
  assert.deepEqual(topThree(filings, movers, T, "2026-11-13", done), []);
  assert.equal(topThree(filings, {}, T, "2026-11-13").length, 1);
});

test("topThree falls back to 7 days when the last day had nothing", () => {
  const filings = [filing("a", "ITC", "2026-11-09", "results")];
  assert.equal(topThree(filings, {}, T, "2026-11-13")[0]?.symbol, "ITC");
  assert.equal(topThree(filings, {}, T, "2026-11-20").length, 0);
});

test("the spoken brief stays under 45 seconds", () => {
  const stock = (symbol: string, pct: number): BriefStock => ({
    symbol,
    name: `${symbol} Limited`,
    lastDate: "2026-11-13",
    lastClose: 100,
    dayChangePct: pct,
    volumeRatio: 1,
    closes30: [],
    receipts: { close: null, change: null, volumeRatio: null },
  } as unknown as BriefStock);
  const stocks = [stock("A", 5.23), stock("B", -2.18), stock("C", 0.3)];
  const long = "word ".repeat(80);
  const top = topThree(
    [filing("x", "A", "2026-11-13", "management_change", long), filing("y", "B", "2026-11-13", "results", long), filing("z", "C", "2026-11-13", "capex", long)],
    {},
    T,
    "2026-11-13",
  );
  const script = speechScript({ title: "Morning brief", dateLabel: "Mon, 16 Nov 2026", summary: summarize(stocks, T), total: 3, top, nameOf: (s) => `${s} Limited` });
  const words = script.split(/\s+/).length;
  assert.ok(words <= MAX_WORDS, `${words} words`);
  assert.match(script, /^Morning brief, Mon, 16 Nov 2026\. Of your 3 holdings, 2 rose and 1 fell\. A Limited gained 5\.2 percent\./);
  assert.match(script, /Top 3 for today\. One: A Limited, management\./);
});
