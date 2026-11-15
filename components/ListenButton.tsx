"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";

const LIMIT_MS = 45_000;

/** Reads the brief aloud with the phone's own voice (en-IN when available). No model involved. */
export default function ListenButton({ script }: { script: string }) {
  const [speaking, setSpeaking] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => () => window.speechSynthesis?.cancel(), []);

  const stop = () => {
    window.speechSynthesis.cancel();
    if (timer.current) window.clearTimeout(timer.current);
    setSpeaking(false);
  };

  const play = () => {
    if (!("speechSynthesis" in window)) return;
    const synth = window.speechSynthesis;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(script);
    u.lang = "en-IN";
    const voices = synth.getVoices();
    u.voice = voices.find((v) => v.lang === "en-IN") ?? voices.find((v) => v.lang.replace("_", "-").startsWith("en-IN")) ?? null;
    u.rate = 1.02;
    u.onend = stop;
    u.onerror = stop;
    synth.speak(u);
    setSpeaking(true);
    timer.current = window.setTimeout(stop, LIMIT_MS);
  };

  return (
    <button
      type="button"
      onClick={speaking ? stop : play}
      aria-label={speaking ? "Stop reading" : "Listen to the brief"}
      className="flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-fill px-3.5 text-[13px] font-semibold transition-opacity duration-150 active:opacity-60"
    >
      {speaking ? <Pause size={14} aria-hidden /> : <Play size={14} className="fill-current" aria-hidden />}
      {speaking ? "Stop" : "Listen"}
    </button>
  );
}
