import { axiosClient } from "./axiosClient";

/**
 * GET /hackathons
 * Accepts optional query params (search, platform, mode, page…) so the
 * backend can do the filtering once you're ready to move it server-side.
 */
export async function fetchHackathons(params = {}) {
  const { data } = await axiosClient.get("/hackathons", { params });
  // Tolerate either a raw array or a { data: [...] } envelope from the API.
  return Array.isArray(data) ? data : data?.data ?? [];
}

export async function fetchHackathonById(id) {
  const { data } = await axiosClient.get(`/hackathons/${id}`);
  return data?.data ?? data;
}

/**
 * POST /hackathons
 * Organizer submission — creates a new hackathon listing.
 */
export async function submitHackathon(payload) {
  const { data } = await axiosClient.post("/hackathons", payload);
  return data;
}
