import { makeLogger } from "./logger.js";

const log = makeLogger("browser-pool");

let browserPromise = null;

/**
 * Resource optimization: launching a full Chromium process is expensive
 * (hundreds of MB of RAM, ~1-2s startup) — the previous version launched a
 * brand new browser for every renderWithPuppeteer() call, AND again for
 * every retry attempt within that call. If both Devpost and Unstop needed
 * the Puppeteer fallback in the same run, that was 2+ separate browser
 * processes when 1 shared one (with a page each) does the job.
 *
 * This lazily launches a single browser on first use and reuses it for the
 * rest of the process's lifetime; callers create/close their own *page*
 * per render (cheap) rather than the whole browser.
 */
export async function getSharedBrowser() {
  if (browserPromise) return browserPromise;

  const puppeteerModule = await import("puppeteer").catch(() => null);
  if (!puppeteerModule) {
    log.warn("puppeteer not installed — run `npm i puppeteer` to enable JS-rendering fallback");
    return null;
  }

  browserPromise = puppeteerModule.default
    .launch({ headless: "new", timeout: 30000 })
    .then((browser) => {
      log.info("Shared Puppeteer browser launched");
      // If the browser process dies unexpectedly (crash, OOM), clear the
      // cached promise so the next call launches a fresh one instead of
      // reusing a dead reference forever.
      browser.on("disconnected", () => {
        log.warn("Shared Puppeteer browser disconnected — will relaunch on next use");
        browserPromise = null;
      });
      return browser;
    })
    .catch((err) => {
      log.error("Failed to launch shared Puppeteer browser", { message: err.message });
      browserPromise = null;
      throw err;
    });

  return browserPromise;
}

/**
 * Call once, at the end of a crawl run — releases the Chromium process
 * instead of leaving it resident in memory between cron cycles.
 */
export async function closeSharedBrowser() {
  if (!browserPromise) return;

  try {
    const browser = await browserPromise;
    await browser?.close();
    log.info("Shared Puppeteer browser closed");
  } catch (err) {
    log.error("Error closing shared Puppeteer browser", { message: err.message });
  } finally {
    browserPromise = null;
  }
}
