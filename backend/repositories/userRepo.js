import bcrypt from "bcryptjs";
import { adminClient } from "../config/supabase.js";

// Every column except `password`. Used everywhere a full row isn't
// actually needed — which, before this change, was every read path in
// this file: findById(), createUser(), updateProfile(), and
// listUsersForDigest() were all pulling the bcrypt hash into the app
// process on every call despite toUser() never reading it.
const SAFE_USER_COLUMNS =
  "id, name, email, phone, skills, experience, interests, city, latitude, longitude, " +
  "preferred_mode, notify_email, notify_whatsapp, notify_daily_digest, created_at";

/** Map a Postgres row (snake_case) to the camelCase shape the rest of the app expects. */
function toUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    profile: {
      skills: row.skills || [],
      experience: row.experience,
      interests: row.interests || [],
      city: row.city,
      location: {
        coordinates: [row.longitude ?? 0, row.latitude ?? 0], // [lng, lat], mirrors old GeoJSON shape
      },
      preferredMode: row.preferred_mode,
    },
    notificationPrefs: {
      email: row.notify_email,
      whatsapp: row.notify_whatsapp,
      dailyDigest: row.notify_daily_digest,
    },
    createdAt: row.created_at,
  };
}

export async function createUser({ name, email, password }) {
  const hashed = await bcrypt.hash(password, 10);

  const { data, error } = await adminClient
    .from("users")
    .insert({ name, email: email.toLowerCase(), password: hashed })
    .select(SAFE_USER_COLUMNS)
    .single();

  if (error) {
    if (error.code === "23505") throw Object.assign(new Error("Email already registered"), { status: 409 });
    throw error;
  }
  return toUser(data);
}

/** Includes the password hash — only for internal login comparison, never returned to the client. */
export async function findByEmailWithPassword(email) {
  const { data, error } = await adminClient
    .from("users")
    .select("*")
    .eq("email", email.toLowerCase())
    .maybeSingle();
  if (error) throw error;
  return data; // raw row, keep password field for bcrypt.compare
}

export async function comparePassword(rawRow, candidate) {
  return bcrypt.compare(candidate, rawRow.password);
}

export async function findById(id) {
  const { data, error } = await adminClient
    .from("users")
    .select(SAFE_USER_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return toUser(data);
}

export async function updateProfile(id, { profile = {}, phone, notificationPrefs }) {
  const patch = {};

  if (profile.skills) patch.skills = profile.skills;
  if (profile.interests) patch.interests = profile.interests;
  if (profile.experience) patch.experience = profile.experience;
  if (profile.city !== undefined) patch.city = profile.city;
  if (profile.preferredMode) patch.preferred_mode = profile.preferredMode;
  if (profile.location?.coordinates) {
    const [lng, lat] = profile.location.coordinates;
    patch.longitude = lng;
    patch.latitude = lat;
  }
  if (phone) patch.phone = phone;
  if (notificationPrefs?.email !== undefined) patch.notify_email = notificationPrefs.email;
  if (notificationPrefs?.whatsapp !== undefined) patch.notify_whatsapp = notificationPrefs.whatsapp;
  if (notificationPrefs?.dailyDigest !== undefined) patch.notify_daily_digest = notificationPrefs.dailyDigest;

  const { data, error } = await adminClient
    .from("users")
    .update(patch)
    .eq("id", id)
    .select(SAFE_USER_COLUMNS)
    .single();

  if (error) throw error;
  return toUser(data);
}

export async function listUsersForDigest(limit = 200, offset = 0) {
  const { data, error } = await adminClient
    .from("users")
    .select(SAFE_USER_COLUMNS)
    .eq("notify_daily_digest", true)
    .order("id") // stable order — required for offset pagination to not skip/repeat rows across pages
    .range(offset, offset + limit - 1);
  if (error) throw error;
  return data.map(toUser);
}

export async function toggleSavedHackathon(userId, hackathonId) {
  const { data: existing, error: findErr } = await adminClient
    .from("saved_hackathons")
    .select("*")
    .eq("user_id", userId)
    .eq("hackathon_id", hackathonId)
    .maybeSingle();
  if (findErr) throw findErr;

  if (existing) {
    const { error } = await adminClient
      .from("saved_hackathons")
      .delete()
      .eq("user_id", userId)
      .eq("hackathon_id", hackathonId);
    if (error) throw error;
    return { saved: false };
  }

  const { error } = await adminClient
    .from("saved_hackathons")
    .insert({ user_id: userId, hackathon_id: hackathonId });
  if (error) throw error;
  return { saved: true };
}
