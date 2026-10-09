import "dotenv/config";
import { connectDB } from "../config/supabase.js";
import { upsertHackathon, expireOld, buildDedupeHash } from "../repositories/hackathonRepo.js";
import { crawlDevpost } from "./devpostCrawler.js";
import { crawlUnstop } from "./unstopCrawler.js";
import { crawlCollegeSites } from "./collegeCrawler.js";
import { geocodeCity } from "../services/geoService.js";
import { collectAlert, flushAlerts } from "../services/alertBatcher.js";
import { retryAsync } from "../utils/retry.js";
import { withTimeout } from "../utils/timeout.js";
import { closeSharedBrowser } from "../utils/browserPool.js";
import { makeLogger } from "../utils/logger.js";
import { crawlReskilll } from "./reskilll/reskilllCrawler.js";
import { fileURLToPath } from "node:url";
import path from "node:path";

const log = makeLogger("crawler:orchestrator");

/**
 * Normalize crawler-specific shapes into the hackathon row shape.
 * Loose date parsing is used since every source formats dates differently;
 * anything unparseable is left null rather than guessed.
 */
function normalize(raw) {
  const parsedDeadline = raw.deadlineText ? new Date(raw.deadlineText) : null;
  const validDeadline = parsedDeadline && !isNaN(parsedDeadline) ? parsedDeadline.toISOString() : null;

 return {
  title: raw.title,
  url: raw.url || raw.link,   // 🔥 important
  link: raw.link || raw.url,  // backward compatibility
  source: raw.source,
  platform: raw.platform || raw.source || "unknown",  // 🔥 FIX HERE

  mode: raw.mode || "online",
  organizer: raw.organizer || "",
  prizePool: raw.prizePool || "",
  registrationDeadline: validDeadline,
  location: raw.locationCity || raw.location || "",
  locationCity: raw.locationCity || raw.location || "",
  isOnline: raw.isOnline ?? raw.mode === "online",
  latitude: raw.latitude ?? null,
  longitude: raw.longitude ?? null,

  domain: [],
  tags: [],
};
}

/**
 * Cross-source, in-run deduplication. The same page can occasionally list a
 * hackathon twice (pagination overlap, a "featured" card repeating further
 * down), and different pages of the same source can too. Filtering these
 * out here means fewer geocoding calls and fewer DB upserts per run — the
 * dedupe_hash unique constraint in Postgres remains the source of truth for
 * cross-run dedup, this is just an optimization within a single crawl.
 */
function dedupeWithinRun(items) {
  const seen = new Set();
  const unique = [];

  for (const item of items) {
    const hash = buildDedupeHash({ title: item.title, source: item.source, link: item.link });
    if (seen.has(hash)) continue;
    seen.add(hash);
    unique.push(item);
  }

  return unique;
}

export async function runCrawlers() {
  log.info("Starting crawl run");
  const startedAt = Date.now();
  const SOURCE_TIMEOUT_MS = Number(process.env.CRAWLER_SOURCE_TIMEOUT_MS || 90000);

  try {
    const sourceNames = ["devpost", "unstop", "college", "reskilll"];
    const [devpost, unstop, college,reskilll] = await Promise.allSettled([
      withTimeout(crawlDevpost(), SOURCE_TIMEOUT_MS, "devpost crawler"),
      withTimeout(crawlUnstop(), SOURCE_TIMEOUT_MS, "unstop crawler"),
      withTimeout(crawlCollegeSites(), SOURCE_TIMEOUT_MS, "college crawler"),
       withTimeout(crawlReskilll(), SOURCE_TIMEOUT_MS, "reskilll crawler"),
    ]).then((results) =>
      results.map((r, i) => {
        const sourceName = sourceNames[i];
        if (r.status === "rejected") {
          // A crawler throwing entirely — including timing out — still
          // shouldn't take down the other two sources.
          log.error(`${sourceName} crawler failed or timed out`, { message: r.reason?.message });
          collectAlert(`🔴 *${sourceName}* crawler failed or exceeded ${SOURCE_TIMEOUT_MS}ms: ${r.reason?.message}`, {
            dedupeKey: `crash-${sourceName}`,
            cooldownMs: Number(process.env.ALERT_COOLDOWN_MS || 60 * 60 * 1000),
          });
          return [];
        }
        return r.value;
      })
    );

    const rawCombined = [...devpost, ...unstop, ...college, ...reskilll];
    const normalized = rawCombined
    .map(normalize)
    .filter(Boolean);
    const deduped = dedupeWithinRun(normalized);

    log.info(
      `Combined ${rawCombined.length} raw listings → ${deduped.length} unique after in-run dedup`
    );

    let upserts = 0;
    let failures = 0;

    for (const item of deduped) {
      try {
        // Optionally geocode a plain-text location to coordinates for offline events
        if (item.locationCity) {
          const geo = await geocodeCity(item.locationCity);
          if (geo) {
            item.latitude = geo.lat;
            item.longitude = geo.lng;
          }
        }
        await retryAsync(() => upsertHackathon(item), {
          retries: 2,
          baseDelayMs: 500,
          label: `DB upsert for "${item.title}"`,
        });
        upserts++;
      } catch (err) {
        // Malformed entries or transient DB errors shouldn't kill the whole run
        failures++;
        log.error(`Upsert failed for "${item.title}"`, { message: err.message });
      }
    }

    const durationMs = Date.now() - startedAt;
    log.info(`Run complete in ${durationMs}ms`, { upserts, failures, total: deduped.length });

    if (deduped.length > 0 && failures / deduped.length > 0.3) {
      collectAlert(
        `🔴 Crawl run had a high failure rate: ${failures}/${deduped.length} upserts failed (after retries). Possible DB/schema issue.`,
        { dedupeKey: "high-failure-rate", cooldownMs: Number(process.env.ALERT_COOLDOWN_MS || 60 * 60 * 1000) }
      );
    }

    // One consolidated message for everything queued this run, instead of a
    // separate ping per source/issue.
    await flushAlerts({ title: `HackHub crawl summary (${new Date().toISOString()})` });

    return { total: deduped.length, upserted: upserts, failed: failures, durationMs };
  } finally {
    // Resource optimization: don't leave a Chromium process resident in
    // memory between cron cycles — release it once this run (and every
    // retry within it) is fully done.
    await closeSharedBrowser();
  }
}

/**
 * Deactivate hackathons whose end date (or deadline, if no end date) has passed.
 * Run on a slower cadence than the crawler itself (e.g. daily).
 */
export async function expireOldHackathons() {
  const count = await expireOld();
  log.info(`Expired ${count} hackathons`);
  return count;
}

// Allow running standalone: `npm run crawl`
// ==========================
// 🚀 FORCE RUN (FIXED)
// ==========================


const currentFile = path.resolve(fileURLToPath(import.meta.url));

const executedFile = process.argv[1]
  ? path.resolve(process.argv[1])
  : null;

const isMainModule =
  executedFile !== null &&
  currentFile === executedFile;

if (isMainModule) {
  try {
    await connectDB();

    log.info("Standalone crawler execution started");

    const result = await runCrawlers();

    log.info(
      "Standalone crawler execution finished",
      result
    );

    process.exitCode = 0;
  } catch (err) {
    log.error(
      "Fatal error during standalone crawl run",
      {
        message: err?.message || String(err),
        stack: err?.stack,
      }
    );

    process.exitCode = 1;
  }
}
