import { makeLogger } from "./logger.js";

const log = makeLogger("strategy-engine");

/**
 * This is what was actually missing before: fetchFromApi() + the layered
 * scraping chain existed, but nothing DECIDED anything — every run blindly
 * tried API → selectors → structural → Puppeteer → AI in the same fixed
 * order, every time, regardless of what happened last time. That's
 * fallback SWITCHING (reactive, "this failed, try the next thing") but not
 * a runtime DECISION (proactive, "I know API has failed 5 times in a row,
 * don't even bother this run").
 *
 * State is in-memory, per source: { strategy, consecutiveFailures, history }.
 * Resets on process restart — acceptable here since a fresh process just
 * means "give every strategy a clean slate," not "lose critical data."
 */
const state = new Map();

const API_FAILURE_THRESHOLD = Number(process.env.STRATEGY_API_FAILURE_THRESHOLD || 3);
const HISTORY_LENGTH = 10;

function getOrInit(source) {
  if (!state.has(source)) {
    state.set(source, {
      lastSuccessfulStrategy: null,
      consecutiveFailures: {}, // strategy -> count
      history: [], // last N { strategy, success, resultCount, at }
    });
  }
  return state.get(source);
}

/**
 * THE RUNTIME DECISION. Called once at the top of each crawler, before
 * anything else runs. Actively decides whether attempting the API layer
 * this run is worth the round-trip, based on real history — not just "is
 * it configured."
 */
export function decideStrategy(source, { apiConfigured } = {}) {
  const entry = getOrInit(source);
  const apiFailures = entry.consecutiveFailures.api || 0;

  const useApi = Boolean(apiConfigured) && apiFailures < API_FAILURE_THRESHOLD;

  const decision = {
    useApi,
    reason: !apiConfigured
      ? "no API configured for this source"
      : !useApi
      ? `API has failed ${apiFailures} times in a row (threshold ${API_FAILURE_THRESHOLD}) — skipping this run`
      : "API configured and healthy (or not yet tried)",
    lastSuccessfulStrategy: entry.lastSuccessfulStrategy,
  };

  log.info(`Runtime decision for "${source}"`, decision);
  return decision;
}

/**
 * Called after every strategy attempt (API or any scraping layer) so the
 * next decision has real data to work with. This is what makes it a
 * decision system rather than a fixed script — the engine's behavior
 * actually changes based on what happened.
 */
export function recordOutcome(source, strategy, success, resultCount = 0) {
  const entry = getOrInit(source);

  if (success) {
    entry.lastSuccessfulStrategy = strategy;
    entry.consecutiveFailures[strategy] = 0;
  } else {
    entry.consecutiveFailures[strategy] = (entry.consecutiveFailures[strategy] || 0) + 1;
  }

  entry.history = [...entry.history.slice(-(HISTORY_LENGTH - 1)), { strategy, success, resultCount, at: Date.now() }];

  log.info(`Recorded outcome for "${source}"`, { strategy, success, resultCount });
}

/** Per-source state, for debugging/ops visibility (see routes/ops.js). */
export function getState(source) {
  return state.get(source) || null;
}

/** Every source's state at once — what the /api/ops/crawler-strategy route returns. */
export function getAllState() {
  return Object.fromEntries(state);
}
