// Small JSON file cache. Locally it lives in data/cache; on Vercel the deployment is read-only,
// so writes go to /tmp and reads fall back to the copy of data/cache shipped with the build.
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const BUNDLED = path.join(process.cwd(), "data", "cache");
const WRITABLE = process.env.VERCEL ? path.join("/tmp", "finn-cache") : BUNDLED;

export const DAY_MS = 86_400_000;

type Entry<T> = { savedAt: string; key: string; value: T };

function fileFor(dir: string, ns: string, key: string) {
  const slug = key.replace(/[^a-zA-Z0-9]+/g, "-").slice(0, 60);
  const hash = createHash("sha1").update(key).digest("hex").slice(0, 10);
  return path.join(dir, ns, `${slug}-${hash}.json`);
}

/** Returns the cached value, or null if it's missing or older than maxAgeMs (omit for no expiry). */
export async function readCache<T>(ns: string, key: string, maxAgeMs?: number): Promise<{ value: T; savedAt: string } | null> {
  for (const dir of WRITABLE === BUNDLED ? [BUNDLED] : [WRITABLE, BUNDLED]) {
    try {
      const entry = JSON.parse(await readFile(fileFor(dir, ns, key), "utf8")) as Entry<T>;
      if (entry.key !== key) continue;
      if (maxAgeMs !== undefined && Date.now() - new Date(entry.savedAt).getTime() > maxAgeMs) continue;
      return { value: entry.value, savedAt: entry.savedAt };
    } catch {
      // missing or unreadable: try the next location
    }
  }
  return null;
}

export async function writeCache<T>(ns: string, key: string, value: T): Promise<void> {
  const file = fileFor(WRITABLE, ns, key);
  try {
    await mkdir(path.dirname(file), { recursive: true });
    const entry: Entry<T> = { savedAt: new Date().toISOString(), key, value };
    await writeFile(file, JSON.stringify(entry));
  } catch {
    // A failed cache write must never break a page; the value is simply recomputed next time.
  }
}
