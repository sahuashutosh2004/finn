import type { ReactNode } from "react";

export default function Code({ children }: { children: ReactNode }) {
  return (
    <code className="whitespace-nowrap rounded bg-fill px-1.5 font-sans py-0.5 text-[12px] font-medium text-fg">
      {children}
    </code>
  );
}
