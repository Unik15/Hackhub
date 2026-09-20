import { makeLogger } from "./logger.js";
import { collectAlert } from "../services/alertBatcher.js";

const log = makeLogger("anomaly");

/**
 * Pure predicate, no side effects — used to DECIDE whether to attempt the
 * next fallback layer (structural scan, Puppeteer, AI). Deliberately
 * doesn't alert, because at this point we don't yet know whether a later
 * fallback layer will recover the data; alerting here would fire even when
 * the system is about to self-heal.
 */
export function isCountAnomalous(count, expectedMin = 5) {
  return count < expectedMin;
}

/**
 * Call this ONCE, after every fallback layer has already been tried, with
 * whatever the final result count ended up being. Only alerts if the count
 * is STILL below threshold at that point — this is what avoids the
 * "false alarm fires, then the structural/Puppeteer fallback quietly fixes
 * it a few lines later" ordering bug.
 *
 * The alert is queued via collectAlert(), not sent immediately: a
 * dedupeKey cooldown means the same recurring break doesn't re-alert every
 * single crawl run, and queued alerts across all sources go out as one
 * batched message when the orchestrator flushes at the end of the run.
 */
export function reportAnomalyIfStillLow(source, finalCount, expectedMin = 5) {
  if (finalCount >= expectedMin) return false;

  log.warn(`Structure change likely for "${source}" — no fallback layer recovered enough results`, {
    finalCount,
    expectedAtLeast: expectedMin,
  });

  collectAlert(
    `⚠️ *${source}* crawler still returned only *${finalCount}* result(s) after all fallback layers (expected ≥ ${expectedMin}). Selector/structure change likely — check CONTAINER_CANDIDATES.`,
    { dedupeKey: `anomaly-${source}`, cooldownMs: Number(process.env.ALERT_COOLDOWN_MS || 60 * 60 * 1000) }
  );

  return true;
}

/**
 * @deprecated kept only so older imports don't hard-crash; use
 * isCountAnomalous() to gate fallback attempts and reportAnomalyIfStillLow()
 * to alert once, after fallbacks are exhausted.
 */
export function checkResultCountAnomaly(source, count, expectedMin = 5) {
  return isCountAnomalous(count, expectedMin);
}
