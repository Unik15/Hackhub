import * as cheerio from "cheerio";
import { fetchWithRetry } from "../utils/httpClient.js";
import { validateRawHackathon } from "../utils/validate.js";
import { firstNonEmpty, pickBestContainerSelector, extractByHrefPattern } from "../utils/resilientSelect.js";
import { isCountAnomalous, reportAnomalyIfStillLow } from "../utils/anomalyDetection.js";
import { renderWithPuppeteer } from "../utils/puppeteerFetch.js";
import { aiExtractHackathons } from "../services/aiFallbackParser.js";
import { fetchFromApiWithFallback } from "../utils/apiCrawler.js";
import { decideStrategy, recordOutcome } from "../utils/strategyEngine.js";
import { makeLogger } from "../utils/logger.js";

const log = makeLogger("crawler:source");
const MAX_RESULTS = Number(process.env.CRAWLER_MAX_RESULTS || 500);

/**
 * ========================== SOURCE DESCRIPTORS ==========================
 *
 * A source is data, not code. Adding a new website means adding one
 * descriptor in sources/ — the fallback chain itself is written ONCE below
 * and runs identically for every source (this used to be hand-copied into
 * devpostCrawler.js, unstopCrawler.js and a separate legacy engine).
 *
 * {
 *   key: "devpost",                    // platform enum key
 *   label: "Devpost",
 *   listingUrl: "https://devpost.com/hackathons",
 *   baseUrl: "https://devpost.com",    // for resolving relative hrefs
 *   expectedMinResults: 5,             // below this the next layer runs
 *   maxResults: 500,                   // hard cap on returned listings
 *
 *   apiConfigs: [ { url, params, itemsPath, fields, pagination, filter } ],
 *                                      // optional — verified API layer 0
 *
 *   containers: [".hackathon-tile"],   // candidate card selectors; the one
 *                                      // matching the most elements wins
 *
 *   fields: {                          // how to read one card. Each value is:
 *     title:   ".listing-title",       //   - a CSS selector → its text
 *     link:    { sel: "a", attr: "href" }, // - {sel, attr} → an attribute
 *     link:    { self: true, attr: "href" }, // - {self} → the card element itself
 *     dateText: [".a", ".b"],          //   - an array of the above → first match
 *     dates:   { registrationDeadline: { label: /registration end/i, sel: ".d" } },
 *                                      //   - {label, sel} → sibling of matching text
 *     mode:    (card, $, raw) => ... , //   - a function → derived value
 *   },
 *
 *   defaultLocation: "Online",         // used when the location field is empty
 *   blockedTitles: Set([...]),         // optional — noise filters (nav links etc.)
 *   structural: { keywords: [...], map: (item, src) => ... },
 *                                      // optional — href-pattern fallback knobs
 *   useBrowser: true,                  // allow the Puppeteer re-render layer
 * }
 * =======================================================================
 */

const textOf = (el) => (el.text() || "").replace(/\s+/g, " ").trim();

/** Pulls one spec (one entry of a field list) out of a card element. */
function readOne(card, $, spec) {
  if (typeof spec === "string") {
    const el = card.find(spec).first();
    return el.length ? textOf(el) : "";
  }
  if (spec?.self) {
    if (spec.attr) return card.attr(spec.attr) || "";
    return textOf(card);
  }
  if (spec?.sel) {
    const el = card.find(spec.sel).first();
    if (!el.length) return "";
    return spec.attr ? el.attr(spec.attr) || "" : textOf(el);
  }
  if (spec?.label) {
    // A value shown next to a text label ("Registration End:" → "2026-05-02").
    // Only own-text matches count, so a container div holding many rows is
    // not mistaken for the label itself.
    let found = "";
    card.find("div, span, p, li, td, th, strong, h1, h2, h3, h4, h5, h6").each((_, el) => {
      if (found) return false; // stops cheerio's each
      const text = textOf($(el));
      if (!text || !spec.label.test(text)) return;
      const candidate = spec.sel
        ? $(el).nextAll(spec.sel).first()
        : $(el).next();
      if (candidate.length) {
        found = textOf(candidate);
        return false;
      }
    });
    return found;
  }
  return "";
}

