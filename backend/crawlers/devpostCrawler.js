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

const log = makeLogger("crawler:devpost");
const DEVPOST_URL = "https://devpost.com/hackathons";
const EXPECTED_MIN_RESULTS = Number(process.env.CRAWLER_DEVPOST_MIN_RESULTS || 5);

/**
 * API integration config — OFF by default (DEVPOST_API_ENABLED unset/false).
 * An array so a second/backup endpoint can be added later and
 * fetchFromApiWithFallback() will try them in order automatically — only
 * one entry is populated today.
 *
 * HONEST STATUS: `itemsPath` and `fields` below are best-guess placeholders,
 * not a confirmed response shape — no verified public Devpost API is known
 * as of this writing (see utils/apiDetector.js's weekly probe). Do NOT flip
 * DEVPOST_API_ENABLED=true until you've hit the real endpoint yourself,
 * inspected the actual JSON, and corrected `itemsPath`/`fields` to match.
 * The integration/parsing/fallback-switching code itself is real and wired
 * in below; only the specific field mapping is a placeholder.
 */
const DEVPOST_API_CONFIGS =
  process.env.DEVPOST_API_ENABLED === "true"
    ? [
        {
          url: process.env.DEVPOST_API_URL || "https://devpost.com/api/hackathons",
          itemsPath: "hackathons",
          fields: {
            title: "title",
            link: "url",
            dateText: "submission_period_dates",
            location: "displayed_location.location",
            mode: (item) =>
              /online/i.test(item.displayed_location?.location || "") ? "online" : "offline",
          },
        },
        // Add a backup/mirror endpoint here if one ever exists — it'll be
        // tried automatically if the primary one above fails.
      ]
    : [];

// Layer 1+2: several plausible container selectors, ranked by whichever
// matches the most elements on the live page — the primary selector is
// listed first as the "known good" guess.
const CONTAINER_CANDIDATES = [
  ".hackathon-tile",
  "[class*='hackathon-tile']",
  "div[class*='challenge-listing']",
  "a[href*='devpost.com/software']",
];

function extractFromContainer($, el) {
  const card = $(el);

  const title = firstNonEmpty(
    card.find(".listing-title").text(),
    card.find("h3").text(),
    card.find("h2").text(),
    card.find("[class*='title']").text()
  );

  const rawLink = firstNonEmpty(
    card.find("a.tile-anchor").attr("href"),
    card.is("a") ? card.attr("href") : undefined,
    card.find("a").first().attr("href")
  );
  const link = rawLink ? (rawLink.startsWith("http") ? rawLink : `https://devpost.com${rawLink}`) : null;

  const dateText = firstNonEmpty(
    card.find(".submission-period").text(),
    card.find("[class*='date']").text()
  );
  const location = firstNonEmpty(card.find(".location").text(), card.find("[class*='location']").text()) || "Online";
  const prizePool = firstNonEmpty(card.find(".prize-amount").text(), card.find("[class*='prize']").text());

  return {
    title,
    link,
    dateText,
    location,
    mode: /online/i.test(location) ? "online" : "offline",
    prizePool,
    source: "devpost",
  };
}

/** Shared by both the static-fetch path and the Puppeteer-rendered path. */
function parseListingHtml(html) {
  const $ = cheerio.load(html);
  const results = [];
  let skipped = 0;

  const { selector, count } = pickBestContainerSelector($, CONTAINER_CANDIDATES);

  if (selector && count > 0) {
    $(selector).each((i, el) => {
      try {
        const hackathon = extractFromContainer($, el);
        if (!validateRawHackathon(hackathon)) {
          skipped++;
          return;
        }
        results.push(hackathon);
      } catch (err) {
        log.error(`Failed to parse listing at index ${i}`, { message: err.message });
      }
    });
    log.info(`Container selector "${selector}" matched ${count} elements → ${results.length} valid`, { skipped });
  } else {
    log.warn("None of the known container selectors matched anything on the page");
  }

  return { $, results };
}

