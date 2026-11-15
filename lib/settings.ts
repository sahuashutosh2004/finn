import { useSyncExternalStore } from "react";
import { CATEGORIES, CATEGORY_TIER, type Category } from "./classify";

export type Settings = {
  priceMovePct: number;
  volumeX: number;
  categories: Record<Category, boolean>;
};

export const PRICE_LIMITS = { min: 0.5, max: 20, step: 0.5 };
export const VOLUME_LIMITS = { min: 1.5, max: 10, step: 0.5 };

export const DEFAULT_SETTINGS: Settings = {
  priceMovePct: 3,
  volumeX: 2,
  categories: Object.fromEntries(CATEGORIES.map((c) => [c, CATEGORY_TIER[c] <= 2])) as Record<Category, boolean>,
};

const KEY = "finn:alert-settings";
const listeners = new Set<() => void>();
let cache: Settings | null = null;

const clamp = (n: unknown, { min, max }: { min: number; max: number }, fallback: number) =>
  typeof n === "number" && Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;

export function sanitize(raw: unknown): Settings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<Settings>;
  const cats = (r.categories && typeof r.categories === "object" ? r.categories : {}) as Partial<Record<Category, unknown>>;
  return {
    priceMovePct: clamp(r.priceMovePct, PRICE_LIMITS, DEFAULT_SETTINGS.priceMovePct),
    volumeX: clamp(r.volumeX, VOLUME_LIMITS, DEFAULT_SETTINGS.volumeX),
    categories: Object.fromEntries(
      CATEGORIES.map((c) => [c, typeof cats[c] === "boolean" ? cats[c] : DEFAULT_SETTINGS.categories[c]]),
    ) as Record<Category, boolean>,
  };
}

function getSnapshot(): Settings {
  if (cache === null) {
    try {
      cache = sanitize(JSON.parse(localStorage.getItem(KEY) ?? "null"));
    } catch {
      cache = DEFAULT_SETTINGS;
    }
  }
  return cache;
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

export function saveSettings(next: Settings) {
  cache = sanitize(next);
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    // Storage unavailable (private mode): keep the in-memory value for this session.
  }
  listeners.forEach((l) => l());
}

export function useSettings(): Settings {
  return useSyncExternalStore(subscribe, getSnapshot, () => DEFAULT_SETTINGS);
}
