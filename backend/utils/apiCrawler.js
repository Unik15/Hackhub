import axios from "axios";
import { retryAsync } from "./retry.js";
import { withTimeout } from "./timeout.js";
import { throttleHost } from "./rateLimiter.js";
import { makeLogger } from "./logger.js";

const log = makeLogger("api-crawler");
const API_TIMEOUT_MS = Number(process.env.API_INTEGRATION_TIMEOUT_MS || 10000);

/**
 * Defaults applied only when a config opts into pagination with a `pagination`
 * block. A config without one keeps the original single-request behaviour, so
 * adding pagination to one source cannot change how another one is fetched.
 */
const PAGINATION_DEFAULTS = {
  pageParam: "page",
  perPageParam: "per_page",
  perPage: null,
  startPage: 1,
  maxPages: 5,
  maxResults: 200,
};

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
 * API responses occasionally embed presentation markup in what is nominally a
 * plain field — Devpost's prize_amount arrives as
 * "$<span data-currency-value>50,000</span>". Storing that verbatim would put
 * HTML in the database and render as raw tags in the UI.
 */
export function stripHtml(value) {
  if (value == null) return "";
  return String(value)
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Maps one raw API item to our normalized hackathon shape using a
 * field-mapping config. Each field can be a dot-path string ("title",
 * "location.city") or a function `(item) => value` for anything that needs
 * real logic (e.g. deriving mode from a boolean flag).
 *
 * The output shape matches what the HTML scrapers produce, so both paths flow
 * through the same normalize() → dedupeWithinRun() pipeline in
 * crawlers/index.js. Fields the API exposes but the HTML path cannot are
 * simply absent there, not special-cased here.
 */
function parseApiItem(item, fields, source) {
  const resolve = (spec) => (typeof spec === "function" ? spec(item) : getPath(item, spec));
  const asText = (spec) => {
    const value = spec ? resolve(spec) : undefined;
    return value == null ? "" : String(value).trim();
  };
  const asList = (spec) => {
    const value = spec ? resolve(spec) : undefined;
    return Array.isArray(value) ? value.filter((entry) => typeof entry === "string" && entry.trim() !== "") : [];
  };

  const title = fields.title ? resolve(fields.title) : undefined;
  const link = fields.link ? resolve(fields.link) : undefined;
  if (!title || !link) return null; // same validation bar as the scraping path — no title/link, no entry

  const location = asText(fields.location);
  const mode = fields.mode ? resolve(fields.mode) : undefined;

  return {
    title: String(title),
    link: String(link),
    source,

    // Sources that expose real timestamps get them passed straight through, so
    // normalize() never has to re-parse a display string for them. dateText
    // remains for sources that only publish a human-readable range.
    dateText: asText(fields.dateText),
    startDate: asText(fields.startDate) || null,
    endDate: asText(fields.endDate) || null,
    registrationDeadline: asText(fields.registrationDeadline) || null,

    location,
    mode: mode || (location ? "offline" : "online"),
    // Left undefined when unmapped so normalize() derives it from mode.
    isOnline: fields.isOnline ? resolve(fields.isOnline) : undefined,

    organizer: asText(fields.organizer),
    prizePool: asText(fields.prizePool),
    domain: asList(fields.domain),
    tags: asList(fields.tags),

    sourceName: asText(fields.sourceName) || undefined,
    sourceUrl: asText(fields.sourceUrl) || null,
  };
}

/**
 * One HTTP round-trip for a single page. Retries and the host throttle live
 * here so every page in a paginated run gets the same treatment as a single
 * request did before pagination existed.
 */
async function requestPage(config, pagination, page, source) {
  const params = { ...(config.params || {}) };

  if (pagination) {
    params[pagination.pageParam] = page;
    if (pagination.perPage && pagination.perPageParam) {
      params[pagination.perPageParam] = pagination.perPage;
    }
  }

  const response = await withTimeout(
    retryAsync(
      async () => {
        await throttleHost(config.url);
        return axios.request({
          url: config.url,
          method: config.method || "GET",
          params,
          headers: { "User-Agent": "HackHubBot/1.0", Accept: "application/json", ...config.headers },
          timeout: API_TIMEOUT_MS,
        });
      },
      { retries: 2, baseDelayMs: 1000, label: `API fetch for ${source}` }
    ),
    API_TIMEOUT_MS + 5000,
    `API fetch for ${source}`
  );

  return response.data;
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
 *   },
 *   filter: (item) => item.status !== "FINISHED",  // optional, runs on the raw item
 *   pagination: {                // optional — omit for a single request
 *     pageParam: "page",         // query param carrying the page number
 *     perPageParam: "per_page",
 *     perPage: 40,
 *     startPage: 1,
 *     maxPages: 5,
 *     maxResults: 200,
 *   },
 * }
 *
 * Returns `null` (never throws) if no config is provided, the first page
 * fails, or the response doesn't match the expected shape — callers should
 * treat `null` as "API path unavailable this run" and fall back to HTML
 * scraping, which is exactly what devpostCrawler.js / unstopCrawler.js do.
 *
 * A *later* page failing is different: by then we already hold usable data,
 * so the partial result is returned rather than thrown away. Losing page 4
 * should not cost us pages 1-3.
 */
