import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { inferYear, parseDayLabel, parseNumber, parseScreener } from "../lib/screener";

const fixture = (name: string) => readFileSync(path.join(__dirname, "fixtures", name), "utf8");
const FETCHED = new Date("2026-11-15T16:00:00+05:30");

const polycab = parseScreener(fixture("screener-POLYCAB.html"), {
  symbol: "POLYCAB",
  url: "https://www.screener.in/company/POLYCAB/consolidated/",
  fetchedAt: FETCHED,
});
const hdfc = parseScreener(fixture("screener-HDFCBANK.html"), {
  symbol: "HDFCBANK",
  url: "https://www.screener.in/company/HDFCBANK/consolidated/",
  fetchedAt: FETCHED,
});

test("parseNumber handles Screener cell formats and rejects anything else", () => {
  assert.equal(parseNumber("8,864"), 8864);
  assert.equal(parseNumber("-15,342"), -15342);
  assert.equal(parseNumber("+27%"), 27);
  assert.equal(parseNumber("64.86"), 64.86);
  assert.equal(parseNumber(""), null);
  assert.equal(parseNumber("—"), null);
  assert.equal(parseNumber("1,2a"), null);
});

test("company name and about text", () => {
  assert.equal(polycab.companyName, "Polycab India Ltd");
  assert.match(polycab.about ?? "", /^Polycab is India’s leading manufacturers of cables and wires/);
  assert.match(hdfc.about ?? "", /^HDFC Bank Limited/);
  assert.doesNotMatch(hdfc.about ?? "", /\[\d+\]/, "footnote markers removed");
});

test("quarterly table: labels, date keys, basis and unit", () => {
  const q = polycab.quarters!;
  assert.equal(q.basis, "Consolidated");
  assert.equal(q.unit, "Rs. Crores");
  assert.equal(q.periods.length, 13);
  assert.deepEqual(q.periods[0], { key: "2023-09-30", label: "Sep 2023" });
  assert.deepEqual(q.periods.at(-1), { key: "2026-09-30", label: "Sep 2026" });
});

test("quarterly table: standard company rows keep Screener names and exact values", () => {
  const q = polycab.quarters!;
  const row = (n: string) => q.rows.find((r) => r.name === n)!;
  assert.deepEqual(
    q.rows.map((r) => r.name),
    ["Sales", "YoY Sales growth", "Expenses", "Operating Profit", "OPM %", "Other Income", "Interest", "Depreciation", "Profit before tax", "Tax %", "Net Profit", "EPS in Rs"],
  );
  assert.deepEqual(row("Sales").values.slice(-3), [8864, 8210, 9899]);
  assert.deepEqual(row("Operating Profit").values.slice(-3), [1161, 1136, 1422]);
  assert.deepEqual(row("Profit before tax").values.slice(-3), [1049, 1058, 1306]);
  assert.deepEqual(row("Net Profit").values.slice(-3), [786, 797, 990]);
  assert.equal(row("OPM %").percent, true);
  assert.equal(row("Sales").percent, false);
  assert.equal(q.rawPdfs.at(-1), "https://www.screener.in/company/source/quarter/1274653/9/2026/");
});

test("quarterly table: bank rows are kept as Screener has them", () => {
  const q = hdfc.quarters!;
  const names = q.rows.map((r) => r.name);
  assert.ok(names.includes("Revenue"));
  assert.ok(names.includes("Financing Profit"));
  assert.ok(names.includes("Financing Margin %"));
  assert.ok(names.includes("Gross NPA %"));
  assert.ok(!names.includes("Sales"));
  const row = (n: string) => q.rows.find((r) => r.name === n)!;
  assert.deepEqual(row("Revenue").values.slice(-3), [87182, 90575, 95132]);
  assert.deepEqual(row("Financing Profit").values.slice(-3), [-2066, -15342, -5565]);
  assert.deepEqual(row("Net Profit").values.slice(-3), [21074, 20383, 21537]);
  assert.deepEqual(row("Gross NPA %").values.slice(-1), [null], "blank cells stay null");
});

test("announcements: title, IST date from <time datetime>, verbatim summary, pdf link", () => {
  assert.equal(polycab.announcements.length, 5);
  const [first, second] = polycab.announcements;
  assert.equal(first.title, "Announcement Under Regulation 30 (LODR) - Analyst(S) / Investor(S) Meet - Intimation");
  assert.equal(first.date, "2026-11-06");
  assert.equal(first.dateInferred, false);
  assert.equal(first.summary, null, "no short text on this item");
  assert.match(first.url ?? "", /^https:\/\/www\.bseindia\.com\/stockinfo\/AnnPdfOpen\.aspx\?Pname=72c96165/);
  assert.equal(second.date, "2026-11-03");
  assert.equal(
    second.summary,
    "Disclosure of allotment of Equity shares pursuant to Employee Stock Options Scheme, 2018 of Polycab India Limited",
  );
  const hd = hdfc.announcements[0];
  assert.equal(hd.title, "Announcement under Regulation 30 (LODR)-Change in Directorate");
  assert.equal(hd.date, "2026-11-13");
  assert.equal(
    hd.summary,
    "HDFC Bank reappointed V. Srinivasa Rangan as Executive Director for one year from November 23, 2026.",
  );
});

test("documents: concall transcripts / ppts and de-duplicated annual reports", () => {
  const oct = polycab.concalls[0];
  assert.equal(oct.period, "Oct 2026");
  assert.match(oct.transcript ?? "", /Pname=77b6d277/);
  assert.match(oct.ppt ?? "", /Pname=a940f987/);
  assert.match(oct.recording ?? "", /\.mp3$/);
  const jan = polycab.concalls.find((c) => c.period === "Jan 2026")!;
  assert.equal(jan.ppt, null, "a PPT chip without a link is not a link");
  const urls = polycab.annualReports.map((r) => r.url);
  assert.equal(new Set(urls).size, urls.length);
  assert.equal(polycab.annualReports[0].label, "Annual Report 2026");
});

test("year inference for day-month labels", () => {
  const ref = new Date("2026-01-05T10:00:00+05:30");
  assert.equal(inferYear(28, 11, ref), 2025, "28 Dec seen on 5 Jan is last year");
  assert.equal(inferYear(5, 0, ref), 2026);
  assert.equal(inferYear(6, 0, ref), 2026, "one day ahead is tolerated (time zones)");
  assert.equal(inferYear(10, 0, ref), 2025, "well in the future means last year");
  assert.deepEqual(parseDayLabel("6 Nov", FETCHED), { date: "2026-11-06", inferred: true });
  assert.deepEqual(parseDayLabel("20 Dec", FETCHED), { date: "2025-12-20", inferred: true });
  assert.deepEqual(parseDayLabel("3 Mar 2024", FETCHED), { date: "2024-03-03", inferred: false });
  assert.equal(parseDayLabel("2d", FETCHED), null);
});

test("announcement without a datetime attribute falls back to the label with an inferred year", () => {
  const html = `<div id="company-announcements-tab"><ul class="list-links"><li><a href="/x.pdf">Credit Rating
    <div class="ink-600 smaller"><time>20 Dec</time> - CRISIL reaffirmed AA+</div></a></li></ul></div>`;
  const parsed = parseScreener(html, { symbol: "X", url: "u", fetchedAt: FETCHED });
  assert.deepEqual(parsed.announcements[0], {
    date: "2025-12-20",
    dateInferred: true,
    title: "Credit Rating",
    summary: "CRISIL reaffirmed AA+",
    url: "https://www.screener.in/x.pdf",
  });
  assert.equal(parsed.quarters, null);
});
