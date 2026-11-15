import { test } from "node:test";
import assert from "node:assert/strict";
import { CATEGORIES, CATEGORY_LABEL, CATEGORY_TIER, classify, type Category } from "../lib/classify";

const cases: [string, string | null, Category][] = [
  // Real titles + summaries from the POLYCAB / HDFCBANK fixtures
  ["Announcement Under Regulation 30 (LODR) - Analyst(S) / Investor(S) Meet - Intimation", null, "investor_meetings"],
  ["Announcement Under Regulation 30 (LODR)-Allotment Of ESOP / ESPS", "Disclosure of allotment of Equity shares pursuant to Employee Stock Options Scheme, 2018", "unclassified"],
  ["Corporate Insolvency Resolution Process (CIRP)-Updates - Corporate Insolvency Resolution Process  (CIRP)", "On October 30, 2026, NCLAT allowed Polycab’s appeal and set aside NCLT Ahmedabad order.", "litigation"],
  ["Announcement under Regulation 30 (LODR)-Change in Directorate", "HDFC Bank reappointed V. Srinivasa Rangan as Executive Director for one year", "management_change"],
  ["Disclosure Under Regulation 30 Of The SEBI (LODR) Regulations, 2015", "RBI approved reappointment of V. Srinivasa Rangan as Executive Director for one year", "management_change"],
  ["Announcement under Regulation 30 (LODR)-Analyst / Investor Meet - Intimation", "Intimation of Schedule of Analyst/Institutional Investor Meetings", "investor_meetings"],
  ["Shareholder Meeting / Postal Ballot-Outcome of Postal_Ballot", "Shareholders approved Anup Bagchi as Director and MD & CEO on November 6, 2026.", "postal_ballot"],
  ["Announcement under Regulation 30 (LODR)-Change in Management", "Mr. Sanjay D’Souza superannuated on October 31, 2026, ceasing as Group Head", "management_change"],
  // Real titles from the first full refresh that needed rule fixes
  ["Announcement under Regulation 30 (LODR)-Analyst / Investor Meet - Outcome", "Audio recording of Q2 FY27 earnings conference call for quarter and half year ended September 30, 2026", "earnings_call"],
  ["Announcement under Regulation 30 (LODR)-Analyst / Investor Meet - Outcome", "Dixon Technologies held a one-on-one virtual meeting with DSP Mutual Fund on 2 November 2026", "investor_meetings"],
  ["Rumour verification - Regulation 30(11)", "Sun Pharma clarifies Assam plant halt report concerns", "press_release"],
  ["Reference To The Financial Results Issued By Suzuki Motor Corporation", "Suzuki Motor Corp H1 FY2026 revenue ¥3,419.2bn, profit attributable ¥253.7bn; FY2026 revenue forecast ¥6,900bn.", "press_release"],
  ["Announcement under Regulation 30 (LODR)-Change in Management", "Board approved Q2FY27 results, interim dividend of Rs 1.50 per share, record date November 13, 2026.", "results"],
  ["Announcement under Regulation 30 (LODR)-Change in Management", "Mr. X joins as Head of Sales effective November 1, 2026.", "management_change"],
  ["Infosys Announces Expansion Of Pocharam Development Center In Hyderabad", null, "capex"],
  ["Announcement under Regulation 30 (LODR)-Newspaper Publication", "Newspaper Publication of the Unaudited Financial Results for the quarter and half year ended September 30, 2026", "results"],
  ["Disclosures under Reg. 29(2) of SEBI (SAST) Regulations, 2011", "Promoter Hemlata Shende sold KPIT Technologies shares on November 4, 2026.", "insider_trading"],
  ["Disclosure Under Regulation 30 Of The SEBI (Listing Obligations And Disclosure Requirements) Regulations, 2015", "Telangana GST appellate order confirms ₹6,95,418 penalty; ICICI Bank will appeal.", "litigation"],
  ["Updates", "RBI approved Munish Sharda's reappointment as Executive Director from February 27, 2027", "management_change"],
  ["Announcement under Regulation 30 (LODR)-Allotment", "Persistent allotted 12,000 commercial papers worth INR 6 billion on November 5, 2026.", "fund_raise"],
  // Common BSE titles
  ["Board Meeting Intimation for Considering And Approving Unaudited Financial Results For The Quarter Ended September 30, 2026", null, "results"],
  ["Integrated Filing (Financial)", null, "results"],
  ["Board Meeting Outcome for Outcome Of Board Meeting", "Board approved Q2 FY27 results; revenue up 12% year on year.", "results"],
  ["Announcement under Regulation 30 (LODR)-Investor Presentation", null, "results"],
  ["Announcement under Regulation 30 (LODR)-Earnings Call Transcript", null, "earnings_call"],
  ["Announcement under Regulation 30 (LODR)-Audio / Video Recording of Earnings Call", null, "earnings_call"],
  ["Announcement under Regulation 30 (LODR)-Credit Rating", "ICRA reaffirmed long-term rating at [ICRA]AA+ (Stable).", "credit_rating"],
  ["Announcement under Regulation 30 (LODR)-Acquisition", "Acquired 100% stake in XYZ Pvt Ltd for Rs 120 crore.", "M&A"],
  ["Announcement under Regulation 30 (LODR)-Scheme of Arrangement", null, "M&A"],
  ["Announcement under Regulation 30 (LODR)-Issue of Securities", "Board approved raising up to Rs 500 crore via QIP.", "fund_raise"],
  ["Disclosure under Regulation 31(1) and 31(2) of SEBI (SAST) - Creation of Encumbrance", null, "pledging"],
  ["Disclosures under Reg. 7(2) of SEBI (Prohibition of Insider Trading) Regulations, 2015", null, "insider_trading"],
  ["Closure of Trading Window", null, "unclassified"],
  ["Compliance Certificate under Regulation 74(5) of SEBI (DP) Regulations, 2018", null, "unclassified"],
  ["Appointment of Secretarial Auditor", null, "unclassified"],
  ["Corporate Action-Board approves Dividend", "Interim dividend of Rs 5 per share; record date November 20, 2026.", "dividend"],
  ["Corporate Action-Board to consider Split", null, "bonus_split"],
  ["Announcement under Regulation 30 (LODR)-Press Release / Media Release", "Company bags order worth Rs 300 crore.", "press_release"],
  ["Announcement under Regulation 30 (LODR)-Commissioning of new plant", null, "capex"],
  ["Notice Of Annual General Meeting", null, "agm_egm"],
  ["Results of Postal Ballot", null, "postal_ballot"],
  ["Announcement under Regulation 30 (LODR)-Newspaper Publication", "Publication of notice regarding transfer of shares to IEPF", "unclassified"],
  ["Copy of Newspaper Publication", null, "unclassified"],
];

for (const [title, summary, expected] of cases) {
  test(`${expected}: ${title.slice(0, 70)}`, () => {
    assert.equal(classify(title, summary), expected);
  });
}

test("every category has a label and a tier", () => {
  for (const c of CATEGORIES) {
    assert.ok(CATEGORY_LABEL[c]);
    assert.ok([1, 2, 3, 4].includes(CATEGORY_TIER[c]));
  }
  assert.equal(CATEGORY_TIER.results, 1);
  assert.equal(CATEGORY_TIER.pledging, 2);
  assert.equal(CATEGORY_TIER.unclassified, 4);
});
