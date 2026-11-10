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

/** Every submission this organizer ever made, newest first — the dashboard's "My submissions" table. */
export async function listSubmissionsByEmail(email) {
  if (!email) return [];

  const { data, error } = await adminClient
    .from("hackathon_submissions")
    .select(SUBMISSION_COLUMNS)
    .ilike("organizer_email", email)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data.map(toSubmission);
}

/** Single submission by id — the admin queue's approve/reject lookup. */
export async function findSubmissionById(id) {
  const { data, error } = await adminClient
    .from("hackathon_submissions")
    .select(SUBMISSION_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return toSubmission(data);
}

/**
 * Review queue feed. Pending is oldest-first (FIFO review), while decided
 * history is newest-first so recent decisions are easy to audit.
 */
export async function listSubmissionsForReview({ status } = {}) {
  let query = adminClient.from("hackathon_submissions").select(SUBMISSION_COLUMNS);
  if (status) query = query.eq("status", status);

  const { data, error } = await query.order("created_at", {
    ascending: status === "pending",
  });

  if (error) throw error;
  return data.map(toSubmission);
}

/**
 * Marks a pending submission approved and links it to the listing that was
 * published for it. The `status = 'pending'` guard makes concurrent approvals
 * safe: only one call can win, and the loser gets null back.
 */
export async function markApproved(id, reviewerId, hackathonId) {
  const { data, error } = await adminClient
    .from("hackathon_submissions")
    .update({
      status: "approved",
      reviewed_by: reviewerId,
      reviewed_at: new Date().toISOString(),
      approved_hackathon_id: hackathonId,
    })
    .eq("id", id)
    .eq("status", "pending")
    .select(SUBMISSION_COLUMNS);

  if (error) throw error;
  return data?.[0] ? toSubmission(data[0]) : null;
}

/** Rejects a pending submission, keeping the reviewer's note as the audit trail. */
export async function markRejected(id, reviewerId, note) {
  const { data, error } = await adminClient
    .from("hackathon_submissions")
    .update({
      status: "rejected",
      review_note: note,
      reviewed_by: reviewerId,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "pending")
    .select(SUBMISSION_COLUMNS);

  if (error) throw error;
  return data?.[0] ? toSubmission(data[0]) : null;
}
