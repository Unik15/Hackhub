// =========================
// 🏷️ STATUS FROM DATES
// =========================
/**
 * Derives a listing's status from its own dates, so a crawl never publishes an
 * already-finished event as "upcoming" until the nightly expiry job catches up
 * (up to 24 hours later). Mirrors expireOld()'s rule so the two cannot disagree.
 *
 * Dependency-free on purpose: hackathonRepo re-exports it, and tests import
 * this module directly without booting the Supabase client.
 */
export function deriveStatus(startDate, endDate, now = Date.now()) {
  const start = startDate ? Date.parse(startDate) : NaN;
  const end = endDate ? Date.parse(endDate) : NaN;
  const hasStart = Number.isFinite(start);
  const hasEnd = Number.isFinite(end);

  if (!hasStart && !hasEnd) return "upcoming";

  const expired = hasEnd ? end < now : start < now;
  if (expired) return "expired";

  return hasStart && start > now ? "upcoming" : "active";
}
