// One cheap model behind an OpenAI-compatible endpoint (Gemini and Groq both expose one).
// Every result is cached by task + source URL so a PDF is never paid for twice, and every
// call is counted so refresh can report tokens used.
import { readCache, writeCache } from "./cache";
import { sleep } from "./http";

type Provider = { name: "gemini" | "groq"; base: string; model: string; key: string };

export function provider(): Provider | null {
  const gemini = process.env.GEMINI_API_KEY?.trim();
  if (gemini) {
    return {
      name: "gemini",
      base: "https://generativelanguage.googleapis.com/v1beta/openai",
      model: process.env.FINN_GEMINI_MODEL?.trim() || "gemini-flash-lite-latest",
      key: gemini,
    };
  }
  const groq = process.env.GROQ_API_KEY?.trim();
  if (groq) {
    return {
      name: "groq",
      base: "https://api.groq.com/openai/v1",
      model: process.env.FINN_GROQ_MODEL?.trim() || "llama-3.1-8b-instant",
      key: groq,
    };
  }
  return null;
}

export type Usage = { input: number; output: number };
type Cached<T> = { json: T; usage: Usage; provider: string; model: string };

export const ledger = { calls: 0, cacheHits: 0, failures: 0, input: 0, output: 0, byTask: {} as Record<string, Usage & { calls: number; cacheHits: number }> };

function count(task: string, usage: Usage | null) {
  const t = (ledger.byTask[task] ??= { calls: 0, cacheHits: 0, input: 0, output: 0 });
  if (usage) {
    ledger.calls++;
    ledger.input += usage.input;
    ledger.output += usage.output;
    t.calls++;
    t.input += usage.input;
    t.output += usage.output;
  } else {
    ledger.cacheHits++;
    t.cacheHits++;
  }
}

export type LlmResult<T> =
  | { ok: true; json: T; cached: boolean; provider: string; model: string }
  | { ok: false; error: string; limited?: boolean };

export async function askJson<T>(opts: {
  task: string;
  /** Bump when the prompt changes so cached answers to the old prompt aren't reused. */
  version?: string;
  sourceUrl: string;
  system: string;
  user: string;
  maxTokens?: number;
  /** Tries on 429/5xx. Live page renders use 1 so a rate-limited key fails fast. */
  attempts?: number;
}): Promise<LlmResult<T>> {
  const p = provider();
  const key = `${opts.task}:${opts.version ?? "v1"}:${opts.sourceUrl}`;
  const hit = await readCache<Cached<T>>("llm", key);
  if (hit) {
    count(opts.task, null);
    return { ok: true, json: hit.value.json, cached: true, provider: hit.value.provider, model: hit.value.model };
  }
  if (!p) return { ok: false, error: "no API key" };

  const body = JSON.stringify({
    model: p.model,
    temperature: 0,
    max_tokens: opts.maxTokens ?? 800,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: opts.system },
      { role: "user", content: opts.user },
    ],
  });

  const attempts = opts.attempts ?? 3;
  let limited = false;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const res = await fetch(`${p.base}/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${p.key}`, "Content-Type": "application/json" },
        body,
        signal: AbortSignal.timeout(45_000),
      });
      if (res.status === 429 || res.status >= 500) {
        limited = res.status === 429;
        // A used-up daily quota won't recover by waiting a few seconds.
        if (limited && /per ?day|daily/i.test(await res.text())) break;
        if (attempt + 1 < attempts) await sleep(Math.min(Number(res.headers.get("retry-after")) || 8 * (attempt + 1), 30) * 1000);
        continue;
      }
      const data = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
        usage?: { prompt_tokens?: number; completion_tokens?: number };
        error?: { message?: string };
      };
      if (!res.ok) throw new Error(data.error?.message ?? `HTTP ${res.status}`);
      const usage = { input: data.usage?.prompt_tokens ?? 0, output: data.usage?.completion_tokens ?? 0 };
      count(opts.task, usage);
      const content = (data.choices?.[0]?.message?.content ?? "").replace(/^```(?:json)?\s*|\s*```$/g, "");
      const json = JSON.parse(content) as T;
      await writeCache<Cached<T>>("llm", key, { json, usage, provider: p.name, model: p.model });
      return { ok: true, json, cached: false, provider: p.name, model: p.model };
    } catch (e) {
      ledger.failures++;
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }
  ledger.failures++;
  return limited ? { ok: false, error: "rate limited", limited: true } : { ok: false, error: "model unavailable" };
}
