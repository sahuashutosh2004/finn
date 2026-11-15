export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden className={`shimmer rounded ${className}`} />;
}

export function SkeletonRow() {
  return (
    <div className="flex min-h-11 items-center gap-3 py-2">
      <div className="flex-1 space-y-1.5">
        <Skeleton className="h-3.5 w-20" />
        <Skeleton className="h-3 w-36" />
      </div>
      <div className="flex flex-col items-end space-y-1.5">
        <Skeleton className="h-3.5 w-14" />
        <Skeleton className="h-3 w-10" />
      </div>
    </div>
  );
}

export function SkeletonList({ rows = 6 }: { rows?: number }) {
  return (
    <div role="status" aria-label="Loading" className="divide-y divide-divider">
      {Array.from({ length: rows }, (_, i) => (
        <SkeletonRow key={i} />
      ))}
    </div>
  );
}
