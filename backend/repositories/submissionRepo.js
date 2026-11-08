import { adminClient } from "../config/supabase.js";

// Every column except the derived/public listing fields — this table is the
// permanent record of what an organizer asked for, before moderation.
const SUBMISSION_COLUMNS = `
  id,
  user_id,
  organizer_email,
  title,
  url,
  description,
  location,
  latitude,
  longitude,
  mode,
  start_date,
  end_date,
  status,
  review_note,
  reviewed_by,
  reviewed_at,
  approved_hackathon_id,
  created_at
`;

/** Map a Postgres row (snake_case) to the camelCase shape the API returns. */
function toSubmission(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    organizerEmail: row.organizer_email,
    title: row.title,
    url: row.url,
    description: row.description || "",
    location: row.location,
    latitude: row.latitude,
    longitude: row.longitude,
    mode: row.mode,
    startDate: row.start_date,
    endDate: row.end_date,
    status: row.status,
    reviewNote: row.review_note || null,
    reviewedBy: row.reviewed_by || null,
    reviewedAt: row.reviewed_at || null,
    approvedHackathonId: row.approved_hackathon_id || null,
    createdAt: row.created_at,
  };
}

/**
 * Records a manual submission as pending. Nothing is written to the public
 * hackathons table until an admin approves it — pending and rejected rows
 * must never be discoverable.
 */
export async function createSubmission({
  userId,
  organizerEmail,
  title,
  url,
  description = "",
  location,
  latitude = null,
  longitude = null,
  startDate,
  endDate,
}) {
  const isOnline = /^(online|remote|virtual)\b/i.test(location);

  const { data, error } = await adminClient
    .from("hackathon_submissions")
    .insert({
      user_id: userId,
      organizer_email: organizerEmail,
      title,
      url,
      description,
      location,
      latitude,
      longitude,
      mode: isOnline ? "online" : "offline",
      start_date: startDate,
      end_date: endDate,
    })
    .select(SUBMISSION_COLUMNS)
    .single();

  if (error) {
    // Partial unique index on (user_id, url) where status = 'pending'.
    if (error.code === "23505") {
      throw Object.assign(
        new Error("You already have a pending submission for this URL."),
        { status: 409 }
      );
    }
    throw error;
  }

  return toSubmission(data);
}
