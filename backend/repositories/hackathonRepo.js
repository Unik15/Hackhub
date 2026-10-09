import crypto from "crypto";
import { adminClient } from "../config/supabase.js";

// =========================
// 📦 SELECT COLUMNS
// =========================
const LIST_COLUMNS = `
  id,
  title,
  description,
  url,
  platform,
  location,
  latitude,
  longitude,
  start_date,
  end_date,
  is_online,
  status,
  trending_score,
  views_count,
  apply_count,
  created_at
`;

const MAX_LIMIT = 50;
const PUBLIC_STATUSES = ["upcoming", "active"];

// =========================
// 🔄 TRANSFORMER
// =========================
export function toHackathon(row) {
  if (!row) return null;

  return {
    id: row.id,
    title: row.title,
    description: row.description,
    url: row.url,
    platform: row.platform,
    location: row.location || null,
    latitude: row.latitude,
    longitude: row.longitude,
    startDate: row.start_date,
    endDate: row.end_date,
    isOnline: row.is_online,
    status: row.status,
    trendingScore: row.trending_score || 0,
    views: row.views_count || 0,
    applies: row.apply_count || 0,
    createdAt: row.created_at,
  };
}

// =========================
// 🧠 DEDUPE HASH (CRAWLER)
// =========================
export function buildDedupeHash({ title, url, platform }) {
  const normalized =
    `${title}`.trim().toLowerCase().replace(/\s+/g, " ") +
    "|" +
    platform +
    "|" +
    url;

  return crypto.createHash("sha256").update(normalized).digest("hex");
}

// =========================
// 🔥 UPSERT (CRAWLER)
// =========================
export async function upsertHackathon(data) {
  try {
    const dedupe_hash = buildDedupeHash({
      title: data.title,
      url: data.url,
      platform: data.platform,
    });

    const row = {
      title: data.title,
      description: data.description || "",
      url: data.url,
      platform: data.platform,
      location: data.location || "",
      latitude: data.latitude ?? null,
      longitude: data.longitude ?? null,
      start_date: data.startDate,
      end_date: data.endDate,
      is_online: data.isOnline ?? true,
      status: data.status || "upcoming",
      dedupe_hash,

      // ✅ safe defaults
      views_count: 0,
      apply_count: 0,
      trending_score: 0,
    };

    const { error } = await adminClient
      .from("hackathons")
      .upsert(row, { onConflict: "dedupe_hash" });

    if (error) throw error;

  } catch (err) {
    console.error("[upsertHackathon ERROR]:", err.message);
  }
}

/**
 * Creates an organizer-submitted listing in a pending state. Pending entries
 * are deliberately excluded from public discovery until reviewed.
 */
export async function createSubmittedHackathon({
  title,
  url,
  location,
  startDate,
  endDate,
  organizerEmail,
  latitude = null,
  longitude = null,
}) {
  const dedupeHash = buildDedupeHash({ title, url, platform: "manual" });
  const isOnline = /^(online|remote|virtual)\b/i.test(location);

  const { data, error } = await adminClient
    .from("hackathons")
    .insert({
      title,
      description: "",
      url,
      platform: "manual",
      location,
      latitude,
      longitude,
      start_date: startDate,
      end_date: endDate,
      is_online: isOnline,
      status: "pending",
      dedupe_hash: dedupeHash,
      organizer_email: organizerEmail,
      views_count: 0,
      apply_count: 0,
      trending_score: 0,
    })
    .select(LIST_COLUMNS)
    .single();

  if (error) {
    if (error.code === "23505") {
      throw Object.assign(new Error("This hackathon has already been submitted."), { status: 409 });
    }
    throw error;
  }

  return toHackathon(data);
}

// =========================
// 🔍 SEARCH + FILTER + PAGINATION
// =========================
export async function findMany({
  search,
  platform,
  status,
  page = 1,
  limit = 20,
} = {}) {
  try {
    limit = Math.min(Math.max(Number(limit) || 20, 1), MAX_LIMIT);
    page = Math.max(Number(page) || 1, 1);

    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = adminClient
      .from("hackathons")
      .select(LIST_COLUMNS, { count: "exact" })
      .in("status", PUBLIC_STATUSES)
      .order("created_at", { ascending: false });

    if (status) query = query.eq("status", status);
    if (platform) query = query.eq("platform", platform);

    if (search) {
     query = query.or(
  `title.ilike.%${search}%,description.ilike.%${search}%`
   );
    }

    const { data, count } = await query
      .range(from, to)
      .throwOnError();

    return {
      items: data.map(toHackathon),
      total: count || 0,
      page,
      limit,
    };

  } catch (err) {
    console.error("[findMany ERROR]:", err.message);
    throw new Error("Failed to fetch hackathons");
  }
}

// =========================
// 🔥 TRENDING (PRO LEVEL)
// =========================
export async function findTrending(limit = 12, offset = 0) {
  try {
    limit = Math.min(Math.max(Number(limit) || 12, 1), MAX_LIMIT);

    const { data } = await adminClient
      .from("hackathons")
      .select(LIST_COLUMNS)
      .eq("status", "upcoming") // 🔥 only active/upcoming
      .order("trending_score", { ascending: false })
      .order("views_count", { ascending: false })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1)
      .throwOnError();

    return data.map(toHackathon);

  } catch (err) {
    console.error("[findTrending ERROR]:", err.message);
    throw new Error("Failed to fetch trending hackathons");
  }
}
// =========================
// ⚡ ACTIVE HACKATHONS (FOR SCHEDULER / AI)
// =========================
export async function findActive(limit = 200, offset = 0) {
  try {
    limit = Math.min(Math.max(Number(limit) || 200, 1), 500);

    const { data } = await adminClient
      .from("hackathons")
      .select(LIST_COLUMNS)
      .in("status", ["upcoming", "active"]) // 🔥 important
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1)
      .throwOnError();

    return data.map(toHackathon);

  } catch (err) {
    console.error("[findActive ERROR]:", err.message);
    return [];
  }
}

/** Returns active physical listings; distance filtering lives in geoService. */
export async function findLocatedActive(limit = 500) {
  try {
    limit = Math.min(Math.max(Number(limit) || 500, 1), 500);

    const { data } = await adminClient
      .from("hackathons")
      .select(LIST_COLUMNS)
      .in("status", ["upcoming", "active"])
      .eq("is_online", false)
      .not("latitude", "is", null)
      .not("longitude", "is", null)
      .order("start_date", { ascending: true, nullsFirst: false })
      .range(0, limit - 1)
      .throwOnError();

    return data.map(toHackathon);
  } catch (err) {
    console.error("[findLocatedActive ERROR]:", err.message);
    throw new Error("Failed to fetch nearby hackathons");
  }
}
// =========================
// 🔍 SINGLE BY ID
// =========================
export async function findById(id) {
  try {
    if (!id) throw new Error("ID is required");

    const { data } = await adminClient
      .from("hackathons")
      .select(LIST_COLUMNS)
      .eq("id", id)
      .single()
      .throwOnError();

    return toHackathon(data);

  } catch (err) {
    console.error("[findById ERROR]:", err.message);
    throw new Error("Hackathon not found");
  }
}

// =========================
// ⏳ EXPIRE OLD (CRON)
// =========================
export async function expireOld() {
  try {
    const now = new Date().toISOString();

    const { error } = await adminClient
      .from("hackathons")
      .update({ status: "expired" })
      .or(`end_date.lt.${now},and(end_date.is.null,start_date.lt.${now})`);

    if (error) throw error;

  } catch (err) {
    console.error("[expireOld ERROR]:", err.message);
  }
}
