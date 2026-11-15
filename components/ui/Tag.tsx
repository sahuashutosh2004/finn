import type { ReactNode } from "react";

type Tone = "neutral" | "accent" | "up" | "down";

const TONES: Record<Tone, string> = {
  neutral: "bg-fill text-muted",
  accent: "bg-accent/12 text-accent",
  up: "bg-up/12 text-up",
  down: "bg-down/12 text-down",
};

export default function Tag({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex h-5 shrink-0 items-center rounded px-1.5 text-[11px] font-semibold leading-none ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}
