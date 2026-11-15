import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { StockData } from "../lib/market";
import { calcReceipt, cellReceipt, priceReceipts, resultsReceipts, screenerRaw } from "../lib/receipts";
import { buildResults } from "../lib/results";
import { parseScreener } from "../lib/screener";

const sd = parseScreener(readFileSync(path.join(__dirname, "fixtures", "screener-POLYCAB.html"), "utf8"), {
  symbol: "POLYCAB",
  url: "https://www.screener.in/company/POLYCAB/consolidated/",
  fetchedAt: new Date("2026-11-15T16:00:00+05:30"),
});
assert.ok(sd.ok && sd.quarters && sd.balanceSheet);

test("screenerRaw reproduces Screener's cell text", () => {
  assert.equal(screenerRaw(119121), "1,19,121");
  assert.equal(screenerRaw(14, true), "14%");
  assert.equal(screenerRaw(-5565), "-5,565");
  assert.equal(screenerRaw(null), null);
});

test("cellReceipt points at the table, row and column", () => {
  const bs = sd.balanceSheet!;
  const col = bs.periods.length - 1;
  const r = cellReceipt(sd, "balanceSheet", bs, "Borrowings", col);
  assert.deepEqual(r, {
    label: "Borrowings · Sep 2026",
    value: "272 Cr",
    raw: "272",
    source: "Screener",
    where: "Balance Sheet (Consolidated) · row “Borrowings” · column “Sep 2026”",
    url: "https://www.screener.in/company/POLYCAB/consolidated/#balance-sheet",
    fetchedAt: "2026-11-15T10:30:00.000Z",
  });
  assert.equal(cellReceipt(sd, "balanceSheet", bs, "No such row", col), null);
});

test("resultsReceipts: the cell, and the QoQ/YoY arithmetic with its inputs", () => {
  const view = buildResults(sd.quarters!, { url: sd.url, fetchedAt: sd.fetchedAt });
  const rs = resultsReceipts(view);
  const i = view.lines.findIndex((l) => l.source === "Sales");
  const { current, qoq, yoy } = rs[i];
  assert.equal(current?.raw, "9,899");
  assert.equal(current?.where, "Quarterly Results (Consolidated) · row “Sales” · column “Sep 2026”");
  assert.equal(current?.url, "https://www.screener.in/company/POLYCAB/consolidated/#quarters");
  assert.equal(qoq?.formula, "(9,899 − 8,210) ÷ 8,210");
  assert.equal(qoq?.value, "+20.6%");
  assert.equal(yoy?.formula, "(9,899 − 6,477) ÷ 6,477");
  assert.equal(yoy?.value, "+52.8%");
  assert.deepEqual(yoy?.inputs?.map((x) => x.label), ["Sales · Sep 2026", "Sales · Sep 2025"]);
});

test("calcReceipt keeps the formula and drops missing inputs", () => {
  const r = calcReceipt("Debt to equity", "0.02x", "a ÷ b", [null]);
  assert.deepEqual([r.source, r.formula, r.inputs], ["FINN calculation", "a ÷ b", []]);
});

test("priceReceipts: Yahoo close with the Screener cross-check and the day-change formula", () => {
  const s = {
    ok: true,
    symbol: "POLYCAB",
    yahooSymbol: "POLYCAB.NS",
    name: "Polycab",
    currency: "INR",
    history: [],
    lastDate: "2026-11-13",
    lastClose: 7904,
    prevClose: 8080,
    dayChange: -176,
    dayChangePct: -2.18,
    lastVolume: 500000,
    avgVolume20: 400000,
    volumeRatio: 1.25,
    high52w: 10129,
    low52w: 6660,
    droppedPartialBar: false,
  } satisfies StockData;
  const r = priceReceipts(s, "2026-11-15T18:20:00.000Z", { screener: 7904, diffPct: 0, flagged: false });
  assert.equal(r.close.source, "Yahoo Finance");
  assert.equal(r.close.raw, "7904");
  assert.match(r.close.note ?? "", /^Cross-check: Screener shows ₹7,904 \(0% off\)\.$/);
  assert.equal(r.change?.formula, "(close − previous close) ÷ previous close = (7904 − 8080) ÷ 8080");
  assert.equal(r.change?.inputs?.length, 2);
  assert.equal(r.volumeRatio?.formula, "Last volume ÷ 20-day average = 500000 ÷ 400000");
  const flagged = priceReceipts(s, "2026-11-15T18:20:00.000Z", { screener: 8100, diffPct: 2.4, flagged: true });
  assert.match(flagged.close.note ?? "", /more than 1% apart/);
});
