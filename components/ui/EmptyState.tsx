import type { ReactNode } from "react";

type Props = {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
};

export default function EmptyState({ title, description, action }: Props) {
  return (
    <div className="py-8 text-center">
      <p className="text-[15px] font-semibold">{title}</p>
      {description ? <div className="mx-auto mt-1 max-w-[300px] text-[13px] leading-5 text-muted">{description}</div> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
