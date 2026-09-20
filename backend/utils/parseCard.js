// backend/utils/parseCard.js
import { parseDateStringToISO } from "./parseDate.js";
import { URL } from "url";

/**
 * parseCard($, el, baseUrl, opts)
 * - $: cheerio
 * - el: card element
 * - baseUrl: base url for resolving relative hrefs
 * - opts:
 *    - sourceDayFirst: boolean
 *    - minConfidence: numeric (not enforced here; addResult handles it)
 */
export function parseCard($, el, baseUrl, opts = {}) {
  const { sourceDayFirst = false } = opts;

  // module-level seen is intentionally not used here; dedup should be handled centrally
  try {
    const $el = $(el);
    // declare variables early to avoid TDZ issues
    let cardText = "";
    let now = new Date().toISOString();
    let rawHtmlSnippet = "";
    let title = null;
    let url = null;
    let location = null;
    let startText = "";
    let endText = "";
    let startDate = null;
    let endDate = null;
    let isOnline = false;

    // cached content
    cardText = ($el.text() || "").replace(/\s+/g, " ").trim();
    rawHtmlSnippet = $el.html ? ($el.html() || "") : "";

    // helper: safe selector text
    const text = (selector) => {
      if (!selector) {
        return ($el.text() || "").replace(/\s+/g, " ").trim();
      }
      const node = $el.find(selector);
      return node && node.length ? node.first().text().replace(/\s+/g, " ").trim() : "";
    };

    const resolveUrl = (href) => {
      if (!href) return null;
      try {
        return new URL(href, baseUrl).toString();
      } catch {
        return href;
      }
    };

    const sanitizeDateString = (s) => {
      if (!s) return "";
      return String(s)
        .replace(/(\d)(st|nd|rd|th)\b/gi, "$1")
        .replace(/\s+to\s+/i, " - ")
        .replace(/\b(UTC|GMT)\b/gi, "")
        .trim();
    };

    const isValidDateText = (s) =>
      !!s && /(\d{1,4}|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(s);

    // find label value function (safe)
    const findLabelValue = (labelRegex) => {
      const rx = labelRegex instanceof RegExp ? new RegExp(labelRegex.source, "i") : new RegExp(String(labelRegex), "i");
      // limit tags to search for speed
      const candidates = $el.find("div, span, p, li, td, th, strong").filter((i, node) => {
        const t = $(node).text();
        return t && rx.test(t);
      });

      for (let i = 0; i < candidates.length; i++) {
        const node = $(candidates[i]);
        // sibling
        const sib = node.next();
        if (sib && sib.length) {
          const v = sib.text().replace(/\s+/g, " ").trim();
          if (v) return v;
        }
        // node itself minus label
        const nodeText = node.text().replace(/\s+/g, " ").trim();
        if (nodeText) {
          const cleaned = nodeText.replace(rx, "").trim();
          if (cleaned && cleaned.length < 300) return cleaned;
        }
        // parent fallback
        const parent = node.parent();
        if (parent && parent.length) {
          const full = parent.text().replace(/\s+/g, " ").trim();
          const cleanedParent = full.replace(rx, "").trim();
          if (cleanedParent) return cleanedParent.split(/\s{2,}/)[0].trim();
        }
      }

      // final fallback: regex on cardText
      const fallback = new RegExp((labelRegex instanceof RegExp ? labelRegex.source : labelRegex) + "[:\\s]*([0-9A-Za-z ,\\/\\-:\\.]+)", "i");
      const m = cardText.match(fallback);
      return m ? m[1].trim() : "";
    };

    // ===== URL resolution (robust) =====
    // If current element is anchor with href, use it
    const anchorEl = $el.is("a[href]") ? $el : $el.find("a[href]").first();
    if (anchorEl && anchorEl.length) {
      url = resolveUrl(anchorEl.attr("href"));
    }

    // try other attributes if missing
    if (!url) {
      const dataHref = $el.attr("data-href") || $el.attr("data-url") || $el.attr("href");
      if (dataHref) url = resolveUrl(dataHref);
    }

    // try closest anchor in case the selector selected a nested element
    if (!url) {
      const closestAnchor = $el.closest("a[href]");
      if (closestAnchor && closestAnchor.length) url = resolveUrl(closestAnchor.attr("href"));
    }

    // special fallback: onclick with location.href / window.location
    if (!url) {
      const onclick = $el.attr("onclick") || $el.find("[onclick]").first().attr("onclick");
      if (onclick) {
        const m = String(onclick).match(/(https?:\/\/[^\s'"]+)/);
        if (m) url = m[1];
      }
    }

    // ===== TITLE =====
    title =
      text("h6") ||
      text("h5") ||
      text("h4") ||
      text("[class*='title']") ||
      text("[class*='card-title']") ||
      (anchorEl && anchorEl.length ? (anchorEl.text() || "").replace(/\s+/g, " ").trim() : null) ||
      (cardText ? cardText.slice(0, 140) : null);

    title = title ? title.trim() : null;

    // quick guards
    if (!url) {
      // no URL -> low confidence; we log and skip
      return null;
    }
    if (!title || title.length < 3) {
      return null;
    }

    // ===== LOCATION =====
    location =
      text(".location") ||
      text("[class*='location']") ||
      (cardText.match(/(?:Location|Venue)[:\-\s]*([^\n,]+)/i)?.[1] || "");
    location = location ? location.trim() : null;

    // ===== DATES =====
    startText =
      findLabelValue(/Registration Start|Starts?|Start Date/i) ||
      (cardText.match(/(?:Starts?|Start)[:\s]*([0-9A-Za-z ,\/\-\:]+)/i)?.[1] || "");

    endText =
      findLabelValue(/Registration End|Ends?|End Date|Deadline/i) ||
      (cardText.match(/(?:Ends?|End|Deadline)[:\s]*([0-9A-Za-z ,\/\-\:]+)/i)?.[1] || "");

    startText = sanitizeDateString(startText);
    endText = sanitizeDateString(endText);

    if (isValidDateText(startText)) {
      try {
        startDate = parseDateStringToISO(startText, { dayFirst: !!sourceDayFirst });
      } catch {
        startDate = null;
      }
    }

    if (isValidDateText(endText)) {
      try {
        endDate = parseDateStringToISO(endText, { dayFirst: !!sourceDayFirst });
      } catch {
        endDate = null;
      }
    }

    // small sanity on years
    const validYear = (d) => {
      if (!d) return false;
      const y = new Date(d).getUTCFullYear();
      return y >= 2000 && y <= 2100;
    };
    if (!validYear(startDate)) startDate = null;
    if (!validYear(endDate)) endDate = null;
    if (startDate && endDate && new Date(startDate) > new Date(endDate)) endDate = null;

    // ===== ONLINE =====
    isOnline = (location && /online|remote|virtual|webinar/i.test(location)) || (!location && /online|virtual|remote/i.test(cardText));

    // ===== CONFIDENCE meta for debugging (parser raw) =====
    const meta = {
      parseStrategy: "robust-anchor+label+regex",
      rawSnippet: rawHtmlSnippet ? rawHtmlSnippet.slice(0, 400) : null,
      rawCardText: cardText,
      rawLocation: location,
      rawStartText: startText || null,
      rawEndText: endText || null,
    };

    // assemble raw parsed item (normalizer will validate/confidence)
    return {
      title,
      url,
      platform: "reskilll",
      isOnline: !!isOnline,
      locationCity: location,
      startDate: startDate || null,
      endDate: endDate || null,
      organizer: text(".organizer") || null,
      source: "reskilll",
      scrapedAt: now,
      _meta: meta,
    };
  } catch (err) {
    console.warn("parseCard failed:", err && err.message ? err.message : err);
    return null;
  }
}
