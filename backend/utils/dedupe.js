/**
 * In-process duplicate suppression for the engagement endpoints.
 *
 * These routes used a Postgres-side window (`created_at >= now() - 2s`) built
 * from the API host's clock. Any skew between the API host and the database
 * silently disables the check — a host running ~80s fast matched nothing and
 * every "duplicate" was recorded. Keeping the window on one clock removes that
 * failure mode entirely and saves a round trip on a hot path.
 *
 * Scope is per process. On a multi-instance deployment two requests landing on
 * different instances can both be recorded; that only ever adds a duplicate
 * engagement row, which is acceptable for counters.
 */

const DEFAULT_WINDOW_MS = 2000;
const MAX_TRACKED_KEYS = 10000;

const seen = new Map();

export function isDuplicate(key, windowMs = DEFAULT_WINDOW_MS) {
  if (!key) return false;

  const now = Date.now();
  const last = seen.get(key);

  if (last !== undefined && now - last < windowMs) {
    return true;
  }

  seen.set(key, now);

  // Bound memory: drop expired entries, and reset outright if a burst of
  // unique keys filled the map faster than they expire.
  if (seen.size > MAX_TRACKED_KEYS) {
    for (const [entry, at] of seen) {
      if (now - at >= windowMs) seen.delete(entry);
    }
    if (seen.size > MAX_TRACKED_KEYS) seen.clear();
  }

  return false;
}
