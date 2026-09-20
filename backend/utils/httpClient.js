import axios from "axios";
import { makeLogger } from "./logger.js";
import { delay } from "./delay.js";
import { throttleHost } from "./rateLimiter.js";

const log = makeLogger("http");

const MAX_RETRIES = Number(process.env.CRAWLER_MAX_RETRIES || 3);
const BASE_DELAY_MS = Number(process.env.CRAWLER_RETRY_DELAY_MS || 1000);
const REQUEST_TIMEOUT_MS = Number(process.env.CRAWLER_TIMEOUT_MS || 15000);

// Re-exported for existing callers (e.g. collegeCrawler.js) that import
// `delay` from here — the actual implementation now lives in delay.js so
// rateLimiter.js can use it too without a circular import.
export { delay };

/**
 * GET a URL with retries + exponential backoff, and rate control against
 * the target host. Treats network errors, timeouts, and 5xx/429 responses
 * as retryable; 4xx (other than 429) fails fast since retrying a bad
 * request won't help.
 */
export async function fetchWithRetry(url, { retries = MAX_RETRIES, ...axiosOpts } = {}) {
  let lastErr;

  for (let attempt = 1; attempt <= retries; attempt++) {
    await throttleHost(url); // rate control: never hit the same host back-to-back

    try {
      const res = await axios.get(url, {
        timeout: REQUEST_TIMEOUT_MS,
        headers: {
          "User-Agent": "HackHubBot/1.0 (+https://hackhub.example.com/bot)",
          ...axiosOpts.headers,
        },
        ...axiosOpts,
      });
      return res.data;
    } catch (err) {
      lastErr = err;
      const status = err.response?.status;
      const retryable = !status || status === 429 || status >= 500;

      if (!retryable || attempt === retries) {
        log.error(`Request failed permanently: ${url}`, { attempt, status, message: err.message });
        throw err;
      }

      const backoff = BASE_DELAY_MS * 2 ** (attempt - 1);
      log.warn(`Request failed, retrying (${attempt}/${retries})`, {
        url,
        status,
        nextRetryInMs: backoff,
      });
      await delay(backoff);
    }
  }

  throw lastErr;
}
