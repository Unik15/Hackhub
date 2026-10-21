import { axiosClient } from "./axiosClient";

/**
 * GET /organizer/hackathons
 * No auth system wired yet, so the organizer identifies themselves by the
 * same email they used on submission. Swap the `email` param for a token
 * once auth lands.
 */
export async function fetchOrganizerHackathons(email) {
  const { data } = await axiosClient.get("/organizer/hackathons", { params: { email } });
  return Array.isArray(data) ? data : data?.data ?? [];
}

/**
 * GET /participants?hackathon_id=
 */
export async function fetchParticipants(hackathonId) {
  const { data } = await axiosClient.get("/participants", { params: { hackathon_id: hackathonId } });
  return Array.isArray(data) ? data : data?.data ?? [];
}
