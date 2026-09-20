import axios from "axios";
import { retryAsync } from "./retry.js";
import { withTimeout } from "./timeout.js";
import { throttleHost } from "./rateLimiter.js";
import { makeLogger } from "./logger.js";

const log = makeLogger("api-crawler");
const API_TIMEOUT_MS = Number(process.env.API_INTEGRATION_TIMEOUT_MS || 10000);

/** Resolves a dot-path like "data.results" or "items[0].name" against an object. */
function getPath(obj, path) {
  if (!path) return undefined;
  return path.split(".").reduce((acc, key) => {
    if (acc == null) return undefined;
    const arrayMatch = key.match(/^(\w+)\[(\d+)\]$/);
    if (arrayMatch) return acc[arrayMatch[1]]?.[Number(arrayMatch[2])];
    return acc[key];
  }, obj);
}

/**
 * Maps one raw API item to our normalized hackathon shape using a
 * field-mapping config. Each field can be a dot-path string ("title",
 * "location.city") or a function `(item) => value` for anything that needs
 * real logic (e.g. deriving mode from a boolean flag).
 */
function parseApiItem(item, fields, source) {
  const resolve = (spec) => (typeof spec === "function" ? spec(item) : getPath(item, spec));

  const title = fields.title ? resolve(fields.title) : undefined;
  const link = fields.link ? resolve(fields.link) : undefined;
  if (!title || !link) return null; // same validation bar as the scraping path — no title/link, no entry

  return {
    title: String(title),
    link: String(link),
    dateText: fields.dateText ? String(resolve(fields.dateText) ?? "") : "",
    location: fields.location ? String(resolve(fields.location) ?? "") : "",
    mode: fields.mode ? resolve(fields.mode) : "online",
    source,
  };
}

/**
 * Fetches and parses hackathon listings from a real API, given a config:
 *
 * {
 *   url, method = "GET", params, headers,
 *   itemsPath: "data.results",   // dot-path to the array of items in the response body
 *   fields: {
 *     title: "name",
 *     link: "url",
 *     dateText: "deadline",
 *     location: "location.city",
 *     mode: (item) => item.is_online ? "online" : "offline",
 *   }
 * }
 *
 * Returns `null` (never throws) if no config is provided, the request
 * fails, or the response doesn't match the expected shape — callers should
 * treat `null` as "API path unavailable this run" and fall back to HTML
 * scraping, which is exactly what devpostCrawler.js / unstopCrawler.js do.
 */
export async function fetchFromApi(config, { source = "unknown" } = {}) {
  if (!config?.url) return null; // no API configured for this source

  try {
    const response = await withTimeout(
      retryAsync(
        async () => {
          await throttleHost(config.url);
          return axios.request({
            url: config.url,
            method: config.method || "GET",
            params: config.params,
            headers: { "User-Agent": "HackHubBot/1.0", Accept: "application/json", ...config.headers },
            timeout: API_TIMEOUT_MS,
          });
        },
        { retries: 2, baseDelayMs: 1000, label: `API fetch for ${source}` }
      ),
      API_TIMEOUT_MS + 5000,
      `API fetch for ${source}`
    );

    const items = config.itemsPath ? getPath(response.data, config.itemsPath) : response.data;
    if (!Array.isArray(items)) {
      log.warn(`API response for ${source} didn't contain an array at the expected path`, {
        itemsPath: config.itemsPath,
      });
      return null;
    }

    const parsed = items.map((item) => parseApiItem(item, config.fields || {}, source)).filter(Boolean);
    log.info(`API integration for ${source} parsed ${parsed.length}/${items.length} item(s)`);
    return parsed;
  } catch (err) {
    log.warn(`API integration failed for ${source} — falling back to HTML scraping`, {
      message: err.message,
    });
    return null;
  }
}

/**
 * Tries a list of API configs in order, returning the first one that
 * produces results. This is the API→API fallback layer (distinct from the
 * API→scraping fallback the crawlers implement themselves): useful once a
 * source has, say, a primary endpoint and a documented backup/mirror, or
 * during a migration between two API versions.
 *
 * Returns `null` if every config in the list fails or is unconfigured —
 * same contract as fetchFromApi(), so callers don't need to know whether
 * they're dealing with one config or several.
 */
export async function fetchFromApiWithFallback(configs, { source = "unknown" } = {}) {
  const list = (Array.isArray(configs) ? configs : [configs]).filter(Boolean);

  for (const config of list) {
    const result = await fetchFromApi(config, { source });
    if (result && result.length > 0) return result;
    log.warn(`API config for ${source} (${config.url}) produced no usable results — trying next candidate, if any`);
  }

  return null;
}
