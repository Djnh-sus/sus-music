export function Skeleton({ className = "" }) {
  return <div aria-hidden="true" className={`skeleton ${className}`} />;
}

export function CardSkeleton({ fluid = false }) {
  return (
    <div className={fluid ? "w-full" : "w-40 shrink-0"}>
      <Skeleton className="mb-3 aspect-square w-full rounded-2xl" />
      <Skeleton className="mb-2 h-4 w-4/5 rounded-md" />
      <Skeleton className="h-3 w-3/5 rounded-md" />
    </div>
  );
}

export function ShelfSkeleton({ count = 6 }) {
  return (
    <section aria-busy="true" aria-label="Đang tải" className="mb-10">
      <Skeleton className="mb-4 h-7 w-44" />
      <div className="flex gap-4 overflow-hidden">
        {Array.from({ length: count }, (_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
    </section>
  );
}

export function GridSkeleton({ count = 12 }) {
  return (
    <div
      aria-busy="true"
      aria-label="Đang tải"
      className="grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-4"
    >
      {Array.from({ length: count }, (_, i) => (
        <CardSkeleton key={i} fluid />
      ))}
    </div>
  );
}

export function RowSkeleton({ count = 6 }) {
  return (
    <div aria-busy="true" aria-label="Đang tải" className="flex flex-col gap-1">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-2 py-2">
          <Skeleton className="h-12 w-20 shrink-0 rounded-lg" />
          <div className="min-w-0 flex-1">
            <Skeleton className="mb-2 h-4 w-3/5 rounded-md" />
            <Skeleton className="h-3 w-2/5 rounded-md" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8">
      <Skeleton className="mb-6 h-10 w-56" />
      <GridSkeleton />
    </div>
  );
}
