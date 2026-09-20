import { delay } from "./delay.js";
import { makeLogger } from "./logger.js";

const log = makeLogger("rate-limiter");

// Minimum gap between two requests to the SAME host. This is the piece that
// was actually missing: a crawler could hit devpost.com once via axios, then
// immediately hit it again via Puppeteer (structure-based fallback → JS
// re-render) with zero gap between them. Different hosts aren't throttled
// against each other — Devpost, Unstop, and each college domain all get
// their own independent clock.
const MIN_HOST_INTERVAL_MS = Number(process.env.CRAWLER_MIN_HOST_INTERVAL_MS || 2000);

const lastRequestAtByHost = new Map();

/**
 * Blocks until at least MIN_HOST_INTERVAL_MS has passed since the last
 * request to this URL's host. Call this immediately before every outbound
 * request (axios GET, Puppeteer page.goto) in the crawler layer.
 */
export async function throttleHost(url) {
  let host;
  try {
    host = new URL(url).host;
  } catch {
    return; // malformed URL — let the actual request fail with a clearer error
  }

  const last = lastRequestAtByHost.get(host) || 0;
  const wait = MIN_HOST_INTERVAL_MS - (Date.now() - last);

  if (wait > 0) {
    log.info(`Throttling request to ${host}`, { waitMs: wait });
    await delay(wait);
  }

  lastRequestAtByHost.set(host, Date.now());
}
