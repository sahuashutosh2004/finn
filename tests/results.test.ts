import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { buildResults, change, shiftQuarterEnd } from "../lib/results";
import { parseScreener, type Quarters } from "../lib/screener";

const load = (sym: string) =>
  parseScreener(readFileSync(path.join(__dirname, "fixtures", `screener-${sym}.html`), "utf8"), {
    symbol: sym,
    url: "u",
    fetchedAt: new Date("2026-11-15T16:00:00+05:30"),
  }).quarters!;

test("shiftQuarterEnd lands on real quarter-end dates", () => {
  assert.equal(shiftQuarterEnd("2026-09-30", 3), "2026-06-30");
  assert.equal(shiftQuarterEnd("2026-09-30", 12), "2025-09-30");
  assert.equal(shiftQuarterEnd("2026-03-31", 3), "2025-12-31");
  assert.equal(shiftQuarterEnd("2026-06-30", 3), "2026-03-31");
  assert.equal(shiftQuarterEnd("2025-12-31", 12), "2024-12-31");
});

test("change(): pct, pp, missing and not-meaningful", () => {
  assert.deepEqual(change(110, 100, false), { kind: "pct", value: 10 });
  assert.deepEqual(change(90, 100, false), { kind: "pct", value: -10 });
  assert.deepEqual(change(14, 13, true), { kind: "pp", value: 1 });
  assert.deepEqual(change(100, null, false), { kind: "missing" });
  assert.deepEqual(change(null, 100, false), { kind: "missing" });
  assert.deepEqual(change(50, 0, false), { kind: "nm" });
  assert.deepEqual(change(50, -20, false), { kind: "nm" });
});

test("POLYCAB Sep 2026: standard metrics, QoQ vs Jun 2026 and YoY vs Sep 2025", () => {
  const r = buildResults(load("POLYCAB"));
  assert.equal(r.format, "standard");
  assert.equal(r.latest.label, "Sep 2026");
  assert.equal(r.prevQuarter, "Jun 2026");
  assert.equal(r.yearAgoQuarter, "Sep 2025");
  const by = Object.fromEntries(r.lines.map((l) => [l.label, l]));
  assert.deepEqual(Object.keys(by), ["Revenue", "EBITDA", "PBT", "PAT"]);
  assert.equal(by.EBITDA.source, "Operating Profit");
  assert.ok(by.EBITDA.note);

  // Sales: Sep 2026 9,899; Jun 2026 8,210; Sep 2025 6,477 (from the fixture)
  const q = load("POLYCAB");
  const sales = q.rows.find((x) => x.name === "Sales")!;
  const iSep25 = q.periods.findIndex((p) => p.key === "2025-09-30");
  const sep25 = sales.values[iSep25]!;
  assert.equal(by.Revenue.current, 9899);
  assert.deepEqual(by.Revenue.qoq, { kind: "pct", value: Math.round(((9899 - 8210) / 8210) * 10000) / 100 });
  assert.deepEqual(by.Revenue.yoy, { kind: "pct", value: Math.round(((9899 - sep25) / sep25) * 10000) / 100 });
});

test("YoY agrees with Screener's own 'YoY Sales growth' row for every quarter it covers", () => {
  const q = load("POLYCAB");
  const sales = q.rows.find((x) => x.name === "Sales")!;
  const growth = q.rows.find((x) => x.name === "YoY Sales growth")!;
  let checked = 0;
  q.periods.forEach((p, i) => {
    const prev = q.periods.findIndex((x) => x.key === shiftQuarterEnd(p.key!, 12));
    if (prev < 0 || growth.values[i] === null) return;
    const c = change(sales.values[i], sales.values[prev], false);
    assert.equal(c.kind, "pct");
    if (c.kind === "pct") assert.equal(Math.round(c.value), growth.values[i], `${p.label}`);
    checked++;
  });
  assert.ok(checked >= 8, `checked ${checked} quarters`);
});

test("HDFCBANK: bank rows shown under Screener names, negative bases are n/m, % rows in pp", () => {
  const r = buildResults(load("HDFCBANK"));
  assert.equal(r.format, "screener-rows");
  const names = r.lines.map((l) => l.label);
  assert.ok(names.includes("Revenue") && names.includes("Financing Profit") && names.includes("Gross NPA %"));
  assert.ok(!names.some((n) => /^YoY/.test(n)), "Screener's helper growth row is skipped");
  const fp = r.lines.find((l) => l.label === "Financing Profit")!;
  assert.equal(fp.current, -5565);
  assert.deepEqual(fp.qoq, { kind: "nm" }, "base −15,342 is negative");
  const margin = r.lines.find((l) => l.label === "Financing Margin %")!;
  assert.deepEqual(margin.qoq, { kind: "pp", value: 11 }, "−6% vs −17%");
  const npa = r.lines.find((l) => l.label === "Gross NPA %")!;
  assert.equal(npa.current, null);
  assert.deepEqual(npa.yoy, { kind: "missing" });
  const rev = r.lines.find((l) => l.label === "Revenue")!;
  assert.deepEqual(rev.qoq, { kind: "pct", value: Math.round(((95132 - 90575) / 90575) * 10000) / 100 });
});

test("YoY matches by quarter date, not by counting four columns back", () => {
  // A gap (Dec 2025 missing) means 4 columns back is Jun 2025, which would be wrong.
  const q: Quarters = {
    basis: "Standalone",
    unit: "Rs. Crores",
    periods: [
      { key: "2025-06-30", label: "Jun 2025" },
      { key: "2025-09-30", label: "Sep 2025" },
      { key: "2026-03-31", label: "Mar 2026" },
      { key: "2026-06-30", label: "Jun 2026" },
      { key: "2026-09-30", label: "Sep 2026" },
    ],
    rows: [
      { name: "Sales", values: [100, 200, 300, 400, 500], percent: false },
      { name: "Operating Profit", values: [10, 20, 30, 40, 50], percent: false },
    ],
    rawPdfs: [],
  };
  const r = buildResults(q);
  assert.equal(r.yearAgoQuarter, "Sep 2025");
  const rev = r.lines.find((l) => l.label === "Revenue")!;
  assert.deepEqual(rev.yoy, { kind: "pct", value: 150 });
  assert.deepEqual(rev.qoq, { kind: "pct", value: 25 });
  const pbt = r.lines.find((l) => l.label === "PBT")!;
  assert.equal(pbt.current, null, "row not on Screener");
  assert.deepEqual(pbt.qoq, { kind: "missing" });

  const noYearAgo = buildResults({ ...q, periods: q.periods.map((p, i) => (i === 1 ? { ...p, key: "2025-08-31" } : p)) });
  assert.equal(noYearAgo.yearAgoQuarter, null);
  assert.deepEqual(noYearAgo.lines[0].yoy, { kind: "missing" });
});
