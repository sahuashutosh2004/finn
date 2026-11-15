"use client";

import type { KeyboardEvent, MouseEvent, ReactNode } from "react";
import ReceiptView from "@/components/ReceiptView";
import { useSheet } from "@/components/ui/Sheet";
import type { Receipt } from "@/lib/receipts";

/** A number you can tap to see where it came from. Renders as a span so it can sit inside links and rows. */
export default function Num({ r, children, className = "" }: { r: Receipt | null | undefined; children: ReactNode; className?: string }) {
  const sheet = useSheet();
  if (!r) return <span className={className}>{children}</span>;

  const open = (e: MouseEvent | KeyboardEvent) => {
    e.preventDefault();
    e.stopPropagation();
    sheet.open(<ReceiptView r={r} />, "Where this number comes from");
  };

  return (
    <span
      role="button"
      tabIndex={0}
      aria-label={`${r.label}: ${r.value}. Show source`}
      onClick={open}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && open(e)}
      className={`-mx-0.5 cursor-pointer rounded-[4px] px-0.5 transition-colors duration-150 active:bg-accent/15 ${className}`}
    >
      {children}
    </span>
  );
}
