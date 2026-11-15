// Pull-side research built only from Screener's tables (and checked transcript quotes).
// Every number carries a receipt; rows Screener doesn't have are left out, never filled in.
import type { CheckedItem } from "./guidance";
import { calcReceipt, cellReceipt, growthReceipt, topRatioReceipt, type Receipt } from "./receipts";
import { findRow, indexOfKey, round, shiftQuarterEnd } from "./results";
import type { FinTable, ScreenerData } from "./screener";

const IN0 = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const IN1 = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 1 });
const MINUS = "\u2212";
const signed = (n: number, digits = 1) => `${n > 0 ? "+" : n < 0 ? MINUS : ""}${Math.abs(n).toFixed(digits)}`;

export type Metric = { label: string; display: string; receipt: Receipt | null; sub?: string };

export function isBank(sd: ScreenerData): boolean {
  return Boolean(sd.quarters && findRow(sd.quarters, "Financing Profit")) || Boolean(sd.balanceSheet && findRow(sd.balanceSheet, "Deposits"));
}

// ---------- snapshot ----------

export function snapshotMetrics(sd: ScreenerData): Metric[] {
  const pick: [string, string, (v: number) => string][] = [
    ["Market Cap", "Market cap", (v) => `₹${IN0.format(v)} Cr`],
    ["Stock P/E", "P/E", (v) => IN1.format(v)],
    ["ROE", "ROE", (v) => `${IN1.format(v)}%`],
    ["ROCE", "ROCE", (v) => `${IN1.format(v)}%`],
  ];
  return pick.flatMap(([name, label, fmt]) => {
    const r = sd.topRatios.find((t) => t.name === name);
    if (!r || r.value === null) return [];
    const display = fmt(r.value);
    return [{ label, display, receipt: topRatioReceipt(sd, name, display) }];
  });
}

// ---------- trajectory ----------

export type GrowthLine = { label: string; items: { label: string; display: string; receipt: Receipt | null }[] };

export function growthLines(sd: ScreenerData): GrowthLine[] {
  const want: [string, string][] = [
    ["Compounded Sales Growth", "Sales"],
    ["Compounded Profit Growth", "Profit"],
  ];
  return want.flatMap(([name, label]) => {
    const g = sd.growth.find((x) => x.name === name);
    if (!g) return [];
    const items = g.items
      .filter((i) => i.value !== null)
      .map((i) => {
        const display = `${i.value}%`;
        return { label: i.label.replace(" Years", "Y"), display, receipt: growthReceipt(sd, name, i.label, display) };
      });
    return items.length ? [{ label, items }] : [];
  });
}

export type Bar = { label: string; value: number | null; receipt: Receipt | null };
export type BarSeries = { name: string; bars: Bar[] };

export function quarterBars(sd: ScreenerData, count = 8): BarSeries[] {
  const q = sd.quarters;
  if (!q) return [];
  const names = [findRow(q, "Sales")?.name ?? findRow(q, "Revenue")?.name, findRow(q, "Net Profit")?.name].filter(Boolean) as string[];
  const start = Math.max(0, q.periods.length - count);
  return names.map((name) => ({
    name,
    bars: q.periods.slice(start).map((p, k) => {
      const col = start + k;
      const v = q.rows.find((r) => r.name === name)?.values[col] ?? null;
      return { label: p.label, value: v, receipt: cellReceipt(sd, "quarters", q, name, col) };
    }),
  }));
}

// ---------- balance sheet & cash ----------

function lastFilled(t: FinTable, rowName: string): number {
  const row = t.rows.find((r) => r.name === rowName);
  if (!row) return -1;
  for (let i = t.periods.length - 1; i >= 0; i--) if (row.values[i] !== null && row.values[i] !== undefined) return i;
  return -1;
}

export type CashYear = { label: string; cfo: number | null; profit: number | null; pct: number | null; receipt: Receipt | null };

export type BalanceView = {
  rows: Metric[];
  cash: CashYear[];
  cash5y: Metric | null;
  days: Metric[];
  notes: string[];
};

