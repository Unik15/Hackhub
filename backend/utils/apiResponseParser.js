/**
 * Response parsing for API sources. We don't have a confirmed schema for
 * any candidate endpoint (see the honest caveat in apiSourceService.js), so
 * this deliberately tries common conventions rather than assuming one exact
 * shape — the same "flexible + fallback" philosophy as the HTML selector
 * layer, just applied to JSON instead of the DOM.
 */

/** Finds the actual array of listing items inside an arbitrary response shape. */
function extractItemArray(data, depth = 0) {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== "object" || depth > 2) return [];

  const commonKeys = ["results", "data", "hackathons", "items", "opportunities", "listings", "events"];
  for (const key of commonKeys) {
    if (Array.isArray(data[key])) return data[key];
  }

  // One level deeper, e.g. { data: { results: [...] } } — bounded by `depth`
  // so a pathological response can't recurse forever.
  for (const value of Object.values(data)) {
    if (value && typeof value === "object") {
      const nested = extractItemArray(value, depth + 1);
      if (nested.length) return nested;
    }
  }

  return [];
}

function extractField(item, keys) {
  for (const key of keys) {
    const value = item?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return "";
}

/**
 * Best-effort mapping of an arbitrary API item into the same raw shape the
 * HTML scrapers produce ({ title, link, source, mode, ... }) — so API
 * results flow through the exact same normalize() → validateRawHackathon()
 * → dedupeWithinRun() pipeline in crawlers/index.js with zero special-casing
 * downstream.
 */
export function parseApiHackathonList(data, { source } = {}) {
  const items = extractItemArray(data);

  return items
    .map((item) => {
      const title = extractField(item, ["title", "name", "event_name", "eventName"]);
      const link = extractField(item, ["url", "link", "permalink", "event_url", "eventUrl", "web_url"]);
      const deadlineText = extractField(item, [
        "deadline",
        "registration_deadline",
        "registrationDeadline",
        "end_date",
        "endDate",
      ]);
      const location = extractField(item, ["location", "city", "venue"]);
      const organizer = extractField(item, ["organizer", "host", "organization", "org_name"]);
      const prizePool = extractField(item, ["prize", "prize_pool", "prizePool", "prize_amount"]);

      return {
        title,
        link,
        deadlineText,
        location: location || "Online",
        mode: /online/i.test(location || "") ? "online" : location ? "offline" : "online",
        organizer,
        prizePool,
        source,
      };
    })
    .filter((h) => h.title && h.link); // full validateRawHackathon() runs at the call site, this just drops obviously-empty rows early
}