export async function fetchFromApi(config, { source = "unknown" } = {}) {
  if (!config?.url) return null; // no API configured for this source

  const pagination = config.pagination ? { ...PAGINATION_DEFAULTS, ...config.pagination } : null;
  const maxPages = pagination ? pagination.maxPages : 1;
  const maxResults = pagination ? pagination.maxResults : Infinity;
  const startPage = pagination ? pagination.startPage : 1;

  const collected = [];
  const seenLinks = new Set();

  for (let offset = 0; offset < maxPages; offset++) {
    const page = startPage + offset;

    let data;
    try {
      data = await requestPage(config, pagination, page, source);
    } catch (err) {
      log.warn(`API page ${page} for ${source} failed`, { message: err.message });
      if (collected.length === 0) return null;
      break;
    }

    const items = config.itemsPath ? getPath(data, config.itemsPath) : data;
    if (!Array.isArray(items)) {
      log.warn(`API response for ${source} didn't contain an array at the expected path`, {
        itemsPath: config.itemsPath,
        page,
      });
      if (collected.length === 0) return null;
      break;
    }

    if (items.length === 0) break; // walked past the last page

    let added = 0;
    let filtered = 0;
    for (const item of items) {
      // Applied to the raw item, before field mapping, so a config can drop
      // rows the API returns but we never want — Unstop mixes finished events
      // into its listing and its query params cannot filter them out.
      if (config.filter && !config.filter(item)) {
        filtered += 1;
        continue;
      }

      const parsed = parseApiItem(item, config.fields || {}, source);
      if (!parsed) continue;

      // Listings shift between page requests — a new hackathon published
      // mid-crawl pushes everything down one slot, so a row can legitimately
      // appear on two pages. The link is the only stable identity available
      // before dedupe_hash is computed.
      if (seenLinks.has(parsed.link)) continue;
      seenLinks.add(parsed.link);
      collected.push(parsed);
      added += 1;

      if (collected.length >= maxResults) break;
    }

    log.info(
      `API page ${page} for ${source}: ${items.length} raw, ${filtered} filtered, ${added} new, ${collected.length} kept`
    );

    if (collected.length >= maxResults) break;
    // A whole page of repeats means pagination has looped or shifted past the
    // window we care about; there is nothing new further down. A page that was
    // entirely filtered out is different — those rows were dropped on purpose
    // and the pages behind them may still hold live listings.
    if (added === 0 && items.length > filtered && offset > 0) break;
  }

  if (collected.length === 0) {
    log.warn(`API integration for ${source} returned no usable items — treating the API as unavailable`);
    return null;
  }

  return collected;
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