export function balanceView(sd: ScreenerData): BalanceView {
  const bank = isBank(sd);
  const rows: Metric[] = [];
  const notes: string[] = [];
  const bs = sd.balanceSheet;

  if (bs) {
    const debtName = findRow(bs, "Borrowings")?.name ?? findRow(bs, "Borrowing")?.name;
    if (debtName) {
      const col = lastFilled(bs, debtName);
      const r = cellReceipt(sd, "balanceSheet", bs, debtName, col);
      const v = bs.rows.find((x) => x.name === debtName)!.values[col]!;
      rows.push({ label: debtName, display: `₹${IN0.format(v)} Cr`, receipt: r, sub: bs.periods[col].label });

      const eq = findRow(bs, "Equity Capital");
      const res = findRow(bs, "Reserves");
      const e = eq?.values[col];
      const rs = res?.values[col];
      if (!bank && e != null && rs != null && e + rs > 0) {
        const de = round(v / (e + rs), 2);
        const shown = v > 0 && de < 0.01 ? "<0.01x" : `${de.toFixed(2)}x`;
        rows.push({
          label: "Debt to equity",
          display: shown,
          sub: bs.periods[col].label,
          receipt: calcReceipt("Debt to equity", shown, `${debtName} ÷ (Equity Capital + Reserves) = ${IN0.format(v)} ÷ (${IN0.format(e)} + ${IN0.format(rs)})`, [
            r,
            cellReceipt(sd, "balanceSheet", bs, "Equity Capital", col),
            cellReceipt(sd, "balanceSheet", bs, "Reserves", col),
          ]),
        });
      }
    }
    if (bank) {
      const dep = findRow(bs, "Deposits");
      if (dep) {
        const col = lastFilled(bs, "Deposits");
        rows.push({ label: "Deposits", display: `₹${IN0.format(dep.values[col]!)} Cr`, sub: bs.periods[col].label, receipt: cellReceipt(sd, "balanceSheet", bs, "Deposits", col) });
      }
      notes.push("Debt to equity and cash conversion aren't meaningful for banks: borrowing and deposit flows are the business.");
    }
  }

  const cash: CashYear[] = [];
  let cash5y: Metric | null = null;
  const cf = sd.cashFlow;
  const pl = sd.profitLoss;
  if (!bank && cf && pl) {
    const cfoName = "Cash from Operating Activity";
    const cfoRow = findRow(cf, cfoName);
    const npRow = findRow(pl, "Net Profit");
    if (cfoRow && npRow) {
      const cols = cf.periods.map((p, i) => ({ p, i })).filter(({ p }) => p.key && /^\d{4}-\d{2}-\d{2}$/.test(p.key)).slice(-5);
      for (const { p, i } of cols) {
        const j = indexOfKey(pl, p.key);
        const cfo = cfoRow.values[i] ?? null;
        const np = j >= 0 ? (npRow.values[j] ?? null) : null;
        const pct = cfo !== null && np !== null && np > 0 ? Math.round((cfo / np) * 100) : null;
        cash.push({
          label: p.label,
          cfo,
          profit: np,
          pct,
          receipt:
            pct === null
              ? null
              : calcReceipt(`Cash conversion · ${p.label}`, `${pct}%`, `${cfoName} ÷ Net Profit = ${IN0.format(cfo!)} ÷ ${IN0.format(np!)}`, [
                  cellReceipt(sd, "cashFlow", cf, cfoName, i),
                  j >= 0 ? cellReceipt(sd, "profitLoss", pl, "Net Profit", j) : null,
                ]),
        });
      }
      const valid = cash.filter((c) => c.cfo !== null && c.profit !== null);
      const sc = valid.reduce((s, c) => s + c.cfo!, 0);
      const sp = valid.reduce((s, c) => s + c.profit!, 0);
      if (valid.length >= 3 && sp > 0) {
        const pct = Math.round((sc / sp) * 100);
        cash5y = {
          label: `Cash conversion, ${valid.length} years`,
          display: `${pct}%`,
          receipt: calcReceipt(`Cash conversion · ${valid.length} years`, `${pct}%`, `Σ ${cfoName} ÷ Σ Net Profit = ${IN0.format(sc)} ÷ ${IN0.format(sp)} (${valid.map((c) => c.label).join(", ")})`, []),
        };
      }
    }
  }

  const days: Metric[] = [];
  const rt = sd.ratios;
  if (rt) {
    for (const name of ["Debtor Days", "Working Capital Days"]) {
      if (!findRow(rt, name)) continue;
      const col = lastFilled(rt, name);
      if (col < 0) continue;
      const v = rt.rows.find((r) => r.name === name)!.values[col]!;
      const back = col - 3;
      const was = back >= 0 ? rt.rows.find((r) => r.name === name)!.values[back] : null;
      days.push({
        label: name,
        display: IN0.format(v),
        sub: was != null ? `${rt.periods[col].label} · ${IN0.format(was)} in ${rt.periods[back].label}` : rt.periods[col].label,
        receipt: cellReceipt(sd, "ratios", rt, name, col, `${IN0.format(v)} days`),
      });
    }
  }

  return { rows, cash, cash5y, days, notes };
}

