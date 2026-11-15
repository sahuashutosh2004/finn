import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { buildProfile, findProfile, findRole, fullName, sentences } from "../lib/profile";

const fixture = (name: string) => readFileSync(path.join(__dirname, "fixtures", name), "utf8");
const director = fixture("pdf-HDFCBANK-director.txt");
const superannuation = fixture("pdf-HDFCBANK-mgmt-oct31.txt");

test("sentences keeps honorifics and initials together", () => {
  assert.deepEqual(sentences("Mr. V. Srinivasa Rangan joined in 2000. He is a CA."), ["Mr. V. Srinivasa Rangan joined in 2000.", "He is a CA."]);
  assert.deepEqual(sentences("Effective w.e.f. July 1. Done."), ["Effective w.e.f. July 1.", "Done."]);
});

test("finds the brief profile in a director re-appointment filing", () => {
  const p = findProfile(director);
  assert.ok(p);
  assert.equal(p.name, "V. Srinivasa Rangan");
  assert.match(p.quote, /^Mr\. V\. Srinivasa Rangan, aged sixty-six \(66\) years/);
  assert.ok(p.quote.length <= 480);
  assert.ok(director.replace(/\s+/g, " ").includes(p.quote), "quote is verbatim");
});

test("role comes from the filing: 'designated as' wins over the formal title", () => {
  assert.equal(findRole(director), "Executive Director");
  assert.equal(findRole("Appointment of Mr. Prithvi Vachani (DIN: 08247706) as an Additional Director in the capacity of Executive Director for 5 years."), "Additional Director in the capacity of Executive Director");
  assert.equal(
    findRole("The following employees have been designated as Senior Management Personnel with effect from November 5, 2026. a) Mr. Ritesh Patel, Associate Vice President."),
    "Senior Management Personnel",
  );
  assert.equal(findRole("Mr. X ceased to be Chief Financial Officer on superannuation."), null);
});

test("fullName expands a first-name-only profile from the appointment line", () => {
  const text = "Appointment of Mr. Prithvi Vachani as Additional Director. Brief profile: Mr. Prithvi quickly demonstrated his acumen.";
  assert.equal(fullName(text, "Prithvi"), "Prithvi Vachani");
  assert.equal(fullName("Mr Ritesh Patel Mr Sushil Shah", "Ritesh"), "Ritesh Patel");
});

test("a filing without a profile gives no profile", async () => {
  assert.equal(findProfile(superannuation), null);
  assert.equal(await buildProfile("https://example.com/x.pdf", superannuation, "Superannuation"), null);
});

test("without a model key the profile is built from the text alone", async () => {
  const saved = { g: process.env.GEMINI_API_KEY, q: process.env.GROQ_API_KEY };
  delete process.env.GEMINI_API_KEY;
  delete process.env.GROQ_API_KEY;
  try {
    const p = await buildProfile("https://example.com/director.pdf", director, "Change in Directorate");
    assert.ok(p);
    assert.deepEqual([p.name, p.role, p.verifiedBy], ["V. Srinivasa Rangan", "Executive Director", "text"]);
  } finally {
    if (saved.g) process.env.GEMINI_API_KEY = saved.g;
    if (saved.q) process.env.GROQ_API_KEY = saved.q;
  }
});