function resolveSpec(card, $, spec) {
  const list = Array.isArray(spec) ? spec : [spec];
  for (const one of list) {
    const value = readOne(card, $, one);
    if (typeof value === "string" ? value.trim() : value) return value;
  }
  return "";
}

/** Maps a descriptor's field specs to the raw hackathon shape. */
function extractFromContainer($, el, src) {
  const card = $(el);
  const specs = src.fields || {};

  const raw = {};
  for (const [name, spec] of Object.entries(specs)) {
    if (typeof spec === "function") continue; // derived last, given the rest
    let value = resolveSpec(card, $, spec);
    if (typeof value === "string" && value.trim() !== "") value = value.trim();
    raw[name] = value;
  }

  // Function fields run last so they can derive from the resolved context
  // (Devpost's mode looks at the location it just parsed).
  for (const [name, spec] of Object.entries(specs)) {
    if (typeof spec === "function") raw[name] = spec(card, $, raw);
  }

  if (src.defaultLocation && !(raw.location && String(raw.location).trim())) {
    raw.location = src.defaultLocation;
  }
  if (!raw.source) raw.source = src.key;

  const rawLink = raw.link ?? raw.url;
  if (rawLink && src.baseUrl && !/^https?:\/\//i.test(String(rawLink))) {
    raw.link = new URL(String(rawLink), src.baseUrl).href;
  }
  return raw;
}

/** Shared by the static-fetch path and the Puppeteer-rendered path. */
function parseListingHtml(html, src) {
  const $ = cheerio.load(html);
  const results = [];
  let skipped = 0;

  const { selector, count } = pickBestContainerSelector($, src.containers || []);

  if (selector && count > 0) {
    $(selector).each((i, el) => {
      try {
        const hackathon = extractFromContainer($, el, src);
        if (
          src.blockedTitles &&
          typeof hackathon.title === "string" &&
          src.blockedTitles.has(hackathon.title.toLowerCase())
        ) {
          skipped++;
          return;
        }
        if (!validateRawHackathon(hackathon)) {
          skipped++;
          return;
        }
        results.push(hackathon);
      } catch (err) {
        log.error(`[${src.key}] failed to parse listing at index ${i}`, { message: err.message });
      }
    });
    log.info(`[${src.key}] container "${selector}" matched ${count} elements → ${results.length} valid`, { skipped });
  } else {
    log.warn(`[${src.key}] none of the known container selectors matched anything on the page`);
  }

  return { $, results };
}

/** Generic AI-layer mapping — matches what every hand-written crawler did. */
function applyAiMapping(items, src) {
  return items
    .map((r) => ({
      title: r.title,
      link: r.link,
      dateText: r.date,
      location: r.location || (src.defaultLocation ?? "Online"),
      mode: /online/i.test(r.location || "") ? "online" : "offline",
      source: src.key,
    }))
    .filter(validateRawHackathon);
}

/**
 * The layered fallback chain for ONE source — the cheapest, most reliable
 * layer that produces enough results wins, and every later layer only
 * replaces the previous one when it finds MORE:
 *
 *   0. API (layer 0) — attempted only if decideStrategy() says it's worth it
 *      this run; the outcome is recorded either way
 *   1. Container selectors — several candidates, best match count wins
 *   2. Structural — href-pattern scan, survives class-name changes
 *   3. Puppeteer re-render — in case the static fetch got a JS shell
 *   4. AI extraction via Ollama — opt-in, only when everything above found 0
 *
 * `apiConfigs` may hold a small result (a half-working API): those rows are
 * kept aside and only win at the end if scraping found fewer than they did.
 */
