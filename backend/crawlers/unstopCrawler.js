import * as cheerio from "cheerio";
import { fetchWithRetry } from "../utils/httpClient.js";
import { validateRawHackathon } from "../utils/validate.js";
import { makeLogger } from "../utils/logger.js";
import { firstNonEmpty, pickBestContainerSelector, extractByHrefPattern } from "../utils/resilientSelect.js";
import { isCountAnomalous, reportAnomalyIfStillLow } from "../utils/anomalyDetection.js";
import { renderWithPuppeteer } from "../utils/puppeteerFetch.js";
import { aiExtractHackathons } from "../services/aiFallbackParser.js";
import { fetchFromApiWithFallback } from "../utils/apiCrawler.js";
import { decideStrategy, recordOutcome } from "../utils/strategyEngine.js";

const log = makeLogger("crawler:unstop");

const UNSTOP_URL = "https://unstop.com/hackathons";
const UNSTOP_HOSTS = new Set(["unstop.com", "www.unstop.com"]);

const EXPECTED_MIN_RESULTS = Math.max(
  0,
  Number(process.env.CRAWLER_UNSTOP_MIN_RESULTS || 5)
);

const MAX_RESULTS = Math.max(
  1,
  Number(process.env.CRAWLER_UNSTOP_MAX_RESULTS || 200)
);

const BLOCKED_TITLES = new Set([
  "view all",
  "view more",
  "apply now",
  "register now",
  "hackathons",
  "register",
  "login",
  "sign up",
]);

const UNSTOP_BASE_URL = "https://unstop.com";

const UNSTOP_API_ENABLED =
  process.env.UNSTOP_API_ENABLED === "true";

const UNSTOP_API_URL =
  process.env.UNSTOP_API_URL?.trim() || null;

const UNSTOP_API_CONFIGS =
  UNSTOP_API_ENABLED && UNSTOP_API_URL
    ? [
        {
          url: UNSTOP_API_URL,

          itemsPath: "data.data",

          fields: {
            title: "title",

            link: (item) => {
              const raw =
                item.public_url ||
                item.seo_url;

              if (!raw) {
                return null;
              }

              try {
                return new URL(
                  raw,
                  UNSTOP_BASE_URL
                ).href;
              } catch {
                return null;
              }
            },

            dateText:
              "regnRequirements.end_regd_dt",

            location: "region",

            mode: (item) => {
              const value = String(
                item.region ?? ""
              )
                .trim()
                .toLowerCase();

              switch (value) {
                case "online":
                  return "online";

                case "offline":
                  return "offline";

                case "hybrid":
                  return "hybrid";

                default:
                  return null;
              }
            },
          },
        },
      ]
    : [];

const CONTAINER_CANDIDATES = [
  ".opportunity-card",
  ".card-wrapper",
  "[class*='opportunity-card']",
  "[class*='opportunityCard']",
];

/**
 * Normalize and validate an Unstop URL.
 *
 * - Resolves relative URLs.
 * - Removes query parameters and hashes.
 * - Removes trailing slash.
 * - Rejects non-Unstop hosts.
 * - Rejects URLs that are not hackathon detail pages.
 */
function normalizeUrl(href) {
  if (!href || typeof href !== "string") {
    return null;
  }

  try {
    const url = new URL(href.trim(), UNSTOP_URL);

    url.search = "";
    url.hash = "";

    if (!UNSTOP_HOSTS.has(url.hostname.toLowerCase())) {
      return null;
    }

    if (!url.pathname.toLowerCase().startsWith("/hackathons/")) {
      return null;
    }

    return url.href.replace(/\/$/, "");
  } catch {
    return null;
  }
}

/**
 * Normalize text for consistent storage/search.
 */
