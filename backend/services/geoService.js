import axios from "axios";
import NodeCache from "node-cache";
import { retryAsync } from "../utils/retry.js";
import { makeLogger } from "../utils/logger.js";

const log = makeLogger("geo");
const EARTH_RADIUS_KM = 6371;
const GEOCODE_TIMEOUT_MS = Number(process.env.GEOCODE_TIMEOUT_MS || 8000);
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const geocodeCache = new NodeCache({ stdTTL: 30 * 24 * 60 * 60, checkperiod: 3600 });

/** Resolve a place string to coordinates, with a no-key fallback for city search. */
export async function geocodeCity(city) {
  if (typeof city !== "string" || !city.trim()) return null;
  const query = city.trim();
  const cacheKey = query.toLowerCase();
  const cached = geocodeCache.get(cacheKey);
  if (cached !== undefined) return cached;

  try {
    const googleKey = process.env.GOOGLE_MAPS_API_KEY;
    let resolved;
    if (googleKey) {
      const { data } = await retryAsync(
        () => axios.get("https://maps.googleapis.com/maps/api/geocode/json", {
          params: { address: query, key: googleKey },
          timeout: GEOCODE_TIMEOUT_MS,
        }),
        { retries: 2, baseDelayMs: 500, label: `Google geocode "${query}"` }
      );
      const result = data?.results?.[0];
      resolved = result
        ? { lat: result.geometry.location.lat, lng: result.geometry.location.lng, formattedAddress: result.formatted_address }
        : null;
    } else {
      const { data } = await retryAsync(
        () => axios.get(NOMINATIM_URL, {
          params: { q: query, format: "jsonv2", limit: 1 },
          headers: { "User-Agent": process.env.GEOCODER_USER_AGENT || "HackHub/1.0 (location discovery)" },
          timeout: GEOCODE_TIMEOUT_MS,
        }),
        { retries: 1, baseDelayMs: 500, label: `Nominatim geocode "${query}"` }
      );
      const result = Array.isArray(data) ? data[0] : null;
      const lat = Number(result?.lat);
      const lng = Number(result?.lon);
      resolved = Number.isFinite(lat) && Number.isFinite(lng)
        ? { lat, lng, formattedAddress: result.display_name || query }
        : null;
    }

    geocodeCache.set(cacheKey, resolved);
    return resolved;
  } catch (err) {
    log.error(`Geocoding failed for "${query}"`, { message: err.message });
    geocodeCache.set(cacheKey, null);
    return null;
  }
}

export function haversineDistanceKm(a, b) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function filterByProximity(hackathons, userCoords, maxKm = 500, { includeOnline = true } = {}) {
  if (!userCoords) return hackathons;

  const nearby = [];
  const online = [];
  for (const h of hackathons) {
    if (h.isOnline === true || h.mode === "online") {
      if (includeOnline) online.push(h);
      continue;
    }
    if (h.latitude == null || h.longitude == null) continue;
    const distanceKm = haversineDistanceKm(userCoords, { lat: h.latitude, lng: h.longitude });
    if (distanceKm <= maxKm) nearby.push({ ...h, distanceKm: Math.round(distanceKm) });
  }
  return [...nearby, ...(includeOnline ? online.slice(0, 1) : [])];
}
