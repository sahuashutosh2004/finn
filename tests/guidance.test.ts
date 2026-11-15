import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { callFiscalYear, check, delivered, fiscalYearEnd, guidanceExcerpt, scopeIssue, verifyItems, type GuidanceItem } from "../lib/guidance";
import { parseScreener } from "../lib/screener";

const fixture = (name: string) => readFileSync(path.join(__dirname, "fixtures", name), "utf8");
const transcript = fixture("pdf-POLYCAB-transcript.txt");
const sd = parseScreener(fixture("screener-POLYCAB.html"), { symbol: "POLYCAB", url: "https://www.screener.in/company/POLYCAB/consolidated/", fetchedAt: new Date("2026-11-15T16:00:00+05:30") });
assert.ok(sd.ok && sd.quarters);
const q = sd.quarters;

const REAL = "we remain confident of sustaining medium- to long-term EBITDA margins within our guided range of 11% to 13%.";
const margin: GuidanceItem = { topic: "margin", metric: "ebitda_margin", quote: REAL, low: 11, high: 13, unit: "%", period: "FY27" };

test("the excerpt keeps guidance sentences and is much shorter than the transcript", () => {
  const ex = guidanceExcerpt(transcript);
  assert.ok(ex.length < transcript.length / 4);
  assert.match(ex.replace(/\s+/g, " "), /guided range of 11% to 13%/);
  assert.doesNotMatch(ex, /forward[- ]looking statements?/i);
});

test("fiscalYearEnd", () => {
  assert.equal(fiscalYearEnd("FY27"), 2027);
  assert.equal(fiscalYearEnd("FY 2028"), 2028);
  assert.equal(fiscalYearEnd("medium term"), null);
});

test("verifyItems keeps real quotes and rejects invented quotes and numbers", () => {
  const { items, rejected } = verifyItems(
    {
      items: [
        margin,
        { ...margin, quote: "We are guiding for EBITDA margins of 15% to 17% in FY27 on the back of FMEG." },
        { ...margin, low: 12, high: 14 },
        { ...margin },
      ],
    },
    transcript,
  );
  assert.equal(items.length, 1, "the duplicate is dropped");
  assert.equal(items[0].quote, REAL);
  assert.equal(rejected.length, 2);
  assert.match(rejected[0].reason, /^not in source/);
  assert.equal(rejected[1].reason, "target 12, 14 isn't written in the quote");
});

test("margin guidance is checked against Screener's quarters", () => {
  const r = delivered(margin, q);
  assert.equal(r.verdict, "on_track");
  assert.equal(r.delivered?.actual, 14.1);
  assert.equal(r.delivered?.actualLabel, "FY27 so far (2 quarters)");
  assert.deepEqual(r.delivered?.quarters.map((x) => [x.label, x.value]), [
    ["Dec 2025", 12.7],
    ["Mar 2026", 13.1],
    ["Jun 2026", 13.8],
    ["Sep 2026", 14.4],
  ]);
});

test("verdicts: missed, too early, can't check", () => {
  assert.equal(delivered({ ...margin, period: null, low: 15, high: 16 }, q).verdict, "missed");
  const early = delivered({ ...margin, period: "FY28" }, q);
  assert.equal(early.verdict, "too_early");
  assert.equal(early.note, "No quarter of FY28 reported yet.");
  assert.equal(delivered({ ...margin, topic: "capex", metric: "capex", unit: "cr", low: 1600, high: null }, q).verdict, "cant_check");
  assert.equal(delivered({ ...margin, low: null, high: null }, q).verdict, "cant_check");
});

test("growth guidance uses the same quarters a year earlier", () => {
  const r = delivered({ ...margin, topic: "growth", metric: "revenue_growth", low: 20, high: 25 }, q);
  assert.equal(r.delivered?.actual, 46.2);
  assert.equal(r.verdict, "on_track");
});

test("analyst questions and segment or constant-currency targets aren't scored", () => {
  const { rejected } = verifyItems({ items: [{ ...margin, quote: `${REAL.slice(0, -1)}?` }] }, `${transcript} ${REAL.slice(0, -1)}?`);
  assert.equal(rejected[0].reason, "a question from the call, not management guidance");
  assert.match(scopeIssue("revenue_growth", "our revenue growth guidance is 1% to 2% YoY in constant currency terms.")!, /constant currency/);
  assert.match(scopeIssue("ebitda_margin", "we continue to target the margin of around 7.8% for FY '27 with respect to the PPM portfolio.")!, /EBITDA/);
  assert.match(scopeIssue("revenue_growth", "I'm not changing the longer-term growth guidance of 23% to 25%.")!, /revenue/);
  assert.equal(scopeIssue("ebitda_margin", REAL), null);
});

test("quarter targets wait for that quarter; 'this year' means the call's fiscal year", () => {
  assert.equal(callFiscalYear("Nov 2026"), 2027);
  assert.equal(callFiscalYear("Feb 2026"), 2026);
  const q4 = delivered({ ...margin, period: "Q4", low: 13, high: null }, q, 2027);
  assert.equal(q4.verdict, "too_early");
  assert.equal(q4.note, "The target is for Q4 FY27, which isn't reported yet.");
  const behind = delivered({ ...margin, period: null, quote: "For the current year we expect EBITDA margin of 15%.", low: 15, high: null }, q, 2027);
  assert.equal(behind.verdict, "too_early");
  assert.match(behind.note!, /^Behind so far: 14.1% against 15%/);
});

test("check counts only items that can be judged", () => {
  const res = check(
    [margin, { ...margin, period: null, low: 15, high: 16 }, { ...margin, period: "FY28" }, { ...margin, topic: "capex", metric: "capex", unit: "cr", low: 1600, high: null }],
    q,
  );
  assert.deepEqual([res.hit, res.of], [1, 2]);
});
