import express from "express";
import { createUserClient } from "../config/supabase.js";
import rateLimit from "express-rate-limit";

const router = express.Router();

// 🔥 Rate limit (anti-spam)
router.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 100
  })
);

const ALLOWED = ["view", "apply", "click"];

router.post("/", async (req, res) => {
  try {
    const { hackathon_id, action_type, metadata } = req.body;

    // ✅ Basic validation
    if (!hackathon_id || !action_type) {
      return res.status(400).json({
        success: false,
        error: "hackathon_id and action_type required"
      });
    }

    if (!ALLOWED.includes(action_type)) {
      return res.status(400).json({
        success: false,
        error: "Invalid action_type"
      });
    }

    // ✅ Metadata safety
    const safeMetadata =
      metadata && typeof metadata === "object" ? metadata : {};

    // 🚫 Prevent large payload
    if (JSON.stringify(safeMetadata).length > 5000) {
      return res.status(400).json({
        success: false,
        error: "Metadata too large"
      });
    }

    // ✅ Auth handling (optional user)
    let supabase = createUserClient("");
    let user_id = null;

    const token = req.headers.authorization?.replace("Bearer ", "");

    if (token) {
      supabase = createUserClient(token);

      const { data, error } = await supabase.auth.getUser();

      if (error) {
        console.warn("Auth error:", error.message);
      }

      user_id = data?.user?.id || null;
    }

    // ============================
    // 🚫 Duplicate protection FIXED
    // ============================

    let query = supabase
      .from("user_actions")
      .select("id")
      .eq("hackathon_id", hackathon_id)
      .eq("action_type", action_type)
      .gte(
        "created_at",
        new Date(Date.now() - 2000).toISOString()
      )
      .limit(1);

    // 👇 only apply user filter if exists
    if (user_id) {
      query = query.eq("user_id", user_id);
    }

    const { data: recent } = await query;

    if (recent?.length > 0) {
      return res.json({
        success: true,
        message: "Duplicate skipped"
      });
    }

    // ============================
    // 🧠 INSERT (SAFE FIRST)
    // ============================

    const { error: insertError } = await supabase
      .from("user_actions")
      .insert({
        user_id,
        hackathon_id,
        action_type,
        metadata: safeMetadata
      });

    if (insertError) {
      console.error("Insert error:", insertError);

      return res.status(500).json({
        success: false,
        error: "Insert failed"
      });
    }

    // ============================
    // ⚡ COUNTER UPDATE (AFTER INSERT)
    // ============================

    if (action_type === "view") {
      const { error } = await supabase.rpc("increment_views", {
        hid: hackathon_id
      });

      if (error) console.error("RPC view error:", error);
    }

    if (action_type === "apply") {
      const { error } = await supabase.rpc("increment_apply", {
        hid: hackathon_id
      });

      if (error) console.error("RPC apply error:", error);
    }

    // ============================
    // ✅ SUCCESS
    // ============================

    return res.json({
      success: true
    });

  } catch (err) {
    console.error("ACTION ERROR:", err);

    return res.status(500).json({
      success: false,
      error: "Server error"
    });
  }
});

export default router;