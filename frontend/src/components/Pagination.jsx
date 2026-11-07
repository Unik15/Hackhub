import React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/utils/cn";
import { ELLIPSIS, getPageItems } from "@/utils/pagination";

const controlClasses =
  "inline-flex h-9 min-w-9 items-center justify-center rounded-md border px-2.5 text-sm font-ui font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-40";

export default function Pagination({
  currentPage,
  totalPages,
  totalItems,
  pageSize = 21,
  onPageChange,
}) {
  if (totalPages < 1) return null;

  const items = getPageItems(currentPage, totalPages);
  const firstItem = (currentPage - 1) * pageSize + 1;
  const lastItem = Math.min(currentPage * pageSize, totalItems);

  return (
    <div className="mt-10 flex flex-col items-center gap-3 border-t border-border pt-6">
      <nav
        aria-label="Hackathon pagination"
        className="flex flex-wrap items-center justify-center gap-1.5 sm:gap-2"
      >
        <button
          type="button"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          aria-label="Previous page"
          className={cn(
            controlClasses,
            "gap-1.5 border-border bg-card text-foreground hover:bg-muted"
          )}
        >
          <ChevronLeft size={15} aria-hidden="true" />
          <span className="hidden sm:inline">Previous</span>
        </button>

        {items.map((item, index) =>
          item === ELLIPSIS ? (
            <span
              key={`ellipsis-${index}`}
              aria-hidden="true"
              className="inline-flex h-9 min-w-9 items-center justify-center text-sm font-ui text-muted-foreground"
            >
              …
            </span>
          ) : (
            <button
              key={item}
              type="button"
              onClick={() => onPageChange(item)}
              aria-label={`Go to page ${item}`}
              aria-current={item === currentPage ? "page" : undefined}
              className={cn(
                controlClasses,
                item === currentPage
                  ? "border-primary bg-primary text-primary-foreground hover:brightness-95"
                  : "border-border bg-card text-foreground hover:bg-muted"
              )}
            >
              {item}
            </button>
          )
        )}

        <button
          type="button"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          aria-label="Next page"
          className={cn(
            controlClasses,
            "gap-1.5 border-border bg-card text-foreground hover:bg-muted"
          )}
        >
          <span className="hidden sm:inline">Next</span>
          <ChevronRight size={15} aria-hidden="true" />
        </button>
      </nav>

      <p className="font-ui text-xs text-muted-foreground" aria-live="polite">
        Page {currentPage} of {totalPages} · Showing {firstItem}–{lastItem} of {totalItems}
      </p>
    </div>
  );
}