export async function runSource(src) {
  const min = src.expectedMinResults || 5;
  const maxResults = src.maxResults || MAX_RESULTS;

  // THE RUNTIME DECISION — not "is API configured", but "is API worth
  // trying right now, given what's actually happened recently."
  const decision = decideStrategy(src.key, { apiConfigured: (src.apiConfigs?.length ?? 0) > 0 });

  // Held in case the scrape comes back thinner than a small API result — see
  // the comparison at the end of this function.
  let apiFallbackResults = [];

  if (decision.useApi) {
    const apiResults = await fetchFromApiWithFallback(src.apiConfigs, { source: src.key });
    const validated = (apiResults || []).filter(validateRawHackathon);

    recordOutcome(src.key, "api", validated.length > 0, validated.length);

    if (validated.length >= min) {
      log.info(`[${src.key}] API integration succeeded — using it, skipping HTML scraping this run`, {
        count: validated.length,
      });
      reportAnomalyIfStillLow(src.key, validated.length, min);
      return validated.slice(0, maxResults);
    }

    if (validated.length > 0) {
      // "Some results" is not the same as "enough results". Returning early on
      // any non-zero count let a half-broken API silently replace a healthy
      // scrape. Keep them and let the comparison below decide.
      log.warn(`[${src.key}] API returned only ${validated.length} usable listing(s) (minimum ${min}) — scraping as well`);
      apiFallbackResults = validated;
    }
  }

  let html;
  try {
    html = await fetchWithRetry(src.listingUrl);
  } catch (err) {
    log.error(`[${src.key}] failed to fetch listing page after retries`, { message: err.message });
    // The API may have returned a usable-but-small set; a dead listing page
    // is no reason to throw that away too.
    return apiFallbackResults.slice(0, maxResults);
  }

  let { $, results } = parseListingHtml(html, src);
  let finalStrategy = "selectors";

  // Layer 2: structural fallback if the selector-based pass came back thin
  if (isCountAnomalous(results.length, min)) {
    const structural = extractByHrefPattern($, {
      keywords: src.structural?.keywords || ["hackathon"],
      baseUrl: src.baseUrl || src.listingUrl,
    })
      .map((item) => src.structural?.map ? src.structural.map(item, src) : { ...item, source: src.key })
      .filter(validateRawHackathon);

    if (structural.length > results.length) {
      log.warn(`[${src.key}] structural fallback found ${structural.length} candidates vs ${results.length} from selectors — using structural pass`);
      results = structural;
      finalStrategy = "structural";
    }
  }

  // Layer 3: Puppeteer re-render — worth trying if we're still thin, in case
  // the static HTML we got was a JS-rendered shell rather than a broken selector.
  if (results.length < min && src.useBrowser !== false) {
    const renderedHtml = await renderWithPuppeteer(src.listingUrl);
    if (renderedHtml) {
      const rendered = parseListingHtml(renderedHtml, src);
      if (rendered.results.length > results.length) {
        log.warn(`[${src.key}] Puppeteer re-render found ${rendered.results.length} vs ${results.length} from static fetch — using rendered pass`);
        results = rendered.results;
        finalStrategy = "puppeteer";
      }
    }
  }

  // Layer 4: AI fallback — only if we're still coming up empty, and only if
  // explicitly enabled (CRAWLER_AI_FALLBACK_ENABLED=true), since this costs
  // an LLM call and is the slowest/most fragile layer.
  if (results.length === 0) {
    const aiResults = await aiExtractHackathons(html, { source: src.key });
    results = applyAiMapping(aiResults, src);
    if (results.length > 0) finalStrategy = "ai";
  }

  if (apiFallbackResults.length > results.length) {
    log.warn(`[${src.key}] keeping the ${apiFallbackResults.length} API listing(s) instead of ${results.length} scraped one(s)`);
    results = apiFallbackResults;
    finalStrategy = "api";
  }

  log.info(`[${src.key}] crawl complete: ${results.length} valid listings`, { strategy: finalStrategy });
  recordOutcome(src.key, finalStrategy, results.length > 0, results.length);
  reportAnomalyIfStillLow(src.key, results.length, min);
  return results.slice(0, maxResults);
}
