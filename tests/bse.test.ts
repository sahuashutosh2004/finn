import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { bsePdfUrl, parseBse } from "../lib/bse";
import { mergeFilings } from "../lib/filings";
import { parseScreener } from "../lib/screener";

const fixture = (name: string) => readFileSync(path.join(__dirname, "fixtures", name), "utf8");

test("bsePdfUrl picks the live or historical folder", () => {
  assert.equal(bsePdfUrl("a.pdf", 0), "https://www.bseindia.com/xml-data/corpfiling/AttachLive/a.pdf");
  assert.equal(bsePdfUrl("a.pdf", 1), "https://www.bseindia.com/xml-data/corpfiling/AttachHis/a.pdf");
});

test("parseBse reads the announcements feed", () => {
  const rows = parseBse(JSON.parse(fixture("bse-HDFCBANK.json")));
  assert.equal(rows.length, 17);
  assert.deepEqual(rows[0], {
    newsId: "44ba0161-d9e4-4bd1-aae7-eb3bc46319dd",
    date: "2026-11-13",
    time: "2026-11-13T16:30:11.85",
    title: "Announcement under Regulation 30 (LODR)-Change in Directorate",
    headline: "Re-appointment of Mr. V. Srinivasa Rangan as the Whole-time Director(designated as Executive Director) of HDFC Bank Limited.",
    bseCategory: "Company Update",
    bseSubcategory: "Change in Directorate",
    url: "https://www.bseindia.com/xml-data/corpfiling/AttachLive/7b9eb8a8-fa88-453b-810f-b55034589aac.pdf",
  });
  assert.ok(rows.every((r, i) => i === 0 || rows[i - 1].time >= r.time), "newest first");
  assert.equal(parseBse(JSON.parse(fixture("bse-POLYCAB.json"))).length, 10);
});

test("parseBse rejects a response without the table", () => {
  assert.throws(() => parseBse({ Message: "blocked" }));
  assert.throws(() => parseBse("<html>"));
});

test("parseBse tidies SQL-escaped apostrophes and drops a headline that repeats the title", () => {
  const rows = parseBse({
    Table: [
      { NEWSID: "1", NEWS_DT: "2026-11-10T10:00:00", NEWSSUB: "Company''s ESOP allotment", HEADLINE: "Company''s ESOP allotment", CATEGORYNAME: "Company Update", SUBCATNAME: "General", ATTACHMENTNAME: "x.pdf", PDFFLAG: 0 },
    ],
  });
  assert.equal(rows[0].title, "Company's ESOP allotment");
  assert.equal(rows[0].headline, null);
});

test("mergeFilings: BSE is the list, Screener's summary is reused for the same PDF", () => {
  const sc = parseScreener(fixture("screener-HDFCBANK.html"), { symbol: "HDFCBANK", url: "https://www.screener.in/company/HDFCBANK/consolidated/", fetchedAt: new Date("2026-11-15T16:00:00+05:30") });
  assert.ok(sc.ok);
  const bse = parseBse(JSON.parse(fixture("bse-HDFCBANK.json")));
  const merged = mergeFilings({ symbol: "HDFCBANK", bse, screener: sc.announcements });
  assert.equal(merged.length, 17);
  assert.equal(merged.filter((f) => f.summarySource === "Screener").length, 5);
  assert.ok(merged.every((f) => f.source === "BSE" && f.id.startsWith("b-")));
  assert.equal(merged[0].summary, "HDFC Bank reappointed V. Srinivasa Rangan as Executive Director for one year from November 23, 2026.");
  assert.equal(merged[0].category, "management_change");

  const fallback = mergeFilings({ symbol: "HDFCBANK", bse: null, screener: sc.announcements });
  assert.equal(fallback.length, 5);
  assert.ok(fallback.every((f) => f.source === "Screener" && f.id.startsWith("s-")));
  assert.deepEqual(
    fallback.map((f) => f.id),
    mergeFilings({ symbol: "HDFCBANK", bse: null, screener: sc.announcements }).map((f) => f.id),
    "ids are stable across runs",
  );
});

test("mergeFilings unescapes Screener text", () => {
  const [f] = mergeFilings({
    symbol: "X",
    bse: null,
    screener: [{ date: "2026-11-10", title: "Investors'' Meet", summary: "The Company''s executives will attend.", url: null, dateInferred: false }],
  });
  assert.equal(f.title, "Investors' Meet");
  assert.equal(f.summary, "The Company's executives will attend.");
});
