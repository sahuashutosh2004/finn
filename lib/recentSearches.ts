"use client";

import { useSyncExternalStore } from "react";

const KEY = "finn:recent-searches";
const LIMIT = 5;
const EMPTY: string[] = [];

const listeners = new Set<() => void>();
let cache: string[] | null = null;

function read(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(parsed)
      ? parsed.filter((s): s is string => typeof s === "string").slice(0, LIMIT)
      : EMPTY;
  } catch {
    return EMPTY;
  }
}

function write(next: string[]) {
  cache = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage can be unavailable (private mode); keep the in-memory list.
  }
  listeners.forEach((l) => l());
}

function getSnapshot(): string[] {
  if (cache === null) cache = read();
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

export function addRecentSearch(symbol: string) {
  write([symbol, ...getSnapshot().filter((s) => s !== symbol)].slice(0, LIMIT));
}

export function clearRecentSearches() {
  write(EMPTY);
}

export function useRecentSearches(): string[] {
  return useSyncExternalStore(subscribe, getSnapshot, () => EMPTY);
}
