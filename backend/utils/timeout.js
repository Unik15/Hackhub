import { makeLogger } from "./logger.js";

const log = makeLogger("timeout");

/**
 * Races a promise against a hard wall-clock limit. This is a *last line of
 * defense*, distinct from axios's `timeout` option: axios's timeout only
 * bounds the HTTP request itself, but nothing previously bounded, say, an
 * entire crawler function (fetch → cheerio parse → structural fallback →
 * Puppeteer render → AI fallback) if some step in that chain hung for a
 * reason that has nothing to do with the network (e.g. a runaway loop, a
 * Puppeteer process that launched but never responds to close()).
 *
 * Note this does NOT cancel/abort the underlying work — the original
 * promise keeps running in the background even after this "gives up" and
 * rejects. For network calls that matters little (the socket eventually
 * times out on its own); for anything you spawn a process for (Puppeteer),
 * pair this with actually killing that process on timeout where possible.
 */
export function withTimeout(promise, ms, label = "operation") {
  let timer;

  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => {
      log.error(`${label} exceeded hard timeout of ${ms}ms`);
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timer));
}
