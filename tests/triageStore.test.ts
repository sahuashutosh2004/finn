import { test } from "node:test";
import assert from "node:assert/strict";

// Minimal browser stand-ins: the store only touches localStorage and storage events.
const mem = new Map<string, string>();
Object.assign(globalThis, {
  localStorage: { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) },
  window: { addEventListener() {}, removeEventListener() {} },
});

test("done, pin and new-since-last-visit, saved to localStorage", async () => {
  const { toggleDone, togglePin, unseenCount, visitAlerts } = await import("../lib/triageStore");
  const saved = () => JSON.parse(mem.get("finn:triage")!);

  toggleDone("a");
  assert.ok(saved().done.a);
  togglePin("a");
  assert.ok(saved().pinned.a && !saved().done.a, "pinning brings a done item back");
  toggleDone("a");
  assert.ok(saved().done.a && !saved().pinned.a, "done removes the pin");
  toggleDone("a");
  assert.ok(!saved().done.a, "done again undoes");

  const keys = ["p-X-2026-11-13", "b-1", "b-2"];
  assert.equal(unseenCount(keys, saved()), 3);
  visitAlerts(keys);
  assert.equal(unseenCount(keys, saved()), 0);
  assert.deepEqual(saved().fresh, keys, "what was new on this visit is remembered for the dots");
  assert.equal(unseenCount([...keys, "b-3"], saved()), 1, "only the new one counts");

  toggleDone("b-4");
  assert.equal(unseenCount(["b-4"], saved()), 0, "done items never count");
});