/**
 * Crawl Devpost's public hackathon listing page.
 *
 * Defense/fallback layers, in order of preference (cheapest AND most
 * reliable first) — WHICH ONES ACTUALLY RUN is a runtime decision made by
 * strategyEngine.js, not a fixed script:
 *   0.   Real API integration — only attempted if decideStrategy() says
 *        it's worth it (configured AND not repeatedly failing); the
 *        outcome is recorded either way so the next run's decision reflects
 *        what actually just happened
 *   1-2. Flexible + fallback selectors (extractFromContainer)
 *   3.   Structure-based href-pattern scan (extractByHrefPattern)
 *   4.   Puppeteer re-render — in case the static fetch got a JS shell
 *   5.   AI extraction via Ollama — opt-in, only as a final resort
 *
 * NOTE: Devpost's DOM structure changes periodically. This layered approach
 * makes a class-name change survivable, but a full redesign of the page
 * will still eventually need someone to look at CONTAINER_CANDIDATES again.
 */
export async function crawlDevpost() {
  const SOURCE = "devpost";

  // THE RUNTIME DECISION — not "is API configured", but "is API worth
  // trying right now, given what's actually happened recently."
  const decision = decideStrategy(SOURCE, { apiConfigured: DEVPOST_API_CONFIGS.length > 0 });

  if (decision.useApi) {
    const apiResults = await fetchFromApiWithFallback(DEVPOST_API_CONFIGS, { source: SOURCE });
    const validated = (apiResults || []).filter(validateRawHackathon);

    recordOutcome(SOURCE, "api", validated.length > 0, validated.length);

    if (validated.length > 0) {
      log.info(`API integration succeeded for ${SOURCE} — using it, skipping HTML scraping this run`, {
        count: validated.length,
      });
      reportAnomalyIfStillLow(SOURCE, validated.length, EXPECTED_MIN_RESULTS);
      return validated;
    }
    // else: falls through to scraping below — decision engine already
    // logged why (see decideStrategy's `reason` field in the log line above)
  }

  let html;
  try {
    html = await fetchWithRetry(DEVPOST_URL);
  } catch (err) {
    log.error("Failed to fetch listing page after retries", { message: err.message });
    return [];
  }

  let { $, results } = parseListingHtml(html);
  let finalStrategy = "selectors";

  // Layer 3: structural fallback if the selector-based pass came back thin
  if (isCountAnomalous(results.length, EXPECTED_MIN_RESULTS)) {
    const structural = extractByHrefPattern($, { keywords: ["devpost.com/software", "hackathon"], baseUrl: DEVPOST_URL })
      .map((item) => ({ ...item, source: SOURCE, mode: "online" }))
      .filter(validateRawHackathon);

    if (structural.length > results.length) {
      log.warn(`Structural fallback found ${structural.length} candidates vs ${results.length} from selectors — using structural pass`);
      results = structural;
      finalStrategy = "structural";
    }
  }

  // Layer 4: Puppeteer re-render — worth trying if we're still thin, in case
  // the static HTML we got was a JS-rendered shell rather than a broken selector.
  if (results.length < EXPECTED_MIN_RESULTS) {
    const renderedHtml = await renderWithPuppeteer(DEVPOST_URL);
    if (renderedHtml) {
      const rendered = parseListingHtml(renderedHtml);
      if (rendered.results.length > results.length) {
        log.warn(`Puppeteer re-render found ${rendered.results.length} vs ${results.length} from static fetch — using rendered pass`);
        results = rendered.results;
        finalStrategy = "puppeteer";
      }
    }
  }

  // Layer 5: AI fallback — only if we're still coming up empty, and only if
  // explicitly enabled (CRAWLER_AI_FALLBACK_ENABLED=true), since this costs
  // an LLM call and is the slowest/most fragile layer.
  if (results.length === 0) {
    const aiResults = await aiExtractHackathons(html, { source: SOURCE });
    results = aiResults
      .map((r) => ({
        title: r.title,
        link: r.link,
        dateText: r.date,
        location: r.location || "Online",
        mode: /online/i.test(r.location || "") ? "online" : "offline",
        source: SOURCE,
      }))
      .filter(validateRawHackathon);
    if (results.length > 0) finalStrategy = "ai";
  }

  log.info(`Crawl complete: ${results.length} valid listings`);
  recordOutcome(SOURCE, finalStrategy, results.length > 0, results.length);
  reportAnomalyIfStillLow(SOURCE, results.length, EXPECTED_MIN_RESULTS);
  return results;
}
