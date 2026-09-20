// backend/utils/normalizer.js
import { z } from "zod";
import { parseDateStringToISO } from "./parseDate.js";

// -----------------------------
// CONFIG
// -----------------------------
const DEBUG = process.env.NORMALIZER_DEBUG === "true";

// -----------------------------
// TEXT NORMALIZATION
// -----------------------------
export function normalizeText(s) {
  if (!s) return null;

  const t = String(s)
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return t === "" ? null : t;
}

// -----------------------------
// URL NORMALIZATION (FIXED)
// -----------------------------
export function normalizeUrl(rawUrl, baseUrl = null) {
  if (!rawUrl || typeof rawUrl !== "string") return null;

  try {
    const u = new URL(rawUrl, baseUrl || undefined);

    // remove tracking
    [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
      "fbclid",
      "gclid",
    ].forEach((p) => u.searchParams.delete(p));

    u.hash = "";

    return u.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

// -----------------------------
// ZOD SCHEMA
// -----------------------------
export const ItemSchema = z.object({
  title: z.string().min(1),
  url: z.string().url(),
  platform: z.string(),
  isOnline: z.boolean().nullable(),
  locationCity: z.string().nullable(),
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  organizer: z.string().nullable(),
  source: z.string(),
  scrapedAt: z.string(),
  _meta: z.any().optional(),
});

// -----------------------------
// DEDUP (SAFE DEFAULT)
// -----------------------------
const moduleSeen = new Set();

export function resetNormalizerSeen() {
  moduleSeen.clear();
}

// -----------------------------
// MAIN FUNCTION
// -----------------------------
export function addResult(raw, opts = {}) {
  const {
    seen = moduleSeen,
    minConfidence = 40,
    baseUrl = null,
  } = opts;

  if (!raw || typeof raw !== "object") return null;

  // -----------------------------
  // CONFIDENCE FILTER
  // -----------------------------
  const confidence = raw._meta?.confidence ?? 50;
  if (confidence < minConfidence) return null;

  // -----------------------------
  // BASIC FIELDS
  // -----------------------------
  const title = normalizeText(raw.title);

  const url = normalizeUrl(
    raw.url || raw.link || raw.href,
    baseUrl
  );

  if (!title || title.length < 5 || !url) {
    debug("Rejected: invalid title/url", raw);
    return null;
  }

  // -----------------------------
  // TEXT FIELDS
  // -----------------------------
  const locationCity = normalizeText(
    raw.locationCity || raw.location || raw.venue
  );

  const organizer = normalizeText(
    raw.organizer || raw.source_organizer
  );

  // -----------------------------
  // DATE PARSING (SAFE)
  // -----------------------------
  const rawStart =
    raw.startDate ||
    raw.start ||
    raw._meta?.rawStartText ||
    raw.rawStartText;

  const rawEnd =
    raw.endDate ||
    raw.deadlineText ||
    raw.end ||
    raw._meta?.rawEndText ||
    raw.rawEndText;

  let startISO = null;
  let endISO = null;

  try {
    if (rawStart) {
      startISO = parseDateStringToISO(String(rawStart));
    }
  } catch {}

  try {
    if (rawEnd) {
      endISO = parseDateStringToISO(String(rawEnd));
    }
  } catch {}

  // Fix invalid range
  if (startISO && endISO) {
    try {
      if (new Date(startISO) > new Date(endISO)) {
        endISO = null;
      }
    } catch {}
  }

  // -----------------------------
  // ONLINE MODE FIX (IMPORTANT)
  // -----------------------------
  let isOnline = null;

  if (typeof raw.isOnline === "boolean") {
    isOnline = raw.isOnline;
  } else if (raw.mode === "online") {
    isOnline = true;
  } else if (raw.mode === "offline") {
    isOnline = false;
  }

  // -----------------------------
  // BUILD FINAL ITEM
  // -----------------------------
  const item = {
    title,
    url,
    platform: raw.platform || "unknown",
    source: raw.source || raw.platform || "unknown",

    isOnline,
    locationCity: locationCity || null,

    startDate: startISO || null,
    endDate: endISO || null,

    organizer: organizer || null,

    scrapedAt: raw.scrapedAt || new Date().toISOString(),

    _meta: raw._meta || {},
  };

  // -----------------------------
  // VALIDATION (BEFORE DEDUP) ✅ FIX
  // -----------------------------
  try {
    ItemSchema.parse(item);
  } catch (err) {
    debug("Validation failed", err.errors || err);
    return null;
  }

  // -----------------------------
  // DEDUP AFTER VALIDATION ✅ FIX
  // -----------------------------
  if (seen.has(url)) {
    debug("Duplicate skipped", url);
    return null;
  }

  seen.add(url);

  return item;
}

// -----------------------------
// DEBUG LOGGER
// -----------------------------
function debug(msg, data) {
  if (DEBUG) {
    console.warn(`[NORMALIZER] ${msg}`, data || "");
  }
}