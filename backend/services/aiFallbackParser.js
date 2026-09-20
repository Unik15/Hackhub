import axios from "axios";
import { makeLogger } from "../utils/logger.js";
import { retryAsync } from "../utils/retry.js";

const log = makeLogger("crawler:ai-fallback");

const OLLAMA_URL = () => `${process.env.OLLAMA_BASE_URL || "http://localhost:11434"}/api/generate`;
const MODEL = () => process.env.OLLAMA_MODEL || "llama3";

// Truncate before sending — an LLM call per crawl is already the most
// expensive step in this pipeline; sending an entire multi-hundred-KB page
// would make it both slow and likely to exceed context anyway. This means
// the AI fallback only "sees" the first slice of the page — good enough to
// recover a broken selector on typical listing pages, not a substitute for
// fixing the real selector.
const MAX_HTML_CHARS = 15000;

function safeParseJsonArray(text) {
  const cleaned = text.replace(/```json|```/g, "").trim();
  const start = cleaned.indexOf("[");
  const end = cleaned.lastIndexOf("]");
  if (start === -1 || end === -1) throw new Error("No JSON array found in model output");
  const parsed = JSON.parse(cleaned.slice(start, end + 1));
  if (!Array.isArray(parsed)) throw new Error("Parsed result is not an array");
  return parsed;
}

/**
 * Layer 4 (AI-based parsing) — deliberately gated behind
 * CRAWLER_AI_FALLBACK_ENABLED and only ever called when the cheap selector
 * layers (primary + fallback + structural) already came back empty or
 * anomalously low. This is NOT meant to run on every crawl:
 * - It costs an LLM call per source per run.
 * - It's slower than DOM parsing (seconds vs. milliseconds).
 * - It can hallucinate fields on ambiguous markup — treat its output as
 *   provisional and let the existing validation layer filter it same as
 *   any other source.
 */
export async function aiExtractHackathons(html, { source = "unknown" } = {}) {
  if (process.env.CRAWLER_AI_FALLBACK_ENABLED !== "true") {
    log.warn(`AI fallback is disabled (CRAWLER_AI_FALLBACK_ENABLED != "true") — skipping for ${source}`);
    return [];
  }

  const snippet = html.slice(0, MAX_HTML_CHARS);
  const prompt = `Extract hackathon listing info from this HTML fragment. Ignore navigation, footer,
and ad content. Only include entries that look like actual hackathon/event listings.

HTML:
${snippet}

Respond with ONLY a JSON array, no markdown fences, no commentary. Each element must be exactly:
{"title": "<string>", "link": "<absolute or relative URL, or null if not found>", "date": "<string, or null>", "location": "<string, or null>"}

If nothing resembling a hackathon listing is present, respond with [].`;

  try {
    const { data } = await retryAsync(
      () =>
        axios.post(
          OLLAMA_URL(),
          { model: MODEL(), prompt, stream: false, format: "json", options: { temperature: 0 } },
          { timeout: 45000 }
        ),
      { retries: 2, baseDelayMs: 2000, label: `Ollama AI-fallback extraction for ${source}` }
    );

    const parsed = safeParseJsonArray(data.response);
    log.warn(`AI fallback extracted ${parsed.length} candidate listings for ${source}`, {
      note: "provisional — will still pass through the normal validation layer",
    });
    return parsed;
  } catch (err) {
    log.error(`AI fallback parsing failed for ${source}`, { message: err.message });
    return [];
  }
}
