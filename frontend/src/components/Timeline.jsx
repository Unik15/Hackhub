import React from "react";
import { Check } from "lucide-react";
import { safeFormatDate, isPastDate } from "@/utils/date";

/**
 * Accepts either:
 *  - hackathon.timeline: [{ label, date, done }]   (preferred, from API)
 *  - or falls back to startDate/endDate if the API doesn't send a timeline.
 */
export default function Timeline({ hackathon }) {
  const steps = buildSteps(hackathon);

  if (steps.length === 0) {
    return <p className="text-sm text-muted-foreground">Timeline not available yet.</p>;
  }

  return (
    <div className="relative pl-2">
      {steps.map((step, i) => {
        const isLast = i === steps.length - 1;
        return (
          <div key={`${step.label}-${i}`} className="relative flex gap-4 pb-7 last:pb-0">
            {!isLast && (
              <span
                className={`absolute left-[11px] top-6 h-full w-px ${step.done ? "bg-primary" : "bg-border"}`}
              />
            )}
            <span
              className={`z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${
                step.done ? "border-primary bg-primary" : "border-border bg-background"
              }`}
            >
              {step.done && <Check size={12} className="text-primary-foreground" strokeWidth={3} />}
            </span>
            <div className="-mt-0.5">
              <p className={`text-sm font-ui font-medium ${step.done ? "text-foreground" : "text-muted-foreground"}`}>
                {step.label}
              </p>
              {step.date && <p className="text-xs text-muted-foreground/80">{step.date}</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function buildSteps(hackathon) {
  if (Array.isArray(hackathon?.timeline) && hackathon.timeline.length > 0) {
    return hackathon.timeline;
  }

  // Fallback for APIs that only send startDate / endDate — skips any step
  // whose date is missing/malformed instead of rendering a broken row.
  const steps = [];
  if (hackathon?.startDate) {
    const date = safeFormatDate(hackathon.startDate);
    if (date) steps.push({ label: "Hacking begins", date, done: isPastDate(hackathon.startDate) });
  }
  if (hackathon?.endDate) {
    const date = safeFormatDate(hackathon.endDate);
    if (date) steps.push({ label: "Submissions close", date, done: isPastDate(hackathon.endDate) });
  }
  return steps;
}
