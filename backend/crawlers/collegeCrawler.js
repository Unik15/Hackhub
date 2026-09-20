import * as cheerio from "cheerio";
import { fetchWithRetry, delay } from "../utils/httpClient.js";
import { validateRawHackathon } from "../utils/validate.js";
import { makeLogger } from "../utils/logger.js";

const log = makeLogger("crawler:college");

// Be polite between hitting different college domains — avoids hammering
// several small institutional sites back-to-back.
const BETWEEN_SOURCE_DELAY_MS = Number(process.env.CRAWLER_SOURCE_DELAY_MS || 1500);

/**
 * College hackathon pages don't share a common structure, so each source
 * is configured individually: a URL plus CSS selectors describing how to
 * pull a title/link/date out of each listing item on that specific page.
 * Add new colleges by appending to COLLEGE_SOURCES — no code changes needed.
 */
export const COLLEGE_SOURCES = [
  // Example entry — replace with real college event pages you want to track:
  // {
  //   name: "IIT Example Tech Fest",
  //   url: "https://example.edu/events/hackathons",
  //   itemSelector: ".event-card",
  //   titleSelector: ".event-title",
  //   linkSelector: "a",
  //   dateSelector: ".event-date",
  // },
];

export async function crawlCollegeSites(sources = COLLEGE_SOURCES) {
  const results = [];

  for (const src of sources) {
    try {
      const html = await fetchWithRetry(src.url);
      const $ = cheerio.load(html);
      let sourceCount = 0;
      let skipped = 0;

      $(src.itemSelector).each((i, el) => {
        try {
          const card = $(el);
          const title = card.find(src.titleSelector).text().trim();
          let link = card.find(src.linkSelector).attr("href");
          const dateText = src.dateSelector ? card.find(src.dateSelector).text().trim() : "";

          if (link && !link.startsWith("http")) {
            const base = new URL(src.url);
            link = `${base.origin}${link.startsWith("/") ? "" : "/"}${link}`;
          }

          const hackathon = {
            title,
            link,
            dateText,
            organizer: src.name,
            source: "college",
          };

          if (!validateRawHackathon(hackathon)) {
            skipped++;
            return;
          }

          results.push(hackathon);
          sourceCount++;
        } catch (err) {
          log.error(`Failed to parse item ${i} for ${src.name}`, { message: err.message });
        }
      });

      log.info(`${src.name}: ${sourceCount} valid listings (${skipped} skipped)`);
    } catch (err) {
      // One college site being down/blocked shouldn't stop the rest from
      // being crawled — log and move on to the next source.
      log.error(`Failed to fetch ${src.name} after retries`, { message: err.message });
    }

    // Small politeness delay between distinct institutional domains
    if (sources.indexOf(src) < sources.length - 1) {
      await delay(BETWEEN_SOURCE_DELAY_MS);
    }
  }

  return results;
}
