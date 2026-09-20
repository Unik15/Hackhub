import axios from "axios";
import * as cheerio from "cheerio";
import puppeteer from "puppeteer";

// ==========================
// 🔁 RETRY WITH BACKOFF
// ==========================
async function retry(fn, retries = 2, delay = 500) {
  try {
    return await fn();
  } catch (err) {
    if (retries <= 0) throw err;

    await new Promise(res => setTimeout(res, delay));
    return retry(fn, retries - 1, delay * 2);
  }
}

// ==========================
// ✅ VALIDATION
// ==========================
function isValid(result) {
  return Array.isArray(result) && result.length > 0;
}

// ==========================
// 🧹 NORMALIZER (IMPORTANT)
// ==========================
function normalize(items = []) {
  return items
    .map(i => {
      const parsedStart = i.startDate ? new Date(i.startDate) : null;
      const parsedEnd = i.endDate ? new Date(i.endDate) : null;

      return {
        title: i.title?.trim(),
        url: i.url,

        // 🔥 FIXED FIELD NAME
        platform: i.platform || i.source || "unknown",

        startDate:
          parsedStart && !isNaN(parsedStart)
            ? parsedStart.toISOString()
            : null,

        endDate:
          parsedEnd && !isNaN(parsedEnd)
            ? parsedEnd.toISOString()
            : null,

        isOnline: i.isOnline ?? true,

        // 🔥 ADD DEFAULTS
        trendingScore: 0,
        views: 0,
        applies: 0,
      };
    })
    .filter(i => i.title && i.url);
}

// ==========================
// 🌐 AXIOS INSTANCE
// ==========================
const http = axios.create({
  timeout: 8000,
  headers: {
    "User-Agent": "HackHubBot/1.0"
  }
});

// ==========================
// 🧠 MAIN ENGINE
// ==========================
export async function fetchWithFallback({
  sourceName = "unknown",
  apiUrl,
  htmlUrl,
  parseAPI,
  parseHTML,
  useBrowser = false,
}) {

  // ======================
  // 1️⃣ API
  // ======================
  if (apiUrl && parseAPI) {
    try {
      const { data } = await retry(() => http.get(apiUrl));

      const result = normalize(parseAPI(data));

      if (isValid(result)) {
        console.log(`✅ API SUCCESS [${sourceName}]`);
        return result;
      }

    } catch (err) {
      console.warn(`⚠️ API FAILED [${sourceName}]:`, err.message);
    }
  }

  // ======================
  // 2️⃣ HTML (CHEERIO)
  // ======================
  if (htmlUrl && parseHTML) {
    try {
      const { data } = await retry(() => http.get(htmlUrl));

      const $ = cheerio.load(data);
      const result = normalize(parseHTML($));

      if (isValid(result)) {
        console.log(`✅ HTML SUCCESS [${sourceName}]`);
        return result;
      }

    } catch (err) {
      console.warn(`⚠️ HTML FAILED [${sourceName}]:`, err.message);
    }
  }

  // ======================
  // 3️⃣ PUPPETEER
  // ======================
  if (useBrowser && htmlUrl && parseHTML) {
    let browser;

    try {
      browser = await puppeteer.launch({
        headless: "new",
        args: ["--no-sandbox", "--disable-setuid-sandbox"]
      });

      const page = await browser.newPage();

      await page.goto(htmlUrl, {
        waitUntil: "networkidle2",
        timeout: 20000
      });

      const content = await page.content();
      const $ = cheerio.load(content);

      const result = normalize(parseHTML($));

      if (isValid(result)) {
        console.log(`✅ PUPPETEER SUCCESS [${sourceName}]`);
        return result;
      }

    } catch (err) {
      console.error(`❌ PUPPETEER FAILED [${sourceName}]:`, err.message);
    } finally {
      if (browser) await browser.close();
    }
  }

  // ======================
  // ❌ FAIL
  // ======================
  console.error(`❌ ALL METHODS FAILED [${sourceName}]`);

  return [];
}