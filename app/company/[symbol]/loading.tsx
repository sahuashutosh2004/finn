import { Skeleton, SkeletonList } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <main className="pt-4" aria-busy>
      <Skeleton className="h-6 w-28" />
      <Skeleton className="mt-2 h-3.5 w-52" />
      <Skeleton className="mt-5 h-9 w-40" />
      <Skeleton className="mt-2 h-4 w-56" />
      <Skeleton className="mt-3 h-[200px] w-full rounded-lg" />
      <Skeleton className="mt-6 h-8 w-full rounded-lg" />
      <div className="mt-6">
        <SkeletonList rows={4} />
      </div>
    </main>
  );
}
