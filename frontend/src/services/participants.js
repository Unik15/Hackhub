import { axiosClient } from "./axiosClient";

/**
 * POST /participants
 * Registers a participant against a hackathon_id.
 */
export async function postParticipant({ hackathonId, name, email, college }) {
  const { data } = await axiosClient.post("/participants", {
    hackathon_id: hackathonId,
    name,
    email,
    college,
  });
  return data;
}
