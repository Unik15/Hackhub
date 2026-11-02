import { axiosClient } from "./axiosClient";

/**
 * GET /hackathons
 * Accepts optional query params (search, platform, mode, page…) so the
 * backend can do the filtering once you're ready to move it server-side.
 */
export async function fetchHackathons(params = {}) {
  const { data } = await axiosClient.get("/hackathons", { params });
  // Tolerate either a raw array or a { data: [...] } envelope from the API.
  return Array.isArray(data) ? data :  data?.items ?? data?.data ?? [];
}

/**
 * Fetches every page of /hackathons (server caps each page at 50) and
 * concatenates them, so client-side filtering sees the full dataset.
 * Stops after `maxPages` (safety cap) or when a short page comes back.
 */
export async function fetchAllHackathons(params = {}) {
  const PAGE_SIZE = 50; // backend MAX_LIMIT
  const maxPages = 20;  // safety cap: up to 1000 hackathons
  const items = [];

  for (let page = 1; page <= maxPages; page++) {
    const { data } = await axiosClient.get("/hackathons", {
      params: { ...params, page, limit: PAGE_SIZE },
    });
    if (Array.isArray(data)) break; // unexpected shape — bail with what we have
    const batch = data?.items ?? data?.data ?? [];
    items.push(...batch);
    if (batch.length < PAGE_SIZE) break; // last page reached
  }

  return items;
}

export async function fetchHackathonById(id) {
  const { data } = await axiosClient.get(`/hackathons/${id}`);
  return data?.item ?? data?.data ?? data;
}

export async function fetchNearbyHackathons({ city, latitude, longitude, radiusKm }) {
  const params = { radius: radiusKm };
  if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
    params.lat = latitude;
    params.lng = longitude;
  } else {
    params.city = city;
  }

  const { data } = await axiosClient.get("/hackathons/nearby", {
    params,
  });
  return data;
}

/**
 * POST /hackathons
 * Organizer submission — creates a new hackathon listing.
 */
export async function submitHackathon(payload) {
  const { data } = await axiosClient.post("/hackathons", payload);
  return data;
}
