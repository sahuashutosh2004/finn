import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { balanceView, bullBear, growthLines, isBank, quarterBars, snapshotMetrics } from "../lib/research";
import { parseScreener, type ScreenerData } from "../lib/screener";

const fixture = (name: string) => readFileSync(path.join(__dirname, "fixtures", name), "utf8");
const FETCHED = new Date("2026-11-15T16:00:00+05:30");
const load = (symbol: string): ScreenerData => {
  const r = parseScreener(fixture(`screener-${symbol}.html`), { symbol, url: `https://www.screener.in/company/${symbol}/consolidated/`, fetchedAt: FETCHED });
  assert.ok(r.ok);
  return r;
};
const polycab = load("POLYCAB");
const hdfc = load("HDFCBANK");

test("Screener extras: BSE code, top ratios, annual tables and growth ranges", () => {
  assert.equal(polycab.bseCode, "542652");
  assert.equal(hdfc.bseCode, "500180");
  const r = (n: string) => polycab.topRatios.find((t) => t.name === n);
  assert.deepEqual([r("Market Cap")?.value, r("Market Cap")?.raw], [119121, "₹ 1,19,121 Cr."]);
  assert.equal(r("Stock P/E")?.value, 37.7);
  assert.equal(r("ROCE")?.value, 33.2);
  assert.equal(r("ROE")?.value, 23.6);
  assert.equal(r("High / Low")?.value, null, "two numbers shown, so no single value is taken");

  assert.deepEqual(polycab.profitLoss?.periods.at(-1), { key: "TTM", label: "TTM" });
  assert.equal(polycab.balanceSheet?.periods.at(-1)?.label, "Sep 2026");
  assert.equal(polycab.cashFlow?.periods.at(-1)?.label, "Mar 2026");
  assert.ok(polycab.ratios?.rows.some((x) => x.name === "Working Capital Days"));
  assert.ok(!polycab.ratios?.rows.some((x) => /\+$|\u00a0/.test(x.name)), "tooltip markers stripped from row names");

  const sales = polycab.growth.find((g) => g.name === "Compounded Sales Growth")!;
  assert.deepEqual(sales.items, [
    { label: "10 Years", value: 19 },
    { label: "5 Years", value: 27 },
    { label: "3 Years", value: 27 },
    { label: "TTM", value: 41 },
  ]);
});

test("snapshot metrics carry the raw Screener text in their receipt", () => {
  const m = snapshotMetrics(polycab);
  assert.deepEqual(
    m.map((x) => [x.label, x.display, x.receipt?.raw]),
    [
      ["Market cap", "₹1,19,121 Cr", "₹ 1,19,121 Cr."],
      ["P/E", "37.7", "37.7"],
      ["ROE", "23.6%", "23.6 %"],
      ["ROCE", "33.2%", "33.2 %"],
    ],
  );
  assert.equal(m[0].receipt?.url, "https://www.screener.in/company/POLYCAB/consolidated/#top-ratios");
});

test("trajectory: growth lines and the last 8 quarters", () => {
  const g = growthLines(polycab);
  assert.deepEqual(
    g.map((l) => [l.label, l.items.map((i) => `${i.label}=${i.display}`).join(" ")]),
    [
      ["Sales", "10Y=19% 5Y=27% 3Y=27% TTM=41%"],
      ["Profit", "10Y=30% 5Y=24% 3Y=29% TTM=28%"],
    ],
  );
  const bars = quarterBars(polycab, 8);
  assert.equal(bars[0].name, "Sales");
  assert.equal(bars[0].bars.length, 8);
  assert.deepEqual(bars[0].bars.at(-1)?.value, 9899);
  assert.equal(bars[1].bars.at(-1)?.value, 990);
  assert.equal(bars[1].bars.at(-1)?.receipt?.where, "Quarterly Results (Consolidated) · row “Net Profit” · column “Sep 2026”");
});

test("balance sheet & cash for a manufacturer", () => {
  const bv = balanceView(polycab);
  assert.deepEqual(
    bv.rows.map((r) => [r.label, r.display]),
    [
      ["Borrowings", "₹272 Cr"],
      ["Debt to equity", "0.02x"],
    ],
  );
  assert.deepEqual(
    bv.cash.map((c) => [c.label, c.cfo, c.profit, c.pct]),
    [
      ["Mar 2022", 512, 917, 56],
      ["Mar 2023", 1428, 1282, 111],
      ["Mar 2024", 1296, 1803, 72],
      ["Mar 2025", 1809, 2046, 88],
      ["Mar 2026", 3811, 2708, 141],
    ],
  );
  // (512+1428+1296+1809+3811) / (917+1282+1803+2046+2708) = 8856 / 8756
  assert.equal(bv.cash5y?.display, "101%");
  assert.deepEqual(
    bv.days.map((d) => [d.label, d.display, d.sub]),
    [
      ["Debtor Days", "48", "Mar 2026 · 32 in Mar 2023"],
      ["Working Capital Days", "30", "Mar 2026 · 58 in Mar 2023"],
    ],
  );
});

test("banks: deposits shown, debt to equity and cash conversion skipped with a note", () => {
  assert.equal(isBank(hdfc), true);
  assert.equal(isBank(polycab), false);
  const bv = balanceView(hdfc);
  assert.deepEqual(bv.rows.map((r) => r.label), ["Borrowing", "Deposits"]);
  assert.equal(bv.cash.length, 0);
  assert.equal(bv.cash5y, null);
  assert.equal(bv.notes.length, 1);
});

test("bull vs bear: each point has a receipt and at most 3 per side", () => {
  const { bull, bear } = bullBear(polycab);
  assert.deepEqual(bull.map((p) => p.text), [
    "Sales up 41% over the last 12 months.",
    "Returns on capital are high: ROCE 33.2%.",
    "Sales compounded 27% a year over 5 years.",
  ]);
  assert.deepEqual(bear.map((p) => p.text), ["Operating margin 14% in Sep 2026 vs 16% a year earlier."]);
  for (const p of [...bull, ...bear]) assert.ok(p.receipts.length > 0 && p.receipts.every((r) => r.source === "Screener" || r.source === "FINN calculation"));

  const bank = bullBear(hdfc);
  assert.deepEqual(bank.bull.map((p) => p.text), ["Revenue compounded 22% a year over 5 years."]);
  assert.ok(!bank.bull.concat(bank.bear).some((p) => /debt to equity|cash conversion|ROCE/i.test(p.text)));
});