// ---------- bull vs bear ----------

export type Point = { text: string; receipts: Receipt[]; quote?: { text: string; url: string } };
type Scored = Point & { score: number };

export function bullBear(sd: ScreenerData, guidance: CheckedItem[] = [], transcriptUrl?: string): { bull: Point[]; bear: Point[] } {
  const bull: Scored[] = [];
  const bear: Scored[] = [];
  const bank = isBank(sd);

  const g = (name: string, label: string) => sd.growth.find((x) => x.name === name)?.items.find((i) => i.label === label)?.value ?? null;
  const sales5 = g("Compounded Sales Growth", "5 Years");
  const profit5 = g("Compounded Profit Growth", "5 Years");
  const salesTtm = g("Compounded Sales Growth", "TTM");
  const profitTtm = g("Compounded Profit Growth", "TTM");
  const gr = (name: string, label: string, v: number) => growthReceipt(sd, name, label, `${v}%`);
  const Top = bank ? "Revenue" : "Sales";
  const top = Top.toLowerCase();

  if (sales5 !== null) {
    if (sales5 >= 15) bull.push({ score: sales5, text: `${Top} compounded ${sales5}% a year over 5 years.`, receipts: [gr("Compounded Sales Growth", "5 Years", sales5)!] });
    else if (sales5 < 7) bear.push({ score: 10 - sales5, text: `${Top} grew only ${sales5}% a year over 5 years.`, receipts: [gr("Compounded Sales Growth", "5 Years", sales5)!] });
  }
  if (sales5 !== null && profit5 !== null && profit5 >= sales5 + 3) {
    bull.push({ score: profit5 - sales5 + 8, text: `Profit (${profit5}% a year) has outgrown ${top} (${sales5}%) over 5 years.`, receipts: [gr("Compounded Profit Growth", "5 Years", profit5)!, gr("Compounded Sales Growth", "5 Years", sales5)!] });
  } else if (sales5 !== null && profit5 !== null && profit5 <= sales5 - 5) {
    bear.push({ score: sales5 - profit5 + 8, text: `Profit (${profit5}% a year) has lagged ${top} (${sales5}%) over 5 years.`, receipts: [gr("Compounded Profit Growth", "5 Years", profit5)!, gr("Compounded Sales Growth", "5 Years", sales5)!] });
  }
  if (salesTtm !== null && salesTtm < 0) bear.push({ score: 20 - salesTtm, text: `${Top} shrank ${Math.abs(salesTtm)}% over the last 12 months.`, receipts: [gr("Compounded Sales Growth", "TTM", salesTtm)!] });
  if (profitTtm !== null && profitTtm < 0) bear.push({ score: 20 - profitTtm, text: `Profit fell ${Math.abs(profitTtm)}% over the last 12 months.`, receipts: [gr("Compounded Profit Growth", "TTM", profitTtm)!] });
  if (salesTtm !== null && salesTtm >= 20) bull.push({ score: salesTtm, text: `${Top} up ${salesTtm}% over the last 12 months.`, receipts: [gr("Compounded Sales Growth", "TTM", salesTtm)!] });

  const ratio = (name: string) => sd.topRatios.find((t) => t.name === name)?.value ?? null;
  const roce = ratio("ROCE");
  const roe = ratio("ROE");
  const pe = ratio("Stock P/E");
  if (!bank && roce !== null) {
    if (roce >= 20) bull.push({ score: roce, text: `Returns on capital are high: ROCE ${roce}%.`, receipts: [topRatioReceipt(sd, "ROCE", `${roce}%`)!] });
    else if (roce < 10) bear.push({ score: 20 - roce, text: `Returns on capital are thin: ROCE ${roce}%.`, receipts: [topRatioReceipt(sd, "ROCE", `${roce}%`)!] });
  }
  if (bank && roe !== null) {
    if (roe >= 15) bull.push({ score: roe, text: `ROE of ${roe}%.`, receipts: [topRatioReceipt(sd, "ROE", `${roe}%`)!] });
    else if (roe < 12) bear.push({ score: 20 - roe, text: `ROE is ${roe}%, below 12%.`, receipts: [topRatioReceipt(sd, "ROE", `${roe}%`)!] });
  }
  if (pe !== null && pe >= 60) bear.push({ score: pe / 4, text: `Valuation is rich at ${pe}x earnings.`, receipts: [topRatioReceipt(sd, "Stock P/E", `${pe}x`)!] });

  // Latest-quarter margin vs a year ago.
  const q = sd.quarters;
  if (q && findRow(q, "OPM %")) {
    const li = q.periods.length - 1;
    const yi = indexOfKey(q, q.periods[li].key ? shiftQuarterEnd(q.periods[li].key!, 12) : null);
    const opm = findRow(q, "OPM %")!;
    const now = opm.values[li];
    const then = yi >= 0 ? opm.values[yi] : null;
    if (now != null && then != null && Math.abs(now - then) >= 2) {
      const rc = [cellReceipt(sd, "quarters", q, "OPM %", li)!, cellReceipt(sd, "quarters", q, "OPM %", yi)!];
      const t = `Operating margin ${now}% in ${q.periods[li].label} vs ${then}% a year earlier.`;
      (now > then ? bull : bear).push({ score: Math.abs(now - then) * 3, text: t, receipts: rc });
    }
  }

  const bv = balanceView(sd);
  const de = bv.rows.find((r) => r.label === "Debt to equity");
  if (de?.receipt) {
    const v = Number(de.display.replace(/[^\d.]/g, ""));
    if (v <= 0.1) bull.push({ score: 15, text: `Almost no debt: debt to equity ${de.display}.`, receipts: [de.receipt] });
    else if (v >= 1) bear.push({ score: 10 + v * 5, text: `Leveraged: debt to equity ${de.display}.`, receipts: [de.receipt] });
  }
  if (bv.cash5y?.receipt) {
    const v = Number(bv.cash5y.display.replace("%", ""));
    if (v >= 90) bull.push({ score: 14, text: `Profits turn into cash: ${bv.cash5y.display} cash conversion over ${bv.cash.length} years.`, receipts: [bv.cash5y.receipt] });
    else if (v < 60) bear.push({ score: 18, text: `Weak cash conversion: ${bv.cash5y.display} of profit came in as operating cash over ${bv.cash.length} years.`, receipts: [bv.cash5y.receipt] });
  }
  const wc = bv.days.find((d) => d.label === "Working Capital Days");
  const rt = sd.ratios;
  if (wc && rt) {
    const col = lastFilled(rt, "Working Capital Days");
    const row = findRow(rt, "Working Capital Days")!;
    const was = col - 3 >= 0 ? row.values[col - 3] : null;
    const now = row.values[col];
    if (was != null && now != null && now - was >= 20) {
      bear.push({ score: 12, text: `Working capital days rose from ${was} to ${now} in 3 years.`, receipts: [cellReceipt(sd, "ratios", rt, "Working Capital Days", col - 3)!, cellReceipt(sd, "ratios", rt, "Working Capital Days", col)!] });
    }
  }

  // Guidance verdicts, each backed by a checked quote.
  for (const it of guidance) {
    if (!transcriptUrl || it.delivered?.actual == null) continue;
    const quote = { text: it.quote, url: transcriptUrl };
    const target = it.low !== null && it.high !== null ? `${it.low}–${it.high}%` : `${it.low ?? it.high}%`;
    const text = `Guided ${it.delivered.measure.toLowerCase()} of ${target}; delivered ${it.delivered.actual}% (${it.delivered.actualLabel.toLowerCase()}).`;
    const rc = calcReceipt(it.delivered.measure, `${it.delivered.actual}%`, it.delivered.formula, []);
    if (it.verdict === "on_track") bull.push({ score: 16, text, receipts: [rc], quote });
    if (it.verdict === "missed") bear.push({ score: 22, text, receipts: [rc], quote });
  }

  const best = (xs: Scored[]) => xs.sort((a, b) => b.score - a.score).slice(0, 3).map(({ score: _s, ...p }) => (void _s, p));
  return { bull: best(bull), bear: best(bear) };
}

export { signed as signedPct };
