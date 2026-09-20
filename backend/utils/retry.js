import { delay } from "./delay.js";
import { makeLogger } from "./logger.js";

const log = makeLogger("retry");

/**
 * Wraps any async operation with retry + exponential backoff. This is what
 * was missing before: fetchWithRetry only covered the initial HTML fetch —
 * DB upserts, Puppeteer renders, Ollama calls, and alert sends could all
 * still fail once and just... stay failed. This gives every one of those a
 * shared, consistent retry policy instead of each reinventing its own.
 */
export async function retryAsync(fn, { retries = 2, baseDelayMs = 500, label = "operation" } = {}) {
  let lastErr;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === retries) break;

      const backoff = baseDelayMs * 2 ** (attempt - 1);
      log.warn(`${label} failed, retrying (${attempt}/${retries})`, {
        message: err.message,
        nextRetryInMs: backoff,
      });
      await delay(backoff);
    }
  }

  log.error(`${label} failed after ${retries} attempt(s)`, { message: lastErr.message });
  throw lastErr;
}
