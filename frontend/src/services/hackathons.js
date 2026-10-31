import { axiosClient } from "./axiosClient";

/**
 * GET /hackathons
 * Accepts optional query params (search, platform, mode, page…) so the
 * backend can do the filtering once you're ready to move it server-side.
 */
export async function fetchHackathons(params = {}) {
  // The API paginates (default 20, max 50 per request). Explore filters
  // client-side, so walk every page and return the full list.
  const limit = 50;
  let page = 1;
  let all = [];
  let total = Infinity;

  while (all.length < total) {
    const { data } = await axiosClient.get("/hackathons", {
      params: { ...params, page, limit },
    });
    const items = Array.isArray(data) ? data : data?.items ?? data?.data ?? [];
    all = all.concat(items);
    total = Number(data?.total ?? all.length);

    if (items.length < limit) break;
    page += 1;
  }

  return all;
}

// Backwards-compatible alias for callers using the explicit "all pages" name.
export const fetchAllHackathons = fetchHackathons;

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
