import express from "express";
import rateLimit from "express-rate-limit";
import { adminClient } from "../config/supabase.js";
import { optionalAuth } from "../middleware/auth.js";
import { isDuplicate } from "../utils/dedupe.js";

const router = express.Router();

// 🔥 Rate limit (anti-spam) — anonymous views are counted too, so this is public
router.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: "Too many actions, please slow down." },
  })
);

const ALLOWED_ACTIONS = ["view", "apply", "click"];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEDUPE_WINDOW_MS = 2000;
const MAX_METADATA_BYTES = 5000;

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

router.post("/", optionalAuth, async (req, res) => {
  const { hackathon_id, action_type, metadata } = req.body || {};

  if (!hackathon_id || !action_type) {
    return res.status(400).json({
      success: false,
      error: "hackathon_id and action_type required",
    });
  }

  // Without this the insert reaches Postgres as a malformed uuid (22P02) and
  // the client gets a 500 for what is really a bad request.
  if (!UUID_RE.test(String(hackathon_id))) {
    return res.status(400).json({ success: false, error: "Invalid hackathon_id" });
  }

  if (!ALLOWED_ACTIONS.includes(action_type)) {
    return res.status(400).json({ success: false, error: "Invalid action_type" });
  }

  const safeMetadata = isPlainObject(metadata) ? metadata : {};

  if (JSON.stringify(safeMetadata).length > MAX_METADATA_BYTES) {
    return res.status(400).json({ success: false, error: "Metadata too large" });
  }

  const userId = req.userId || null;

  try {
    // ============================
    // 🚫 Duplicate protection
    // ============================
    // Keyed per user when signed in, otherwise per IP. See utils/dedupe.js for
    // why this is not a Postgres time-window query.
    const dedupeKey = `${userId || `ip:${req.ip}`}|${hackathon_id}|${action_type}`;

    if (isDuplicate(dedupeKey, DEDUPE_WINDOW_MS)) {
      return res.json({ success: true, message: "Duplicate skipped" });
    }

    // ============================
    // 🧠 INSERT
    // ============================
    const row = {
      user_id: userId,
      hackathon_id,
      action_type,
      metadata: safeMetadata,
    };

    let { error: insertError } = await adminClient.from("user_actions").insert(row);

    // A token can outlive the account it points at. Record the action
    // anonymously instead of losing the event to a foreign key violation.
    if (insertError?.code === "23503" && userId) {
      ({ error: insertError } = await adminClient
        .from("user_actions")
        .insert({ ...row, user_id: null }));
    }

    if (insertError) {
      // Remaining 23503s mean the hackathon row is gone, not a server fault.
      const status = insertError.code === "23503" ? 404 : 500;
      console.error("[actions] insert failed:", insertError);

      return res.status(status).json({
        success: false,
        error: status === 404 ? "Hackathon not found" : "Insert failed",
      });
    }

    // ============================
    // ⚡ COUNTER UPDATE (AFTER INSERT)
    // ============================
    // The action is already stored; a counter failure must not fail the request.
    if (action_type === "view" || action_type === "apply") {
      const rpc = action_type === "view" ? "increment_views" : "increment_apply";
      const { error: rpcError } = await adminClient.rpc(rpc, { hid: hackathon_id });

      if (rpcError) console.error(`[actions] ${rpc} failed:`, rpcError.message);
    }

    return res.json({ success: true });
  } catch (err) {
    console.error("[actions] unexpected error:", err);

    return res.status(500).json({ success: false, error: "Server error" });
  }
});

export default router;
