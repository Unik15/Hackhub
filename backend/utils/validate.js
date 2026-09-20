/**
 * Guards against half-parsed listing cards (a selector matched but the site's
 * markup shifted underneath it) making it any further into the pipeline.
 * Kept intentionally strict but source-agnostic — each crawler produces the
 * same raw shape, so one validator covers all of them.
 */
export function validateRawHackathon(h) {
  if (!h || typeof h !== "object") return false;
  if (!h.title || typeof h.title !== "string" || !h.title.trim()) return false;
  if (!h.link || typeof h.link !== "string") return false;

  try {
    // eslint-disable-next-line no-new
    new URL(h.link);
  } catch {
    return false; // malformed/relative URL that wasn't resolved to absolute
  }

  if (!h.source) return false;

  return true;
}
