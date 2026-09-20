import { createClient } from "@supabase/supabase-js";
// =========================
// 🔐 ENV VALIDATION
// =========================
if (!process.env.SUPABASE_URL) throw new Error("Missing SUPABASE_URL");
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("Missing SERVICE ROLE KEY");
if (!process.env.SUPABASE_ANON_KEY) throw new Error("Missing ANON KEY");

// =========================
// 🔐 ADMIN CLIENT
// =========================
export const adminClient = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: { persistSession: false }
  }
);

// =========================
// 👤 USER CLIENT (RLS SAFE)
// =========================
export const createUserClient = (token) =>
  createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY,
    {
      global: {
        headers: token
          ? { Authorization: `Bearer ${token}` }
          : {}
      }
    }
  );

// =========================
// 🔁 RETRY HELPER (PRO 🔥)
// =========================
async function retryQuery(fn, retries = 3, delay = 500) {
  try {
    return await fn();
  } catch (err) {
    if (retries <= 0) throw err;

    console.warn(`[supabase] Retry... (${retries})`, err.message);

    await new Promise((res) => setTimeout(res, delay));
    return retryQuery(fn, retries - 1, delay * 2); // exponential backoff
  }
}

// =========================
// 🔌 DB CHECK (SAFE + RELIABLE)
// =========================
export async function connectDB() {
  try {
    const { error } = await retryQuery(() =>
      adminClient
        .from("users") // ✅ FIXED (correct table)
        .select("id")
        .limit(1)
    );

    if (error) {
      console.error("[supabase] Schema issue:", error.message);

      // ❌ Hard crash removed → graceful exit
      console.warn("[supabase] Server starting anyway (check DB ASAP)");
      return;
    }

    console.log("[supabase] Connected and verified");

  } catch (err) {
    console.error("[supabase] Connection failed after retries:", err.message);

    // ❌ no immediate crash → but visible warning
    console.warn("[supabase] Running without DB (temporary)");
  }
}