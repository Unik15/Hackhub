import { parseDateStringToISO } from "./parseDate.js";

/**
 * Sources hand us a display string, not two dates. Devpost's submission period
 * reads "Jan 01 - Mar 15, 2026"; a college event card often reads "Mar 15, 2026".
 * `new Date()` cannot parse the first form at all, which is why 160 of the 161
 * crawled rows ended up with no dates.
 *
 * En/em dashes are unambiguous separators, so they do not need surrounding
 * spaces. A plain hyphen does: it is also the separator inside ISO dates
 * ("2026-01-01"), and "to"/"until" need spaces so they cannot match inside a
 * word like "today".
 */
const RANGE_SEPARATOR = /\s+(?:-|to|until)\s+|\s*[–—]\s*/i;
const YEAR = /\b(?:19|20)\d{2}\b/;

/**
 * @returns {{ start: string|null, end: string|null }} ISO strings.
 */
export function parseDateRange(text) {
  const raw = typeof text === "string" ? text.trim().replace(/\s+/g, " ") : "";
  if (!raw) return { start: null, end: null };

  const parts = raw.split(RANGE_SEPARATOR).map((part) => part.trim()).filter(Boolean);

  if (parts.length === 2) {
    // "Jan 01 - Mar 15, 2026" puts the year on the right-hand side only, so
    // borrow it for whichever half is missing one.
    const year = (raw.match(YEAR) || [])[0];
    const withYear = (part) => (YEAR.test(part) || !year ? part : `${part} ${year}`);

    const start = parseDateStringToISO(withYear(parts[0]));
    const end = parseDateStringToISO(withYear(parts[1]));

    if (start && end) {
      // An inverted range means the source is ambiguous. Keep the start only:
      // writing it through would violate the check_dates constraint and lose
      // the whole listing.
      return new Date(end) >= new Date(start) ? { start, end } : { start, end: null };
    }

    return { start: start || null, end: end || null };
  }

  // A single date has no range to split. Treat it as the event's start; an end
  // date is deliberately not invented from it.
  return { start: parseDateStringToISO(raw), end: null };
}