function normalizeText(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extract hackathon data from a container/card.
 *
 * This intentionally returns a raw object.
 * Final normalization/validation happens in addResult().
 */
function extractFromContainer($, el) {
  const card = $(el);

  const title = firstNonEmpty(
    card.find(".op-title").first().text(),
    card.find(".title").first().text(),
    card.find("[class*='title']").first().text(),
    card.find("h1,h2,h3,h4,h5,h6").first().text(),
    card.attr("aria-label"),
    card.attr("title"),
    card.text()
  );

  const rawLink = firstNonEmpty(
    card.is("a") ? card.attr("href") : undefined,
    card.find("a[href*='/hackathons/']").first().attr("href"),
    card.find("a[href*='/hackathon/']").first().attr("href")
  );

  const organizer = firstNonEmpty(
    card.find(".org-name").first().text(),
    card.find(".organizer").first().text()
  );

  const deadlineText = firstNonEmpty(
    card.find(".regDate").first().text(),
    card.find(".deadline").first().text()
  );

  const locationCity = firstNonEmpty(
    card.find(".location").first().text(),
    card.find("[class*='location']").first().text()
  );

  return {
    title,
    url: rawLink,
    organizer,
    deadlineText,
    locationCity,
    source: "unstop",
  };
}

/**
 * Shared parser for:
 *   1. Direct URL-pattern extraction
 *   2. Container/card extraction
 *
 * Both strategies feed through addResult(), ensuring:
 *   - normalization
 *   - validation
 *   - hostname/path verification
 *   - deduplication
 */
export function parseListingHtml(html) {
  if (typeof html !== "string" || html.trim().length === 0) {
    log.warn("Unstop parser received empty HTML");

    return {
      $: cheerio.load(""),
      results: [],
    };
  }

  const $ = cheerio.load(html);

  const results = [];
  const seenUrls = new Set();

  let skipped = 0;
  let directCandidates = 0;
  let containerCandidates = 0;

  log.info("Unstop parser diagnostics", {
    hackathonLinks: $("a[href*='/hackathons/']").length,
    allAnchors: $("a").length,
    htmlLength: html.length,
  });

  /**
   * Central result ingestion function.
   */
  function addResult(raw) {
    if (!raw || typeof raw !== "object") {
      skipped += 1;
      return;
    }

    const title = normalizeText(raw.title);
    const url = normalizeUrl(raw.url || raw.link);

    // Basic validation
   if (!title || title.length < 5 || !url) {
  skipped += 1;

  log.warn("Unstop result rejected: basic validation", {
    title,
    titleLength: title?.length || 0,
    url,
  });

  return;
}

    // Reject obvious navigation/UI elements
   if (BLOCKED_TITLES.has(title.toLowerCase())) {
  skipped += 1;

  log.warn("Unstop result rejected: blocked title", {
    title,
    url,
  });

  return;
}

    // URL must already have passed normalizeUrl()
    if (seenUrls.has(url)) {
      return;
    }

    // Preserve known mode/isOnline information.
    // Do NOT assume every Unstop listing is online.
    const mode =
      typeof raw.mode === "string" && raw.mode.trim()
        ? normalizeText(raw.mode).toLowerCase()
        : null;

    let isOnline = null;

    if (typeof raw.isOnline === "boolean") {
      isOnline = raw.isOnline;
    } else if (mode === "online") {
      isOnline = true;
    } else if (mode === "offline") {
      isOnline = false;
    }

   const item = {
  title,

  // Keep both names for compatibility with the existing
  // crawler contract and the DB/API layer.
  url,
  link: url,

  platform: "unstop",

  sourceName: "Unstop",
  sourceUrl: UNSTOP_URL,

  source: "unstop",

  organizer: normalizeText(raw.organizer),

  deadlineText: raw.deadlineText
    ? normalizeText(raw.deadlineText)
    : null,

  locationCity: normalizeText(raw.locationCity),

  mode,
  isOnline,

  prizePool: normalizeText(raw.prizePool),

  domain: Array.isArray(raw.domain)
    ? raw.domain
    : [],

  tags: Array.isArray(raw.tags)
    ? raw.tags
    : [],
};

   if (!validateRawHackathon(item)) {
  skipped += 1;

  log.warn("Unstop result rejected: schema validation", {
    title: item.title,
    url: item.url,
    platform: item.platform,
    source: item.source,
    mode: item.mode,
    isOnline: item.isOnline,
  });

  return;
}

    seenUrls.add(url);
    results.push(item);
  }

  // ============================================================
  // 1. DIRECT URL-PATTERN EXTRACTION
  // ============================================================
  const directLinks = $("a[href*='/hackathons/']");

  directCandidates = directLinks.length;

  directLinks.each((index, el) => {
    try {
      const href = $(el).attr("href");

      if (!href) {
        skipped += 1;
        return;
      }

      const title = firstNonEmpty(
        $(el).find("h1,h2,h3,h4,h5,h6").first().text(),
        $(el).attr("aria-label"),
        $(el).attr("title"),
        $(el).find("[class*='title']").first().text(),
        $(el).text()
      );

      addResult({
        title,
        url: href,
        // Unknown at listing-page level unless explicitly available.
        isOnline: null,
      });
    } catch (err) {
      skipped += 1;

      log.warn("Unstop direct-link parse failed", {
        index,
        message: err?.message || String(err),
      });
    }

    // Hard protection against pathological pages.
    if (results.length >= MAX_RESULTS) {
      return false;
    }

    return undefined;
  });

  // ============================================================
  // 2. CONTAINER/CARD EXTRACTION
  // ============================================================
  const { selector, count } = pickBestContainerSelector(
    $,
    CONTAINER_CANDIDATES
  );

  if (selector && count > 0 && results.length < MAX_RESULTS) {
    containerCandidates = count;

    $(selector).each((index, el) => {
      try {
        if (results.length >= MAX_RESULTS) {
          return false;
        }

        const hackathon = extractFromContainer($, el);

        if (!hackathon) {
          skipped += 1;
          return;
        }

        addResult(hackathon);
      } catch (err) {
        skipped += 1;

        log.error("Unstop container parse failed", {
          index,
          selector,
          message: err?.message || String(err),
        });
      }

      return undefined;
    });

    log.info(`Unstop container extraction completed`, {
      selector,
      candidates: containerCandidates,
      valid: results.length,
      skipped,
    });
  } else if (!selector || count === 0) {
    log.warn("None of the known Unstop container selectors matched", {
      candidates: CONTAINER_CANDIDATES,
      directCandidates,
    });
  }

  // ============================================================
  // 3. FINAL DIAGNOSTICS / ANOMALY SIGNAL
  // ============================================================
  if (results.length === 0) {
    log.warn("Unstop parser returned 0 valid listings", {
      directCandidates,
      containerCandidates,
      skipped,
      htmlLength: html.length,
    });
  } else if (
    EXPECTED_MIN_RESULTS > 0 &&
    results.length < EXPECTED_MIN_RESULTS
  ) {
    log.warn("Unstop parser returned unusually few listings", {
      resultCount: results.length,
      expectedMinimum: EXPECTED_MIN_RESULTS,
      directCandidates,
      containerCandidates,
      skipped,
    });
  }

  log.info("Unstop parser complete", {
    results: results.length,
    skipped,
    directCandidates,
    containerCandidates,
  });

  return {
    $,
    results,
  };
}

export async function crawlUnstop() {
  const SOURCE = "unstop";

  const decision = decideStrategy(SOURCE, {
    apiConfigured: UNSTOP_API_CONFIGS.length > 0,
  });

  // ============================================================
  // 1. API FALLBACK
  // ============================================================
  if (decision.useApi) {
    try {
      const apiResults = await fetchFromApiWithFallback(
        UNSTOP_API_CONFIGS,
        { source: SOURCE }
      );

      const validated = (apiResults || []).filter(validateRawHackathon);

      recordOutcome(
        SOURCE,
        "api",
        validated.length > 0,
        validated.length
      );

      if (validated.length > 0) {
        log.info(
          `API integration succeeded for ${SOURCE}`,
          { count: validated.length }
        );

        reportAnomalyIfStillLow(
          SOURCE,
          validated.length,
          EXPECTED_MIN_RESULTS
        );

        return validated.slice(0, MAX_RESULTS);
      }
    } catch (err) {
      log.warn("Unstop API fallback failed", {
        message: err?.message || String(err),
      });
    }
  }

  // ============================================================
  // 2. STATIC HTML
  // ============================================================
  let html;

  try {
    html = await fetchWithRetry(UNSTOP_URL);
  } catch (err) {
    log.error("Failed to fetch Unstop listing page", {
      message: err?.message || String(err),
    });

    recordOutcome(SOURCE, "html", false, 0);

    return [];
  }

  let { $, results } = parseListingHtml(html);

  let finalStrategy = "selectors";

  // ============================================================
  // 3. STRUCTURAL FALLBACK
  // ============================================================
  if (
    isCountAnomalous(
      results.length,
      EXPECTED_MIN_RESULTS
    )
  ) {
    try {
      const structural = extractByHrefPattern($, {
        keywords: ["/hackathons/", "/hackathon/", "/challenge/"],
        baseUrl: UNSTOP_URL,
      })
        .map((item) => ({
          ...item,
          source: SOURCE,
          platform: SOURCE,
        }))
        .filter(validateRawHackathon);

      if (structural.length > results.length) {
        log.warn(
          `Structural fallback found ${structural.length} candidates vs ${results.length} from selectors — using structural pass`
        );

        results = structural.slice(0, MAX_RESULTS);
        finalStrategy = "structural";
      }
    } catch (err) {
      log.warn("Unstop structural fallback failed", {
        message: err?.message || String(err),
      });
    }
  }

  // ============================================================
  // 4. PUPPETEER FALLBACK
  // ============================================================
  if (results.length < EXPECTED_MIN_RESULTS) {
    try {
      const renderedHtml =
        await renderWithPuppeteer(UNSTOP_URL);

      if (renderedHtml) {
        const rendered =
          parseListingHtml(renderedHtml);

        if (
          rendered.results.length > results.length
        ) {
          log.warn(
            `Puppeteer re-render found ${rendered.results.length} vs ${results.length} from static fetch — using rendered pass`
          );

          results = rendered.results.slice(
            0,
            MAX_RESULTS
          );

          finalStrategy = "puppeteer";
        }
      }
    } catch (err) {
      log.warn("Unstop Puppeteer fallback failed", {
        message: err?.message || String(err),
      });
    }
  }

  // ============================================================
  // 5. AI FALLBACK
  // ============================================================
  if (
    results.length === 0 &&
    process.env.CRAWLER_AI_FALLBACK_ENABLED === "true"
  ) {
    try {
      const aiResults =
        await aiExtractHackathons(html, {
          source: SOURCE,
        });

      results = (aiResults || [])
        .map((r) => ({
          title: r.title,
          url: r.url || r.link,
          link: r.link || r.url,
          source: SOURCE,
          platform: SOURCE,
          deadlineText: r.date || null,
        }))
        .filter(validateRawHackathon)
        .slice(0, MAX_RESULTS);

      if (results.length > 0) {
        finalStrategy = "ai";
      }
    } catch (err) {
      log.warn("Unstop AI fallback failed", {
        message: err?.message || String(err),
      });
    }
  }

  // ============================================================
  // 6. FINAL RESULT
  // ============================================================
  log.info(
    `Crawl complete: ${results.length} valid listings`,
    {
      strategy: finalStrategy,
    }
  );

  recordOutcome(
    SOURCE,
    finalStrategy,
    results.length > 0,
    results.length
  );

  reportAnomalyIfStillLow(
    SOURCE,
    results.length,
    EXPECTED_MIN_RESULTS
  );

  return results.slice(0, MAX_RESULTS);
}