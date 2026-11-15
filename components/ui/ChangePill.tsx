import { changeTone, formatPct } from "@/lib/format";

const TONES = {
  up: "bg-up text-white",
  down: "bg-down text-white",
  flat: "bg-fill text-muted",
};

export default function ChangePill({ pct }: { pct: number | null }) {
  return (
    <span
      className={`inline-flex h-6 min-w-[68px] items-center justify-center rounded-md px-1.5 text-[13px] font-semibold ${TONES[changeTone(pct)]}`}
    >
      {formatPct(pct)}
    </span>
  );
}
