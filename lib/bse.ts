// BSE corporate announcements API (the JSON behind bseindia.com/corporates/ann.html).
// It needs a browser User-Agent plus BSE's Referer/Origin, otherwise Akamai returns 403.
import { BROWSER_UA, sleep } from "./http";

export type BseFiling = {
  newsId: string;
  date: string; // YYYY-MM-DD, IST (BSE timestamps are IST)
  time: string; // ISO-like local timestamp as BSE sent it
  title: string; // NEWSSUB
  headline: string | null; // HEADLINE, BSE's one-line description
  bseCategory: string | null; // CATEGORYNAME, e.g. "Board Meeting"
  bseSubcategory: string | null; // SUBCATNAME, e.g. "Change in Directorate"
  url: string | null;
};

type Raw = {
  NEWSID?: string;
  NEWS_DT?: string;
  DissemDT?: string;
  NEWSSUB?: string;
  HEADLINE?: string | null;
  CATEGORYNAME?: string | null;
  SUBCATNAME?: string | null;
  ATTACHMENTNAME?: string | null;
  PDFFLAG?: number;
};

const API = "https://api.bseindia.com/BseIndiaAPI/api/AnnSubCategoryGetData/w";
const HEADERS = {
  "User-Agent": BROWSER_UA,
  Referer: "https://www.bseindia.com/",
  Origin: "https://www.bseindia.com",
  Accept: "application/json, text/plain, */*",
};

const tidy = (s: string | null | undefined) => {
  const t = (s ?? "").replace(/''/g, "'").replace(/\s+/g, " ").trim();
  return t || null;
};

/** PDFFLAG 0 = file still in AttachLive, 1 = moved to AttachHis (checked against live BSE URLs). */
export function bsePdfUrl(attachment: string | null | undefined, pdfFlag: number | undefined): string | null {
  if (!attachment) return null;
  const dir = pdfFlag === 0 ? "AttachLive" : "AttachHis";
  return `https://www.bseindia.com/xml-data/corpfiling/${dir}/${encodeURIComponent(attachment)}`;
}

export function parseBse(json: unknown): BseFiling[] {
  const table = (json as { Table?: Raw[] })?.Table;
  if (!Array.isArray(table)) throw new Error("BSE response has no Table");
  return table.flatMap((r) => {
    const when = r.NEWS_DT ?? r.DissemDT ?? "";
    const title = tidy(r.NEWSSUB);
    if (!r.NEWSID || !title || !/^\d{4}-\d{2}-\d{2}/.test(when)) return [];
    const headline = tidy(r.HEADLINE);
    return [
      {
        newsId: r.NEWSID,
        date: when.slice(0, 10),
        time: when,
        title,
        headline: headline && headline !== title ? headline : null,
        bseCategory: tidy(r.CATEGORYNAME),
        bseSubcategory: tidy(r.SUBCATNAME),
        url: bsePdfUrl(r.ATTACHMENTNAME, r.PDFFLAG),
      },
    ];
  });
}

const ymd = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }).replace(/-/g, "");

/** Every announcement for a scrip in the last `days` days, newest first. */
/** BSE's edge drops connections under load; network errors and 429/5xx are retried with backoff. */
async function fetchRetry(url: string, attempts = 4): Promise<{ res: Response; text: string }> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    if (i) await sleep(1000 * 2 ** i);
    try {
      const res = await fetch(url, { headers: HEADERS });
      if ((res.status === 429 || res.status >= 500) && i < attempts - 1) continue;
      return { res, text: await res.text() };
    } catch (e) {
      last = e;
    }
  }
  throw last instanceof Error ? last : new Error(String(last));
}

export async function fetchBseFilings(bseCode: string, days = 30, now = new Date()): Promise<BseFiling[]> {
  const from = ymd(new Date(now.getTime() - days * 86_400_000));
  const to = ymd(now);
  const out: BseFiling[] = [];
  for (let page = 1; page <= 5; page++) {
    const url = `${API}?pageno=${page}&strCat=-1&strPrevDate=${from}&strScrip=${bseCode}&strSearch=P&strToDate=${to}&strType=C&subcategory=-1`;
    const { res, text } = await fetchRetry(url);
    if (!res.ok) throw new Error(`BSE HTTP ${res.status}`);
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(`BSE returned non-JSON: ${text.slice(0, 60)}`);
    }
    const rows = parseBse(json);
    out.push(...rows);
    const total = (json as { Table1?: { ROWCNT?: number }[] }).Table1?.[0]?.ROWCNT ?? rows.length;
    if (rows.length === 0 || out.length >= total) break;
    await sleep(400);
  }
  return out.sort((a, b) => b.time.localeCompare(a.time));
}
