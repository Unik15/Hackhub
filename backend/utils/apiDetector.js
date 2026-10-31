import { fileURLToPath } from "node:url";
import path from "node:path";
import { makeLogger } from "./logger.js";
import { collectAlert, flushAlerts } from "../services/alertBatcher.js";
import { fetchFromApi } from "./apiCrawler.js";
import { DEVPOST_API_CONFIGS } from "../crawlers/sources/devpost.js";
import { UNSTOP_API_CONFIGS } from "../crawlers/unstopCrawler.js";

const log = makeLogger("api-detector");

/**
 * Weekly health check for the API sources the crawlers actually depend on.
 *
 * This used to guess at candidate `/api/...` URLs and alert when one "looked
 * usable" — a signal nothing ever acted on, and one that could never fire for
 * Unstop: its array is nested at `data.data`, and its endpoint returns zero
 * items without an `opportunity` param, so the old heuristic saw an empty
 * response.
 *
 * Now that both integrations are live as Layer 0 ahead of HTML scraping, the
 * useful question is the opposite one: is the endpoint we depend on still
 * returning usable listings? Each probe reuses the crawler's real config —
 * URL, params, field mapping, filter — so it fails for exactly the same
 * reasons the crawler would, and one page is enough to answer it.
 */
const MIN_PROBE_ITEMS = Number(process.env.API_PROBE_MIN_ITEMS || 5);

const PROBES = [
  { source: "devpost", label: "Devpost", configs: DEVPOST_API_CONFIGS },
  { source: "unstop", label: "Unstop", configs: UNSTOP_API_CONFIGS },
];

async function probeSource({ source, label, configs }) {
  if (!configs.length) {
    // The flag is off, so there is nothing here to be unhealthy about.
    return { source, label, enabled: false, usable: false, count: 0 };
  }

  const config = configs[0];
  const singlePage = {
    ...config,
    pagination: config.pagination ? { ...config.pagination, maxPages: 1 } : undefined,
  };

  try {
    const items = await fetchFromApi(singlePage, { source });
    const count = items?.length ?? 0;

    return { source, label, enabled: true, usable: count >= MIN_PROBE_ITEMS, count, url: config.url };
  } catch (err) {
    // fetchFromApi returns null instead of throwing, but the weekly probe
    // should never be the thing that breaks the cron.
    return { source, label, enabled: true, usable: false, count: 0, url: config.url, error: err.message };
  }
}

/**
 * Probes every API source once. Meant to run infrequently (weekly, via a slow
 * cron — see scheduler/cron.js) rather than on every crawl.
 *
 * Only a failure alerts: the crawler already falls back to HTML scraping, so a
 * broken API is not an outage, but it is a silent downgrade in data quality
 * (no real timestamps, no themes, a Puppeteer render per source) that someone
 * should look at.
 */
export async function checkApiAvailability() {
  const report = {};

  for (const probe of PROBES) {
    const result = await probeSource(probe);
    report[result.source] = result;

    if (!result.enabled) {
      log.info(`API health check skipped for ${result.label} — integration is disabled`);
      continue;
    }

    if (result.usable) {
      log.info(`API healthy for ${result.label}`, { count: result.count });
      continue;
    }

    log.warn(`API unhealthy for ${result.label}`, result);
    collectAlert(
      `🟠 The *${result.label}* API returned ${result.count} usable listing(s) (expected at least ${MIN_PROBE_ITEMS}).\n${result.url}\nThe crawler will fall back to HTML scraping, which is slower and returns less data.`,
      {
        dedupeKey: `api-unhealthy-${result.source}`,
        cooldownMs: Number(process.env.API_ALERT_COOLDOWN_MS || 7 * 24 * 60 * 60 * 1000), // 7 days
      }
    );
  }

  await flushAlerts({ title: "HackHub API health check" });

  return report;
}

// Allow running standalone: `node utils/apiDetector.js`
const currentFile = path.resolve(fileURLToPath(import.meta.url));
const executedFile = process.argv[1] ? path.resolve(process.argv[1]) : null;

if (executedFile && currentFile === executedFile) {
  checkApiAvailability()
    .then((report) => {
      console.log(JSON.stringify(report, null, 2));
    })
    .catch((err) => {
      console.error("API health check failed:", err.message);
      process.exitCode = 1;
    });
}
