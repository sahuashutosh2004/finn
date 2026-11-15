"use client";

import { useState } from "react";

type Option<T extends string> = { value: T; label: string };

type Props<T extends string> = {
  options: Option<T>[];
  value?: T;
  defaultValue?: T;
  onChange?: (value: T) => void;
  disabled?: boolean;
  label: string;
};

export default function SegmentedControl<T extends string>({
  options,
  value,
  defaultValue,
  onChange,
  disabled = false,
  label,
}: Props<T>) {
  const [internal, setInternal] = useState<T | undefined>(defaultValue ?? options[0]?.value);
  const selected = value ?? internal;

  return (
    <div
      role="radiogroup"
      aria-label={label}
      aria-disabled={disabled || undefined}
      className={`flex h-8 rounded-lg bg-fill p-0.5 ${disabled ? "opacity-50" : ""}`}
    >
      {options.map((opt) => {
        const active = opt.value === selected;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => {
              setInternal(opt.value);
              onChange?.(opt.value);
            }}
            className={`flex-1 rounded-md text-[13px] font-semibold transition-colors ${
              active ? "bg-bg text-fg ring-1 ring-divider" : "text-muted"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
