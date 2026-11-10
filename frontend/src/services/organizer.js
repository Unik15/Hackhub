import { axiosClient } from "./axiosClient";

/**
 * Organizer data is scoped to the signed-in account by the backend — no email
 * is needed. `email` is only meaningful for admins inspecting another
 * organizer, so it is sent only when explicitly provided.
 */

/** GET /organizer/hackathons — published listings created by this organizer. */
export async function fetchOrganizerHackathons(email) {
  const { data } = await axiosClient.get("/organizer/hackathons", {
    params: email ? { email } : undefined,
  });
  return data?.items ?? [];
}

/** GET /organizer/submissions — full pending/approved/rejected history. */
export async function fetchOrganizerSubmissions(email) {
  const { data } = await axiosClient.get("/organizer/submissions", {
    params: email ? { email } : undefined,
  });
  return data?.items ?? [];
}

/**
 * GET /participants?hackathon_id=
 */
export async function fetchParticipants(hackathonId) {
  const { data } = await axiosClient.get("/participants", { params: { hackathon_id: hackathonId } });
  return Array.isArray(data) ? data : data?.data ?? [];
}
