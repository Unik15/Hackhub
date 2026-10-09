import axios from "axios";
import NodeCache from "node-cache";
import { retryAsync } from "../utils/retry.js";
import { makeLogger } from "../utils/logger.js";

const log = makeLogger("geo");

const EARTH_RADIUS_KM = 6371;
const GEOCODE_TIMEOUT_MS = Number(process.env.GEOCODE_TIMEOUT_MS || 8000);

// Resource optimization: city → coordinates almost never changes, so caching
// avoids paying for (and waiting on) the Google Maps API repeatedly for the
// same city — both within one crawl run (many hackathons often share a city)
// and across runs, for as long as the process stays up. 30 days is generous
// since geocoding results are effectively static.
const geocodeCache = new NodeCache({ stdTTL: 30 * 24 * 60 * 60, checkperiod: 3600 });

/**
 * Convert a city name into { lat, lng } using Google Maps Geocoding API.
 * Has an explicit request timeout (previously missing — an unresponsive
 * Maps API could hang a crawl run indefinitely), retries transient
 * failures, and caches results per city to cut down on redundant paid
 * API calls.
 */
export async function geocodeCity(city) {
  if (!city) return null;
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) {
    log.warn("GOOGLE_MAPS_API_KEY not set — skipping geocode");
    return null;
  }

  const cacheKey = city.trim().toLowerCase();
  const cached = geocodeCache.get(cacheKey);
  if (cached !== undefined) return cached;

  try {
    const { data } = await retryAsync(
      () =>
        axios.get("https://maps.googleapis.com/maps/api/geocode/json", {
          params: { address: city, key },
          timeout: GEOCODE_TIMEOUT_MS,
        }),
      { retries: 2, baseDelayMs: 500, label: `Geocode "${city}"` }
    );

    const result = data?.results?.[0];
    const resolved = result
      ? { lat: result.geometry.location.lat, lng: result.geometry.location.lng, formattedAddress: result.formatted_address }
      : null;

    geocodeCache.set(cacheKey, resolved); // cache the miss too, so a bad city string isn't retried every item
    return resolved;
  } catch (err) {
    log.error(`Geocoding failed for "${city}" after retries`, { message: err.message });
    return null; // degrade gracefully — the hackathon just won't have coordinates this run
  }
}

/**
 * Haversine great-circle distance between two [lat,lng] points, in km.
 */
export function haversineDistanceKm(a, b) {
  const toRad = (deg) => (deg * Math.PI) / 180;

  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);

  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return EARTH_RADIUS_KM * c;
}

/**
 * Filter a list of hackathons (flat `latitude`/`longitude` columns, as returned
 * by hackathonRepo) down to those within maxKm of the user, always keeping
 * at least one online event.
 */
export function filterByProximity(hackathons, userCoords, maxKm = 500, { includeOnline = true } = {}) {
  if (!userCoords) return hackathons;

  const nearby = [];
  const online = [];

  for (const h of hackathons) {
    if (h.isOnline === true || h.mode === "online") {
      if (includeOnline) online.push(h);
      continue;
    }
    if (h.latitude == null || h.longitude == null) continue; // no coords, skip from proximity calc

    const dist = haversineDistanceKm(userCoords, { lat: h.latitude, lng: h.longitude });
    if (dist <= maxKm) {
      nearby.push({ ...h, distanceKm: Math.round(dist) });
    }
  }

  // Guarantee at least one online hackathon makes it into the result set
  const guaranteedOnline = online.length ? online.slice(0, 1) : [];
  return [...nearby, ...guaranteedOnline];
}
