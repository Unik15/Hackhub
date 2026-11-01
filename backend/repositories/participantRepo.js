import { adminClient } from "../config/supabase.js";

function toParticipant(row) {
  return {
    id: row.id,
    hackathonId: row.hackathon_id,
    name: row.name,
    email: row.email,
    college: row.college,
    createdAt: row.created_at,
  };
}

export async function registerParticipant({ hackathonId, name, email, college }) {
  const { data: hackathon, error: hackathonError } = await adminClient
    .from("hackathons")
    .select("id")
    .eq("id", hackathonId)
    .in("status", ["upcoming", "active"])
    .maybeSingle();

  if (hackathonError) throw hackathonError;
  if (!hackathon) throw Object.assign(new Error("Hackathon not found or no longer open for registration."), { status: 404 });

  const { data, error } = await adminClient
    .from("participants")
    .insert({
      hackathon_id: hackathonId,
      name,
      email: email.toLowerCase(),
      college,
    })
    .select("id, hackathon_id, name, email, college, created_at")
    .single();

  if (error) {
    if (error.code === "23505") {
      throw Object.assign(new Error("You are already registered for this hackathon."), { status: 409 });
    }
    throw error;
  }

  return toParticipant(data);
}
