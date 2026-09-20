import cron from "node-cron";
import { listUsersForDigest } from "../repositories/userRepo.js";
import { findActive } from "../repositories/hackathonRepo.js";
import { runCrawlers, expireOldHackathons } from "../crawlers/index.js";
import { rankHackathonsForUser } from "../services/aiService.js";
import { filterByProximity } from "../services/geoService.js";
import { sendDailyDigest } from "../services/notificationService.js";
import { checkApiAvailability } from "../utils/apiDetector.js";

export function startScheduler() {
  const crawlExpr = process.env.CRAWL_CRON || "0 */6 * * *"; // every 6 hours
  const expireExpr = process.env.EXPIRE_CLEANUP_CRON || "0 3 * * *"; // 3am daily
  const digestExpr = "0 8 * * *"; // 8am daily
  const apiCheckExpr = process.env.API_DETECTION_CRON || "0 6 * * 1"; // 6am every Monday

  cron.schedule(crawlExpr, async () => {
    console.log("[scheduler] Running crawlers...");
    await runCrawlers().catch((e) => console.error("[scheduler] crawl error:", e));
  });

  cron.schedule(expireExpr, async () => {
    console.log("[scheduler] Expiring stale hackathons...");
    await expireOldHackathons().catch((e) => console.error("[scheduler] expire error:", e));
  });

  cron.schedule(digestExpr, async () => {
    console.log("[scheduler] Sending daily digests...");
    await sendDigestsToAllUsers().catch((e) => console.error("[scheduler] digest error:", e));
  });

  cron.schedule(apiCheckExpr, async () => {
    console.log("[scheduler] Checking for official API availability...");
    await checkApiAvailability().catch((e) => console.error("[scheduler] api-check error:", e));
  });

  console.log(
    `[scheduler] Started. crawl="${crawlExpr}" expire="${expireExpr}" digest="${digestExpr}" apiCheck="${apiCheckExpr}"`
  );
}

async function sendDigestsToAllUsers() {
  const activeHackathons = await findActive(300);
  const BATCH_SIZE = 200;

  let sent = 0;
  let processed = 0;
  let offset = 0;

  // Page through users instead of loading every digest-enabled user into
  // memory at once — at 200/batch this is one query per ~200 users rather
  // than a single unbounded query that grows without limit as the user
  // base grows.
  while (true) {
    const users = await listUsersForDigest(BATCH_SIZE, offset);
    if (users.length === 0) break;

    for (const user of users) {
      try {
        const [lng, lat] = user.profile?.location?.coordinates || [0, 0];
        const userCoords = lng !== 0 || lat !== 0 ? { lat, lng } : null;

        const nearby = filterByProximity(
          activeHackathons,
          userCoords,
          Number(process.env.MAX_DISTANCE_KM || 500)
        );

        const ranked = await rankHackathonsForUser(user, nearby);
        const withLinks = ranked.map((r) => ({
          ...r,
          link: nearby.find((h) => h.id === r.id)?.link,
        }));

        await sendDailyDigest(user, withLinks);
        sent++;
      } catch (err) {
        console.error(`[scheduler] Digest failed for user ${user.id}:`, err.message);
      }
      processed++;
    }

    offset += BATCH_SIZE;
    if (users.length < BATCH_SIZE) break; // last page was partial — no more users to fetch
  }

  console.log(`[scheduler] Digests processed for ${sent}/${processed} users`);
}
