// Done / pinned items and which alerts have been seen, saved on the phone.
import { useSyncExternalStore } from "react";

export type TriageState = {
  done: Record<string, string>;
  pinned: Record<string, string>;
  seen: string[];
  /** Alerts that were new when the Alerts tab was opened this session. Not restored on reload. */
  fresh?: string[];
};

const KEY = "finn:triage";
const EMPTY: TriageState = { done: {}, pinned: {}, seen: [] };
const MAX_SEEN = 1000;
const listeners = new Set<() => void>();
let cache: TriageState | null = null;

function sanitize(raw: unknown): TriageState {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<TriageState>;
  const map = (m: unknown) =>
    Object.fromEntries(Object.entries(m && typeof m === "object" ? m : {}).filter(([, v]) => typeof v === "string")) as Record<string, string>;
  return { done: map(r.done), pinned: map(r.pinned), seen: Array.isArray(r.seen) ? r.seen.filter((x) => typeof x === "string").slice(-MAX_SEEN) : [] };
}

function read(): TriageState {
  if (cache === null) {
    try {
      cache = sanitize(JSON.parse(localStorage.getItem(KEY) ?? "null"));
    } catch {
      cache = EMPTY;
    }
  }
  return cache;
}

function write(next: TriageState) {
  cache = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // private mode: keep in memory
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      cache = null;
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function useTriage(): TriageState {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

const now = () => new Date().toISOString();

/** Right swipe: done (again = undo). Done items lose their pin. */
export function toggleDone(id: string) {
  const s = read();
  const done = { ...s.done };
  const pinned = { ...s.pinned };
  if (done[id]) delete done[id];
  else {
    done[id] = now();
    delete pinned[id];
  }
  write({ ...s, done, pinned });
}

/** Left swipe: pin (again = unpin). Pinning brings a done item back. */
export function togglePin(id: string) {
  const s = read();
  const done = { ...s.done };
  const pinned = { ...s.pinned };
  if (pinned[id]) delete pinned[id];
  else {
    pinned[id] = now();
    delete done[id];
  }
  write({ ...s, done, pinned });
}

/** Opening Alerts: remember what was new on this visit, then mark everything seen. */
export function visitAlerts(keys: string[]) {
  const s = read();
  const have = new Set(s.seen);
  const add = keys.filter((k) => !have.has(k));
  if (!add.length) return;
  write({ ...s, seen: [...s.seen, ...add].slice(-MAX_SEEN), fresh: [...new Set([...(s.fresh ?? []), ...add])] });
}

export function unseenCount(keys: string[], s: TriageState): number {
  const seen = new Set(s.seen);
  return keys.filter((k) => !seen.has(k) && !s.done[k]).length;
}
