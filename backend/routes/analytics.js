import express from "express";
import { createUserClient } from "../config/supabase.js";
import rateLimit from "express-rate-limit";

const router = express.Router();

router.use(rateLimit({
  windowMs: 60 * 1000,
  max: 100
}));

const ALLOWED_EVENTS = [
  "page_view",
  "login",
  "logout",
  "signup",
  "button_click",
  "search",
  "hackathon_view",
  "hackathon_apply",
  "profile_update"
];

router.post("/track", async (req, res) => {
  console.log("STEP 1: Request received");
  try {
   let user_id = null;
let supabase = createUserClient(""); // anonymous client

const token = req.headers.authorization?.replace("Bearer ", "");

if (token) {
  supabase = createUserClient(token);

  const { data, error } = await supabase.auth.getUser();

  if (error) {
    console.warn("Auth error:", error.message);
  }

  if (data?.user) {
    user_id = data.user.id;
  }
}
    console.log("STEP 2: Auth done", user_id);

    const { event_type, page, metadata } = req.body;

    if (!event_type || !page) {
      return res.status(400).json({
        success: false,
        error: "event_type and page required"
      });
    }

    if (!ALLOWED_EVENTS.includes(event_type)) {
      return res.status(400).json({
        success: false,
        error: "Invalid event_type"
      });
    }

    const safeMetadata =
      metadata && typeof metadata === "object" ? metadata : {};

    if (JSON.stringify(safeMetadata).length > 5000) {
      return res.status(400).json({
        success: false,
        error: "Metadata too large"
      });
    }

  
   // 🚫 Duplicate check (fixed)
let query = supabase
  .from("analytics_events")
  .select("id")
  .eq("event_type", event_type)
  .eq("page", page)
  .gte(
    "created_at",
    new Date(Date.now() - 2000).toISOString()
  )
  .limit(1);

// 👇 only apply if user exists
if (user_id) {
  query = query.eq("user_id", user_id);
}

const { data: recent } = await query;
console.log("STEP 3: Duplicate check done", recent);

    if (recent?.length > 0) {
      return res.json({
        success: true,
        message: "Duplicate skipped"
      });
    }

// ==============================
// 🧠 BUILD INSERT DATA (SMART)
// ==============================
const insertData = {
  event_type,
  page,
  metadata: {
    ...safeMetadata,
    timestamp: new Date().toISOString()
  }
};

// 👤 attach user only if exists
if (user_id) {
  insertData.user_id = user_id;
}

// ==============================
// ⚡ INSERT WITH ERROR HANDLING
// ==============================
console.log("STEP 4: Inserting...", insertData);
const { data: insertedData, error: insertError } = await supabase
  .from("analytics_events")
  .insert([insertData])
  .select("id")
  .single();
  
  console.log("STEP 5: Insert done", insertedData);

// ==============================
// 🚨 ERROR HANDLING (PRO LEVEL)
// ==============================
if (insertError) {
  console.error("[ANALYTICS INSERT ERROR]", insertError);

  return res.status(500).json({
    success: false,
    error: insertError.message,
    details: insertError.details,
    hint: insertError.hint,
    code: insertError.code
  });
}
// ==============================
// ✅ SUCCESS RESPONSE
// ==============================
return res.json({
  success: true,
  message: "Tracked successfully",
  event_id: insertedData?.id || null
});
  
  } catch (err) {
    console.error("Server Error:", err);

    res.status(500).json({
      success: false,
      error: "Server error"
    });
  }
});

export default router;
