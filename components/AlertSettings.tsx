"use client";

import { CATEGORIES, CATEGORY_LABEL, CATEGORY_TIER, type Category } from "@/lib/classify";
import { DEFAULT_SETTINGS, PRICE_LIMITS, VOLUME_LIMITS, saveSettings, type Settings } from "@/lib/settings";

function Stepper({
  label,
  value,
  suffix,
  limits,
  onChange,
}: {
  label: string;
  value: number;
  suffix: string;
  limits: { min: number; max: number; step: number };
  onChange: (n: number) => void;
}) {
  const btn = "flex size-8 items-center justify-center rounded-lg bg-fill text-[17px] font-semibold disabled:opacity-40";
  return (
    <div className="flex min-h-11 items-center justify-between gap-3 py-1.5">
      <span className="text-[15px]">{label}</span>
      <div className="flex items-center gap-2">
        <button type="button" aria-label={`Decrease ${label}`} className={btn} disabled={value <= limits.min} onClick={() => onChange(value - limits.step)}>
          −
        </button>
        <span className="w-12 text-center text-[15px] font-semibold">
          {value}
          {suffix}
        </span>
        <button type="button" aria-label={`Increase ${label}`} className={btn} disabled={value >= limits.max} onClick={() => onChange(value + limits.step)}>
          +
        </button>
      </div>
    </div>
  );
}

function Toggle({ label, on, onChange }: { label: string; on: boolean; onChange: (on: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)} className="flex min-h-11 w-full items-center justify-between gap-3 py-1.5 text-left">
      <span className="text-[15px]">{label}</span>
      <span className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${on ? "bg-accent" : "bg-divider"}`}>
        <span className={`absolute top-0.5 size-5 rounded-full bg-white transition-[left] ${on ? "left-[18px]" : "left-0.5"}`} />
      </span>
    </button>
  );
}

const GROUPS: { title: string; tiers: number[] }[] = [
  { title: "Important filings", tiers: [1] },
  { title: "Notable filings", tiers: [2] },
  { title: "Other filings", tiers: [3] },
  { title: "Routine filings", tiers: [4] },
];

export default function AlertSettings({ settings }: { settings: Settings }) {
  const set = (patch: Partial<Settings>) => saveSettings({ ...settings, ...patch });
  const setCat = (c: Category, on: boolean) => set({ categories: { ...settings.categories, [c]: on } });

  return (
    <details className="group mt-4">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between border-b border-divider text-[13px] font-semibold uppercase tracking-[0.04em] text-muted">
        <span>Alert settings</span>
        <span className="font-normal normal-case tracking-normal">
          Move {settings.priceMovePct}% · Vol {settings.volumeX}x{" "}
          <span className="inline-block transition-transform group-open:rotate-90">›</span>
        </span>
      </summary>
      <div className="divide-y divide-divider">
        <Stepper label="Price move" value={settings.priceMovePct} suffix="%" limits={PRICE_LIMITS} onChange={(n) => set({ priceMovePct: n })} />
        <Stepper label="Volume vs 20D avg" value={settings.volumeX} suffix="x" limits={VOLUME_LIMITS} onChange={(n) => set({ volumeX: n })} />
      </div>
      {GROUPS.map((g) => (
        <div key={g.title} className="mt-3">
          <p className="border-b border-divider pb-1 text-[12px] font-medium text-muted">{g.title}</p>
          <div className="divide-y divide-divider">
            {CATEGORIES.filter((c) => g.tiers.includes(CATEGORY_TIER[c])).map((c) => (
              <Toggle key={c} label={CATEGORY_LABEL[c]} on={settings.categories[c]} onChange={(on) => setCat(c, on)} />
            ))}
          </div>
        </div>
      ))}
      <div className="mt-2 flex items-center justify-between">
        <p className="text-[12px] text-muted">Saved on this device. The Brief uses the same numbers.</p>
        <button type="button" className="min-h-11 text-[13px] font-medium text-accent" onClick={() => saveSettings(DEFAULT_SETTINGS)}>
          Reset
        </button>
      </div>
    </details>
  );
}
