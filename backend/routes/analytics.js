import express from "express";
import rateLimit from "express-rate-limit";
import { adminClient } from "../config/supabase.js";
import { optionalAuth } from "../middleware/auth.js";
import { isDuplicate } from "../utils/dedupe.js";

const router = express.Router();

router.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: "Too many events, please slow down." },
  })
);

// Mirrors the valid_event_type check constraint on public.analytics_events.
const ALLOWED_EVENTS = [
  "page_view",
  "login",
  "logout",
  "signup",
  "button_click",
  "search",
  "hackathon_view",
  "hackathon_apply",
  "profile_update",
];

const DEDUPE_WINDOW_MS = 2000;
const MAX_METADATA_BYTES = 5000;
const MAX_PAGE_LENGTH = 300;

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

router.post("/track", optionalAuth, async (req, res) => {
  const { event_type, page, metadata } = req.body || {};

  if (!event_type || !page) {
    return res.status(400).json({
      success: false,
      error: "event_type and page required",
    });
  }

  if (!ALLOWED_EVENTS.includes(event_type)) {
    return res.status(400).json({ success: false, error: "Invalid event_type" });
  }

  if (typeof page !== "string" || page.length > MAX_PAGE_LENGTH) {
    return res.status(400).json({ success: false, error: "Invalid page" });
  }

  const safeMetadata = isPlainObject(metadata) ? metadata : {};

  if (JSON.stringify(safeMetadata).length > MAX_METADATA_BYTES) {
    return res.status(400).json({ success: false, error: "Metadata too large" });
  }

  const userId = req.userId || null;

  try {
    // 🚫 Duplicate check — per user when signed in, otherwise per IP.
    // See utils/dedupe.js for why this is not a Postgres time-window query.
    const dedupeKey = `${userId || `ip:${req.ip}`}|${event_type}|${page}`;

    if (isDuplicate(dedupeKey, DEDUPE_WINDOW_MS)) {
      return res.json({ success: true, message: "Duplicate skipped" });
    }

    // ==============================
    // 🧠 BUILD INSERT DATA
    // ==============================
    const insertData = {
      event_type,
      page,
      metadata: { ...safeMetadata, timestamp: new Date().toISOString() },
    };

    if (userId) {
      insertData.user_id = userId;
    }

    // ==============================
    // ⚡ INSERT
    // ==============================
    let { data: insertedData, error: insertError } = await adminClient
      .from("analytics_events")
      .insert([insertData])
      .select("id")
      .single();

    // Stale token for a deleted account: keep the event, drop the user link.
    if (insertError?.code === "23503" && userId) {
      const { user_id, ...anonymous } = insertData;
      ({ data: insertedData, error: insertError } = await adminClient
        .from("analytics_events")
        .insert([anonymous])
        .select("id")
        .single());
    }

    if (insertError) {
      // Log the Postgres detail server-side; never echo it to the client.
      console.error("[analytics] insert failed:", insertError);

      return res.status(500).json({ success: false, error: "Tracking failed" });
    }

    return res.json({
      success: true,
      message: "Tracked successfully",
      event_id: insertedData?.id || null,
    });
  } catch (err) {
    console.error("[analytics] unexpected error:", err);

    return res.status(500).json({ success: false, error: "Server error" });
  }
});

export default router;
