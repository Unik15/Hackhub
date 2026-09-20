import axios from "axios";
import { makeLogger } from "./logger.js";
import { collectAlert, flushAlerts } from "../services/alertBatcher.js";

const log = makeLogger("api-detector");

/**
 * Layer 6 (APIs > scraping): a lightweight, periodic check for whether a
 * source has exposed something that looks like a usable public API,
 * so scraping can eventually be replaced by a stable, documented endpoint
 * instead of an HTML selector.
 *
 * HONEST CAVEAT: these candidate URLs are guesses based on common API
 * path conventions (`/api/...`), not confirmed, documented endpoints —
 * neither Devpost nor Unstop is known to publish a public hackathon-listing
 * API as of this writing. Verify manually (check each site's developer
 * docs / robots.txt / terms of service) before wiring a real integration
 * around anything this detector finds; treat a "hit" here as "worth
 * investigating," not "safe to use immediately."
 */
const CANDIDATE_ENDPOINTS = {
  devpost: ["https://devpost.com/api/hackathons"],
  unstop: ["https://unstop.com/api/public/opportunity/search"],
};

function looksLikeUsableApiResponse(data) {
  if (Array.isArray(data)) return data.length > 0;
  if (data && typeof data === "object") {
    return Object.values(data).some((v) => Array.isArray(v) && v.length > 0);
  }
  return false;
}

async function probeEndpoint(url) {
  try {
    const { data, headers } = await axios.get(url, {
      timeout: 8000,
      headers: { "User-Agent": "HackHubBot/1.0", Accept: "application/json" },
      validateStatus: (s) => s < 500, // treat 4xx as "not found", not a throw
    });

    const isJson = (headers["content-type"] || "").includes("application/json");
    const usable = isJson && looksLikeUsableApiResponse(data);

    return { url, reachable: true, isJson, looksUsable: usable };
  } catch (err) {
    return { url, reachable: false, error: err.message };
  }
}

/**
 * Probes all candidate endpoints for every source. Meant to run
 * infrequently (weekly, via a slow cron — see scheduler/cron.js) rather
 * than on every crawl, since it's purely informational: it doesn't change
 * crawler behavior automatically, it just surfaces a signal for a human to
 * act on.
 */
export async function checkApiAvailability() {
  const report = {};

  for (const [source, endpoints] of Object.entries(CANDIDATE_ENDPOINTS)) {
    const results = await Promise.all(endpoints.map(probeEndpoint));
    report[source] = results;

    const promising = results.find((r) => r.looksUsable);
    if (promising) {
      log.warn(`Possible official API detected for ${source}`, promising);
      collectAlert(
        `🟢 A candidate API endpoint for *${source}* returned usable-looking JSON: ${promising.url}\nWorth investigating as a scraping replacement (verify docs/ToS first).`,
        {
          dedupeKey: `api-detected-${source}`,
          cooldownMs: Number(process.env.API_ALERT_COOLDOWN_MS || 7 * 24 * 60 * 60 * 1000), // 7 days
        }
      );
    } else {
      log.info(`No usable API detected for ${source} this check`, { checked: endpoints });
    }
  }

  await flushAlerts({ title: "HackHub API-availability check" });

  return report;
}

// Allow running standalone: `node utils/apiDetector.js`
if (process.argv[1] === new URL(import.meta.url).pathname) {
  checkApiAvailability().then((report) => {
    console.log(JSON.stringify(report, null, 2));
  });
}
