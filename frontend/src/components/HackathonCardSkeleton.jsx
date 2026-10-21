import React from "react";

export default function HackathonCardSkeleton() {
  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="h-5 w-2/3 animate-pulse rounded bg-muted" />
        <div className="h-5 w-16 shrink-0 animate-pulse rounded-full bg-muted" />
      </div>
      <div className="space-y-2">
        <div className="h-3.5 w-1/2 animate-pulse rounded bg-muted" />
        <div className="h-3.5 w-2/5 animate-pulse rounded bg-muted" />
      </div>
      <div className="mt-auto flex gap-2 pt-1">
        <div className="h-9 flex-1 animate-pulse rounded-md bg-muted" />
        <div className="h-9 flex-1 animate-pulse rounded-md bg-muted" />
      </div>
    </div>
  );
}
