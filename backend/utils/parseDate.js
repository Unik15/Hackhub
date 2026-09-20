// backend/utils/parseDate.js
// Production-ready date parser that normalizes many human date formats to ISO (UTC).
// Returns ISO string (e.g. "2026-08-13T00:00:00.000Z") or null on failure.

/**
 * Options:
 *  - dayFirst: boolean (true = dd/mm/yyyy default; false = mm/dd/yyyy)
 *  - twoDigitYear: boolean (true => map 2-digit years like "26" -> 2026 using windowing)
 */
export function parseDateStringToISO(text, opts = {}) {
  const options = {
    dayFirst: opts.dayFirst === undefined ? true : Boolean(opts.dayFirst),
    twoDigitYear: opts.twoDigitYear === undefined ? true : Boolean(opts.twoDigitYear),
  };

  if (!text || typeof text !== "string") return null;

  const s = String(text).trim().replace(/\s+/g, " ");
  if (s.length === 0) return null;

  // Helper map for textual months
  const MONTH_MAP = {
    jan: 0, january: 0,
    feb: 1, february: 1,
    mar: 2, march: 2,
    apr: 3, april: 3,
    may: 4,
    jun: 5, june: 5,
    jul: 6, july: 6,
    aug: 7, august: 7,
    sep: 8, sept: 8, september: 8,
    oct: 9, october: 9,
    nov: 10, november: 10,
    dec: 11, december: 11
  };

  // Convert components to a UTC ISO (safe & deterministic)
  function toISOFromComponents(y, m, d, hh = 0, mm = 0, ss = 0, ms = 0) {
    const dt = new Date(Date.UTC(y, m, d, hh, mm, ss, ms));
    return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
  }

  // Resolve two-digit year using conventional windowing:
  // 00..69 => 2000..2069, 70..99 => 1970..1999 (matches many JS behaviours)
  function resolveTwoDigitYear(yy) {
    const n = Number(yy);
    if (Number.isNaN(n)) return null;
    return n <= 69 ? 2000 + n : 1900 + n;
  }

  // 1) Strict ISO / RFC-like detection (YYYY-MM-DD optionally with time/timezone)
  if (/^\d{4}-\d{2}-\d{2}([Tt ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+\-]\d{2}:?\d{2})?)?$/.test(s)) {
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }

  // 2) Try Date.parse fallback for strings that clearly include time or timezone
  // If input contains time or timezone token, we accept native parse result.
  if (/[Tt ]\d{1,2}:\d{2}/.test(s) || /[zZ]|[+\-]\d{2}:?\d{2}/.test(s)) {
    const dn = new Date(s);
    if (!Number.isNaN(dn.getTime())) return dn.toISOString();
  }

  // 3) Numeric date patterns: dd-mm-yyyy or mm-dd-yyyy or dd/mm/yyyy or mm/dd/yyyy or dd.mm.yyyy
  // Accept 2 or 4 digit year.
  const numericRx = /^(\d{1,2})[\/\-\.\s](\d{1,2})[\/\-\.\s](\d{2,4})$/;
  const mNum = s.match(numericRx);
  if (mNum) {
    let [ , a, b, c ] = mNum;
    if (c.length === 2 && options.twoDigitYear) {
      c = String(resolveTwoDigitYear(c));
    }
    const nA = Number(a), nB = Number(b), nC = Number(c);
    if (Number.isNaN(nA) || Number.isNaN(nB) || Number.isNaN(nC)) return null;

    if (options.dayFirst) {
      // a = day, b = month
      const dd = nA, mm = nB - 1, yy = nC;
      return toISOFromComponents(yy, mm, dd);
    } else {
      // a = month, b = day
      const dd = nB, mm = nA - 1, yy = nC;
      return toISOFromComponents(yy, mm, dd);
    }
  }

  // 4) Textual month patterns:
  // supports: "12 Aug 2026", "12th August 2026", "Aug 12, 2026", "August 12 2026 10:30"
  const textMonthRx = /^(?:(\d{1,2})(?:st|nd|rd|th)?[ ,\-]*)?([A-Za-z]{3,9})[ ,\-]*(\d{2,4})(?:[ ,\-]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/i;
  const mText = s.match(textMonthRx);
  if (mText) {
    let [ , maybeDay, mon, yr, hh, mi, ss ] = mText;
    mon = mon.toLowerCase();
    const monIndex = MONTH_MAP[mon];
    if (typeof monIndex === "number") {
      const day = maybeDay ? Number(maybeDay) : 1;
      let year = String(yr);
      if (year.length === 2 && options.twoDigitYear) year = String(resolveTwoDigitYear(year));
      const yNum = Number(year);
      if (Number.isNaN(yNum)) return null;
      const hour = hh ? Number(hh) : 0;
      const minute = mi ? Number(mi) : 0;
      const second = ss ? Number(ss) : 0;
      return toISOFromComponents(yNum, monIndex, day, hour, minute, second);
    }
  }

  // 5) Month + Year only e.g. "Aug 2026" -> pick first day of month
  const monthYearRx = /^([A-Za-z]{3,9})[ ,\-]+(\d{4}|\d{2})$/i;
  const mMy = s.match(monthYearRx);
  if (mMy) {
    const [, mon, yr] = mMy;
    const monIdx = MONTH_MAP[mon.toLowerCase()];
    if (typeof monIdx === "number") {
      let year = String(yr);
      if (year.length === 2 && options.twoDigitYear) year = String(resolveTwoDigitYear(year));
      const yNum = Number(year);
      if (Number.isNaN(yNum)) return null;
      return toISOFromComponents(yNum, monIdx, 1);
    }
  }

  // 6) Year-only
  if (/^\d{4}$/.test(s)) {
    return toISOFromComponents(Number(s), 0, 1); // Jan 1 of that year
  }

  // 7) last-resort: try native parse once more
  const dLast = new Date(s);
  if (!Number.isNaN(dLast.getTime())) return dLast.toISOString();

  // give up
  return null;
}