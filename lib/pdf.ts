import { extractText, getDocumentProxy } from "unpdf";
import { readCache, writeCache } from "./cache";
import { BROWSER_UA, sleep } from "./http";

export type PdfText = { ok: true; url: string; pages: number; text: string } | { ok: false; url: string; error: string };

const MAX_BYTES = 30_000_000;
const ATTEMPTS = 3;

/** Errors that a retry won't fix. */
class Final extends Error {}

/** BSE moves attachments from AttachLive to AttachHis after a day; the same PDF answers at both. */
export function altBseUrl(url: string): string | null {
  if (url.includes("/AttachLive/")) return url.replace("/AttachLive/", "/AttachHis/");
  if (url.includes("/AttachHis/")) return url.replace("/AttachHis/", "/AttachLive/");
  return null;
}

/** Some sites link a viewer page (…/pdf-viewer?pdf=/path/file.pdf); the PDF itself is the `pdf` parameter. */
export function unwrapViewerUrl(url: string): string {
  try {
    const u = new URL(url);
    // BSE's AnnPdfOpen.aspx?Pname=X.pdf only redirects to the attachment folder.
    const pname = /bseindia\.com$/i.test(u.hostname) && /AnnPdfOpen\.aspx$/i.test(u.pathname) ? u.searchParams.get("Pname") : null;
    if (pname && /^[\w-]+\.pdf$/i.test(pname)) return `https://www.bseindia.com/xml-data/corpfiling/AttachHis/${pname}`;
    const inner = u.searchParams.get("pdf") ?? u.searchParams.get("file");
    if (inner && /\.pdf$/i.test(inner)) return new URL(inner, u.origin).toString();
  } catch {
    // not a URL we can parse: use it as is
  }
  return url;
}

/** Downloads a PDF and returns its text layer. Cached forever by URL (filings don't change). */
export async function pdfText(url: string): Promise<PdfText> {
  const alt = altBseUrl(url);
  const hit = (await readCache<PdfText>("pdf-text", url)) ?? (alt ? await readCache<PdfText>("pdf-text", alt) : null);
  if (hit) return { ...hit.value, url };

  let got = await download(unwrapViewerUrl(url));
  if (!got.result && alt && !got.final) got = await download(alt);
  // Network failures aren't cached so a later run can retry.
  if (!got.result) return { ok: false, url, error: got.error };
  const result = { ...got.result, url };
  await writeCache("pdf-text", url, result);
  return result;
}

async function download(url: string): Promise<{ result: PdfText | null; error: string; final: boolean }> {
  let error = "";
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    if (attempt) await sleep(1500 * attempt);
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": BROWSER_UA, Referer: url.includes("bseindia.com") ? "https://www.bseindia.com/" : url },
      });
      if (res.status === 404) throw new Error("HTTP 404");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const type = res.headers.get("content-type") ?? "";
      if (!/pdf|octet-stream/i.test(type)) throw new Final(`not a PDF (${type || "no content-type"})`);
      const buf = new Uint8Array(await res.arrayBuffer());
      if (buf.byteLength > MAX_BYTES) throw new Final(`PDF too large (${Math.round(buf.byteLength / 1e6)} MB)`);
      const doc = await getDocumentProxy(buf, { verbosity: 0 });
      const { totalPages, text } = await extractText(doc, { mergePages: true });
      const clean = text.replace(/\u0000/g, "").trim();
      const result: PdfText =
        clean.length < 40 ? { ok: false, url, error: "PDF has no text layer (likely a scan)" } : { ok: true, url, pages: totalPages, text: clean };
      return { result, error: "", final: true };
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      if (e instanceof Final) return { result: null, error, final: true };
      if (error === "HTTP 404") return { result: null, error, final: false };
    }
  }
  return { result: null, error, final: false };
}
