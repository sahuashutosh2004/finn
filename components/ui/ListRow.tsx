import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";

type Props = {
  title: ReactNode;
  subtitle?: ReactNode;
  leading?: ReactNode;
  middle?: ReactNode;
  value?: ReactNode;
  valueSub?: ReactNode;
  href?: string;
  onClick?: () => void;
  chevron?: boolean;
};

export default function ListRow({
  title,
  subtitle,
  leading,
  middle,
  value,
  valueSub,
  href,
  onClick,
  chevron = false,
}: Props) {
  const body = (
    <>
      {leading ? <div className="shrink-0 text-muted">{leading}</div> : null}
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-semibold leading-5">{title}</div>
        {subtitle ? <div className="truncate text-[13px] leading-[18px] text-muted">{subtitle}</div> : null}
      </div>
      {middle}
      {value !== undefined || valueSub !== undefined ? (
        <div className="shrink-0 text-right">
          {value !== undefined ? <div className="text-[15px] font-medium leading-5">{value}</div> : null}
          {valueSub !== undefined ? <div className="mt-0.5 text-[13px] leading-[18px]">{valueSub}</div> : null}
        </div>
      ) : null}
      {chevron ? <ChevronRight size={16} className="-mr-1 shrink-0 text-muted/60" aria-hidden /> : null}
    </>
  );

  const base = "flex min-h-11 w-full items-center gap-3 py-2 text-left";
  const pressable = `${base} transition-colors active:bg-fill`;

  if (href) {
    return (
      <Link href={href} className={pressable}>
        {body}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={pressable}>
        {body}
      </button>
    );
  }
  return <div className={base}>{body}</div>;
}
