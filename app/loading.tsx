import { Skeleton, SkeletonList } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <main className="pt-3" aria-busy>
      <Skeleton className="h-3.5 w-56" />
      <Skeleton className="mt-4 h-7 w-48" />
      <Skeleton className="mt-3 h-4 w-64" />
      <Skeleton className="mt-2 h-4 w-60" />
      <div className="mt-8">
        <SkeletonList rows={8} />
      </div>
    </main>
  );
}
