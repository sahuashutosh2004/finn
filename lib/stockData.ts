import { fetchStock, type StockResult } from "./market";
import { loadSnapshot } from "./snapshot";

export type StockLookup = { source: "snapshot" | "live"; result: StockResult };

export async function getStock(symbol: string): Promise<StockLookup> {
  const snap = await loadSnapshot();
  if (snap.status === "ok") {
    const hit = snap.ok.find((s) => s.symbol === symbol);
    if (hit) return { source: "snapshot", result: hit };
  }
  return { source: "live", result: await fetchStock(symbol, { next: { revalidate: 900 } }) };
}
