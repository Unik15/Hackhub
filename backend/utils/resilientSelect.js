/**
 * Layer 1+2+3 of the multi-layer defense: flexible selectors, fallback
 * chains, and structure-based (pattern) parsing — all cheap, all run on
 * every crawl, no external calls involved.
 */

/** Returns the first non-empty, trimmed string from a list of candidates. */
export function firstNonEmpty(...candidates) {
  for (const c of candidates) {
    if (c && typeof c === "string" && c.trim()) return c.trim();
  }
  return "";
}

/**
 * Given several candidate container selectors for "one listing card", picks
 * whichever matches the most elements on the page. Heuristic, not perfect —
 * a decoy selector that matches many unrelated elements could win — but for
 * listing pages (where the real card selector legitimately repeats many
 * times) this is a reasonable signal that a class name changed vs. that the
 * whole page structure changed.
 */
export function pickBestContainerSelector($, candidates) {
  let best = { selector: null, count: 0 };
  for (const selector of candidates) {
    const count = $(selector).length;
    if (count > best.count) best = { selector, count };
  }
  return best;
}

/**
 * Last-resort structural pass that ignores class names entirely: scans every
 * <a> tag, keeps the ones whose href matches a known URL pattern for this
 * kind of listing (e.g. contains "hackathon"), and pulls a title from the
 * nearest heading or the link's own text.
 *
 * This is intentionally generic/dumb — it will catch nav links, "learn more"
 * buttons, and other noise. Treat its output as lower-confidence than the
 * primary selector path; the validation layer still filters obviously bad
 * entries, but a human should spot-check this path's output occasionally.
 */
export function extractByHrefPattern($, { keywords = ["hackathon"], baseUrl } = {}) {
  const items = [];
  const seenLinks = new Set();

  $("a").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;

    const lower = href.toLowerCase();
    if (!keywords.some((k) => lower.includes(k))) return;

    const absoluteLink = href.startsWith("http")
      ? href
      : baseUrl
      ? new URL(href, baseUrl).toString()
      : href;

    if (seenLinks.has(absoluteLink)) return;
    seenLinks.add(absoluteLink);

    const $el = $(el);
    const $card = $el.closest("div, li, article");
    const heading = $card.find("h1, h2, h3, h4").first().text().trim();
    const title = firstNonEmpty(heading, $el.text());

    if (!title || title.length < 3) return; // too short to be a real title, likely nav/icon link

    items.push({ title, link: absoluteLink });
  });

  return items;
}
