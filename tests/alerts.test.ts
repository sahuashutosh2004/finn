import assert from "node:assert/strict";
import { test } from "node:test";
import { buildAlerts, type AlertInput } from "../lib/alerts";
import { dayDiff, inWindow, rankFilings, type Filing } from "../lib/filings";
import { DEFAULT_SETTINGS, sanitize } from "../lib/settings";

const f = (id: string, symbol: string, date: string | null, category: Filing["category"]): Filing => ({
  id,
  symbol,
  date,
  title: id,
  summary: null,
  summarySource: null,
  url: null,
  category,
  source: "BSE",
});

test("dayDiff and windows count calendar days back from the refresh date", () => {
  assert.equal(dayDiff("2026-11-13", "2026-11-15"), 2);
  assert.equal(dayDiff("2026-02-28", "2026-03-01"), 1);
  assert.ok(inWindow({ date: "2026-11-14" }, "2026-11-15", 1));
  assert.ok(!inWindow({ date: "2026-11-13" }, "2026-11-15", 1));
  assert.ok(inWindow({ date: "2026-11-08" }, "2026-11-15", 7));
  assert.ok(!inWindow({ date: "2026-11-07" }, "2026-11-15", 7));
  assert.ok(!inWindow({ date: null }, "2026-11-15", 30));
  assert.ok(!inWindow({ date: "2026-11-16" }, "2026-11-15", 30));
});

test("rankFilings orders by tier and boosts movers by one tier, never routine", () => {
  const filings = [
    f("a", "AAA", "2026-11-10", "dividend"), // tier 3
    f("b", "BBB", "2026-11-12", "capex"), // tier 2, BBB moved -> tier 1
    f("c", "CCC", "2026-11-09", "results"), // tier 1
    f("d", "BBB", "2026-11-12", "agm_egm"), // routine stays routine
    f("e", "AAA", "2026-11-13", "fund_raise"), // tier 2
  ];
  const movers = { BBB: { pct: -3.2, ratio: 1.1 }, AAA: { pct: 1, ratio: 1.9 } };
  const { tiers, routine } = rankFilings(filings, movers, { priceMovePct: 3, volumeX: 2 });
  assert.deepEqual(
    tiers.map((t) => t.items.map((x) => x.id)),
    [["b", "c"], ["e"], ["a"]],
  );
  assert.deepEqual(routine.map((x) => x.id), ["d"]);
  assert.equal(tiers[0].items[0].boosted, true);

  const vol = rankFilings(filings, movers, { priceMovePct: 3, volumeX: 1.5 });
  assert.deepEqual(vol.tiers[0].items.map((x) => x.id).sort(), ["b", "c", "e"]);
  assert.deepEqual(vol.tiers[1].items.map((x) => x.id), ["a"]);
});

test("sanitize clamps bad stored settings and fills missing categories", () => {
  const s = sanitize({ priceMovePct: 99, volumeX: "x", categories: { results: false, agm_egm: "yes" } });
  assert.equal(s.priceMovePct, 20);
  assert.equal(s.volumeX, DEFAULT_SETTINGS.volumeX);
  assert.equal(s.categories.results, false);
  assert.equal(s.categories.agm_egm, DEFAULT_SETTINGS.categories.agm_egm);
  assert.deepEqual(sanitize(null), DEFAULT_SETTINGS);
  assert.equal(DEFAULT_SETTINGS.priceMovePct, 3);
  assert.equal(DEFAULT_SETTINGS.volumeX, 2);
  assert.equal(DEFAULT_SETTINGS.categories.results, true);
  assert.equal(DEFAULT_SETTINGS.categories.pledging, true);
  assert.equal(DEFAULT_SETTINGS.categories.dividend, false);
  assert.equal(DEFAULT_SETTINGS.categories.unclassified, false);
});

test("buildAlerts applies thresholds (inclusive), enabled categories and the 7-day window", () => {
  const input: AlertInput = {
    refDate: "2026-11-15",
    stocks: [
      { symbol: "UP", lastDate: "2026-11-13", dayChangePct: 3, volumeRatio: 1 },
      { symbol: "DOWN", lastDate: "2026-11-13", dayChangePct: -4.1, volumeRatio: 2.5 },
      { symbol: "CALM", lastDate: "2026-11-13", dayChangePct: 2.99, volumeRatio: 1.99 },
      { symbol: "NULL", lastDate: "2026-11-13", dayChangePct: null, volumeRatio: null },
    ],
    filings: [
      { id: "r", symbol: "UP", date: "2026-11-10", category: "results" },
      { id: "old", symbol: "UP", date: "2026-11-01", category: "results" },
      { id: "div", symbol: "UP", date: "2026-11-12", category: "dividend" },
      { id: "nodate", symbol: "UP", date: null, category: "results" },
    ],
  };
  const keys = buildAlerts(input, DEFAULT_SETTINGS).map((a) => a.key).sort();
  assert.deepEqual(keys, ["p-DOWN-2026-11-13", "p-UP-2026-11-13", "r", "v-DOWN-2026-11-13"]);

  const custom = { ...DEFAULT_SETTINGS, priceMovePct: 5, categories: { ...DEFAULT_SETTINGS.categories, dividend: true, results: false } };
  assert.deepEqual(buildAlerts(input, custom).map((a) => a.key).sort(), ["div", "v-DOWN-2026-11-13"]);
});
