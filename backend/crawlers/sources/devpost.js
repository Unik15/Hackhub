import { stripHtml } from "../../utils/apiCrawler.js";

/**
 * Devpost as data. New behavior lives in runSource() — this file only
 * describes the site: where the listing lives, which API to prefer, which
 * containers hold a card, and how to read one.
 */

/**
 * Verified against the live endpoint (checked 2026-10-30):
 *   GET https://devpost.com/api/hackathons?status=open&page=1&per_page=40
 *   -> { hackathons: [...], meta: { total_count, per_page } }
 *
 * `status=open` is what makes this usable: the unfiltered listing reports
 * 14,207 hackathons, nearly all of them finished, while the open filter
 * reports 48. The server caps per_page at 40, so those 48 take two pages.
 *
 * An array so a second/backup endpoint can be added later and
 * fetchFromApiWithFallback() will try them in order automatically.
 */
export const DEVPOST_API_CONFIGS =
  process.env.DEVPOST_API_ENABLED !== "false"
    ? [
        {
          url: process.env.DEVPOST_API_URL || "https://devpost.com/api/hackathons",
          params: { status: "open" },
          itemsPath: "hackathons",
          fields: {
            title: "title",
            link: "url",
            // A display range ("Aug 26 - Oct 30, 2026") — parseDateRange()
            // turns it into a real start/end pair.
            dateText: "submission_period_dates",
            location: (item) => item.displayed_location?.location,
            mode: (item) =>
              /online/i.test(item.displayed_location?.location || "") ? "online" : "offline",
            isOnline: (item) => /online/i.test(item.displayed_location?.location || ""),
            organizer: "organization_name",
            // Arrives as "$<span data-currency-value>50,000</span>".
            prizePool: (item) => stripHtml(item.prize_amount),
            tags: (item) => (item.themes || []).map((theme) => theme.name),
            sourceName: () => "Devpost",
            sourceUrl: () => "https://devpost.com/hackathons",
          },
          pagination: {
            pageParam: "page",
            perPageParam: "per_page",
            perPage: 40,
            maxPages: 3,
            maxResults: 120,
          },
        },
        // Add a backup/mirror endpoint here if one ever exists — it'll be
        // tried automatically if the primary one above fails.
      ]
    : [];

export default {
  key: "devpost",
  label: "Devpost",
  listingUrl: "https://devpost.com/hackathons",
  baseUrl: "https://devpost.com",
  expectedMinResults: Number(process.env.CRAWLER_DEVPOST_MIN_RESULTS || 5),

  // Layer 0 — tried before scraping whenever the strategy engine allows it.
  apiConfigs: DEVPOST_API_CONFIGS,

  // Layer 1 — candidate card selectors; whichever matches the most elements
  // on the live page wins. The primary selector is the "known good" guess.
  containers: [
    ".hackathon-tile",
    "[class*='hackathon-tile']",
    "div[class*='challenge-listing']",
    "a[href*='devpost.com/software']",
  ],

  fields: {
    title: [".listing-title", "h3", "h2", "[class*='title']"],

    // The card can be an <a> itself (last container candidate) or wrap one.
    link: [
      { self: true, attr: "href" },
      { sel: "a.tile-anchor", attr: "href" },
      { sel: "a", attr: "href" },
    ],

    dateText: [".submission-period", "[class*='date']"],
    location: [".location", "[class*='location']"],
    prizePool: [".prize-amount", "[class*='prize']"],

    // Derived last, from the already-parsed location.
    mode: (_card, _cheerio, raw) => (/online/i.test(raw.location || "") ? "online" : "offline"),
    isOnline: (_card, _cheerio, raw) => /online/i.test(raw.location || ""),
  },

  defaultLocation: "Online",

  // Layer 2 — href-pattern scan, survives class-name redesigns.
  structural: {
    keywords: ["devpost.com/software", "hackathon"],
    // Structural matches carry no location text, but Devpost listings are
    // online-or-city and the blank default below keeps them online.
    map: (item) => ({ ...item, source: "devpost", mode: "online" }),
  },

  useBrowser: true,
};
