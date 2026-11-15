import type { ReactNode } from "react";

type Props = {
  title?: string;
  aside?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
};

export default function Section({ title, aside, footer, children, className = "" }: Props) {
  return (
    <section className={`mt-6 ${className}`}>
      {title || aside ? (
        <div className="flex items-end justify-between border-b border-divider pb-1.5">
          {title ? (
            <h2 className="text-[13px] font-semibold uppercase tracking-[0.04em] text-muted">{title}</h2>
          ) : (
            <span />
          )}
          {aside ? <div className="text-[13px] text-muted">{aside}</div> : null}
        </div>
      ) : null}
      <div className="divide-y divide-divider">{children}</div>
      {footer ? <p className="border-t border-divider pt-2 text-[12px] text-muted">{footer}</p> : null}
    </section>
  );
}
