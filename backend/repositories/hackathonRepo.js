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
  mode,
  domain,
  tags,
  organizer,
  prize_pool,
  registration_deadline,
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
    mode: row.mode || (row.is_online ? "online" : "offline"),
    domain: row.domain || [],
    tags: row.tags || [],
    organizer: row.organizer || null,
    prizePool: row.prize_pool || null,
    registrationDeadline: row.registration_deadline || null,
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
// 🏷️ STATUS FROM DATES
// =========================
/**
 * Derives a listing's status from its own dates, so a crawl never publishes an
 * already-finished event as "upcoming" until the nightly expiry job catches up
 * (up to 24 hours later). Mirrors expireOld()'s rule so the two cannot disagree.
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

// =========================
// 🔥 UPSERT (CRAWLER)
// =========================
export async function upsertHackathon(data) {
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
    source_name: data.sourceName ?? null,
    source_url: data.sourceUrl ?? null,
    location: data.location || "",
    latitude: data.latitude ?? null,
    longitude: data.longitude ?? null,
    mode: data.mode || (data.isOnline ? "online" : "offline"),
    domain: data.domain || [],
    tags: data.tags || [],
    organizer: data.organizer || null,
    prize_pool: data.prizePool || null,
    registration_deadline: data.registrationDeadline ?? null,
    start_date: data.startDate,
    end_date: data.endDate,
    is_online: data.isOnline ?? true,
    status: data.status || deriveStatus(data.startDate, data.endDate),
    dedupe_hash,

    // views_count/apply_count/trending_score are omitted on purpose: the
    // columns default to 0 on insert, and including them here would reset
    // engagement counters every time the crawler re-upserts a listing.
  };

  const { error } = await adminClient
    .from("hackathons")
    .upsert(row, { onConflict: "dedupe_hash" });

  // Throwing is the whole point: retryAsync only retries on a rejected
  // promise, and the orchestrator's failure counter plus the
  // "high failure rate" alert both depend on this reaching them. Swallowing
  // the error here made a run that wrote nothing look completely healthy.
  if (error) throw error;
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
      mode: isOnline ? "online" : "offline",
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

/**
 * Whether this account has ever submitted a hackathon. Drives organizer-only
 * UI (dashboard access) — computed live rather than stored, so it can never
 * go stale when a submission is rejected or removed.
 */
export async function hasSubmittedHackathons(email) {
  if (!email) return false;

  const { data, error } = await adminClient
    .from("hackathon_submissions")
    .select("id")
    .ilike("organizer_email", email)
    .limit(1);

  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

// =========================
// 🔍 SEARCH + FILTER + PAGINATION
// =========================
export async function findMany({
  search,
  platform,
  status,
  domain,
  mode,
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
    if (mode) query = query.eq("mode", mode);
    if (domain) query = query.contains("domain", Array.isArray(domain) ? domain : [domain]);

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

/**
 * Returns active physical listings plus online fallback listings. Distance
 * filtering lives in geoService, which keeps the online events after nearby
 * physical matches.
 */
export async function findLocatedActive(limit = 500) {
  try {
    limit = Math.min(Math.max(Number(limit) || 500, 1), 500);

    const { data } = await adminClient
      .from("hackathons")
      .select(LIST_COLUMNS)
      .in("status", ["upcoming", "active"])
      .or("is_online.eq.true,and(latitude.not.is.null,longitude.not.is.null)")
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
  const now = new Date().toISOString();

  const { data, error } = await adminClient
    .from("hackathons")
    .update({ status: "expired" })
    // Skip rows that are already expired: re-updating them every night fires
    // the trending trigger for no reason and makes the count meaningless.
    .neq("status", "expired")
    .or(`end_date.lt.${now},and(end_date.is.null,start_date.lt.${now})`)
    .select("id");

  // Same reasoning as upsertHackathon: the scheduler logs the returned count,
  // so a failure has to surface instead of silently reporting "Expired 0".
  if (error) throw error;

  return data?.length ?? 0;
}

