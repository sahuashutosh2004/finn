import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { checkNumbers, checkQuote, containsPhrase, numberInQuote, numbersIn } from "../lib/verify";

const transcript = readFileSync(path.join(__dirname, "fixtures", "pdf-POLYCAB-transcript.txt"), "utf8");

test("a quote copied from the transcript passes, across line breaks and PDF hyphenation", () => {
  assert.deepEqual(checkQuote("we remain confident of sustaining medium- to long-term EBITDA margins within our guided range of 11% to 13%.", transcript), { ok: true });
  assert.deepEqual(checkQuote("“We remain confident of sustaining medium- to long-term EBITDA margins…within our guided range of 11% to 13%”", transcript), { ok: true });
  assert.deepEqual(checkQuote("Polycab’s inter-\nnational business grew strongly this quarter", "Polycab's international business grew strongly this quarter."), { ok: true });
});

test("a quote with a changed word or number is rejected", () => {
  assert.equal(checkQuote("we remain confident of sustaining EBITDA margins within our guided range of 12% to 14%", transcript).ok, false);
  assert.equal(checkQuote("we remain confident of sustaining medium to long term PAT margins within our guided range of 11% to 13%", transcript).ok, false);
  assert.equal(checkQuote("We expect revenue to double by FY28 across all segments", transcript).ok, false);
});

test("fragments around an ellipsis must appear in order", () => {
  assert.equal(checkQuote("within our guided range of 11% to 13% ... we remain confident of sustaining medium", transcript).ok, false);
});

test("very short quotes can't be checked and are rejected", () => {
  assert.deepEqual(checkQuote("margins of 11%", transcript), { ok: false, reason: "quote too short to check" });
});

test("containsPhrase for names and titles", () => {
  assert.equal(containsPhrase("Whole-time Director", "appointed as Whole-time Director (designated as Executive Director)"), true);
  assert.equal(containsPhrase("Managing Director", "appointed as Whole-time Director"), false);
});

test("numbers: Indian grouping and trailing zeros are normalised", () => {
  assert.deepEqual(numbersIn("₹1,19,121 Cr and 12.50% and 7.0x"), ["119121", "12.5", "7"]);
  assert.deepEqual(checkNumbers("Revenue of ₹1,19,121 Cr", "market cap 119121"), { ok: true });
  assert.deepEqual(checkNumbers("Margin 14.5% and capex 600", "margin 14.5%"), { ok: false, missing: ["600"] });
  assert.deepEqual(checkNumbers("Margin 14.5% and capex 600", "margin 14.5%", [600]), { ok: true });
  assert.equal(numberInQuote(13, "guided range of 11% to 13%"), true);
  assert.equal(numberInQuote(14, "guided range of 11% to 13%"), false);
});
