"use client";

import { useRef, useState, type ReactNode } from "react";
import { Check, Pin } from "lucide-react";

const TRIGGER = 72;
const MAX = 132;

type Props = {
  children: ReactNode;
  onTap?: () => void;
  onDone: () => void;
  onPin: () => void;
  done?: boolean;
  pinned?: boolean;
  label: string;
};

/** Swipe right = done, swipe left = pin. Vertical scrolling is left to the browser. */
export default function SwipeRow({ children, onTap, onDone, onPin, done = false, pinned = false, label }: Props) {
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ x: number; y: number; id: number } | null>(null);
  const mode = useRef<"idle" | "swipe" | "scroll">("idle");
  const armed = useRef(false);
  const swallowClick = useRef(false);

  const reset = () => {
    start.current = null;
    mode.current = "idle";
    armed.current = false;
    setDragging(false);
    setDx(0);
  };

  return (
    <div className="relative overflow-hidden">
      <div aria-hidden className="absolute inset-0 flex items-stretch justify-between text-[13px] font-semibold text-white">
        <div className={`flex items-center gap-1.5 bg-up pl-4 transition-opacity duration-150 ${dx > 0 ? "opacity-100" : "opacity-0"}`} style={{ width: Math.max(0, dx) }}>
          <Check size={16} aria-hidden /> {done ? "Undo" : "Done"}
        </div>
        <div className={`flex items-center justify-end gap-1.5 bg-accent pr-4 transition-opacity duration-150 ${dx < 0 ? "opacity-100" : "opacity-0"}`} style={{ width: Math.max(0, -dx) }}>
          {pinned ? "Unpin" : "Pin"} <Pin size={15} aria-hidden />
        </div>
      </div>

      <div
        role="button"
        tabIndex={0}
        aria-label={label}
        style={{ transform: `translateX(${dx}px)`, touchAction: "pan-y" }}
        className={`relative bg-bg outline-none transition-colors active:bg-fill ${dragging ? "" : "transition-transform duration-150 ease-out"}`}
        onPointerDown={(e) => {
          if (e.pointerType === "mouse" && e.button !== 0) return;
          start.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
          mode.current = "idle";
        }}
        onPointerMove={(e) => {
          const s = start.current;
          if (!s || s.id !== e.pointerId || mode.current === "scroll") return;
          const mx = e.clientX - s.x;
          const my = e.clientY - s.y;
          if (mode.current === "idle") {
            if (Math.abs(my) > 10 && Math.abs(my) > Math.abs(mx)) {
              mode.current = "scroll";
              return;
            }
            if (Math.abs(mx) < 10) return;
            mode.current = "swipe";
            setDragging(true);
            try {
              e.currentTarget.setPointerCapture(e.pointerId);
            } catch {
              // pointer already released
            }
          }
          const sign = Math.sign(mx);
          const a = Math.abs(mx);
          const eased = a > TRIGGER ? TRIGGER + (a - TRIGGER) * 0.35 : a;
          setDx(sign * Math.min(MAX, eased));
          const nowArmed = a >= TRIGGER;
          if (nowArmed !== armed.current) {
            armed.current = nowArmed;
            if (nowArmed) navigator.vibrate?.(8);
          }
        }}
        onPointerUp={() => {
          if (mode.current === "swipe") {
            swallowClick.current = true;
            if (armed.current) (dx > 0 ? onDone : onPin)();
          }
          reset();
        }}
        onPointerCancel={reset}
        onClick={() => {
          if (swallowClick.current) {
            swallowClick.current = false;
            return;
          }
          onTap?.();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") onTap?.();
          if (e.key === "d") onDone();
          if (e.key === "p") onPin();
        }}
      >
        {children}
      </div>
    </div>
  );
}
