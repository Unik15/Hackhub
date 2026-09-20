import { makeLogger } from "./logger.js";
import { throttleHost } from "./rateLimiter.js";
import { retryAsync } from "./retry.js";
import { withTimeout } from "./timeout.js";
import { getSharedBrowser } from "./browserPool.js";

const log = makeLogger("puppeteer");
const HARD_TIMEOUT_MS = Number(process.env.PUPPETEER_HARD_TIMEOUT_MS || 45000);

/**
 * Renders a URL with a real (headless) browser and returns the resulting
 * HTML. This is the right tool specifically when a site needs JavaScript to
 * execute before its listing data exists in the DOM — no amount of
 * selector-fallback logic fixes that, since Cheerio never runs any JS in
 * the first place.
 *
 * Resource optimization: reuses one shared browser (browserPool.js) across
 * calls AND across retries — only a lightweight page is opened/closed per
 * attempt, not a whole new Chromium process.
 *
 * Timeout handling: page.goto has its own navigation timeout, but the whole
 * operation is additionally wrapped in a hard wall-clock timeout
 * (withTimeout) so a page that hangs somewhere other than navigation
 * (e.g. content() never resolving) can't stall the crawl run indefinitely.
 *
 * Retry: page-level failures (nav timeout, detached frame) get one more
 * attempt with a fresh page — the shared browser itself isn't relaunched.
 */
export async function renderWithPuppeteer(url, { waitUntil = "networkidle2", timeout = 30000 } = {}) {
  const browser = await getSharedBrowser();
  if (!browser) return null; // puppeteer not installed, or failed to launch — caller falls through to next layer

  try {
    return await withTimeout(
      retryAsync(
        async () => {
          await throttleHost(url);

          let page;
          try {
            page = await browser.newPage();
            await page.setUserAgent("HackHubBot/1.0 (+https://hackhub.example.com/bot)");
            await page.goto(url, { waitUntil, timeout });
            const html = await page.content();
            log.info(`Rendered ${url} via Puppeteer`, { htmlLength: html.length });
            return html;
          } finally {
            if (page) await page.close().catch(() => {}); // never let a stuck page.close() throw past this
          }
        },
        { retries: 2, baseDelayMs: 2000, label: `Puppeteer render of ${url}` }
      ),
      HARD_TIMEOUT_MS,
      `Puppeteer render of ${url}`
    );
  } catch (err) {
    log.error(`Puppeteer render failed for ${url}`, { message: err.message });
    return null;
  }
}
