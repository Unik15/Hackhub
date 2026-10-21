function safeParseDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * "Sep 5" or "Sep 5 – Sep 7". Never throws on null, undefined, or malformed
 * date strings from the API — always returns a display-safe string.
 */
export function formatDateRange(start, end) {
  const startDate = safeParseDate(start);
  if (!startDate) return "Date to be announced";

  const opts = { month: "short", day: "numeric" };
  const startLabel = startDate.toLocaleDateString("en-US", opts);

  const endDate = safeParseDate(end);
  if (!endDate) return startLabel;

  return `${startLabel} – ${endDate.toLocaleDateString("en-US", opts)}`;
}

/**
 * Single-date formatter for timelines, deadlines, etc. Returns null (not a
 * placeholder string) so callers can decide whether to render the line at all.
 */
export function safeFormatDate(value, opts = { month: "short", day: "numeric", year: "numeric" }) {
  const d = safeParseDate(value);
  return d ? d.toLocaleDateString("en-US", opts) : null;
}

export function isPastDate(value) {
  const d = safeParseDate(value);
  return d ? d.getTime() < Date.now() : false;
}

/**
 * Whole days between now and the given date. Returns null when the date is
 * missing/invalid or already past, so callers can fall back to something
 * other than a negative or NaN count.
 */
export function daysUntil(value) {
  const d = safeParseDate(value);
  if (!d) return null;
  const diff = d.getTime() - Date.now();
  if (diff <= 0) return null;
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}
