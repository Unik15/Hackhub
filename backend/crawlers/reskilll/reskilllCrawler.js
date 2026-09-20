import { fetchWithFallback } from "../../utils/fetchWithFallback.js";
import { parseCard } from "../../utils/parseCard.js";
import { addResult } from "../../utils/normalizer.js";

const BASE_URL = "https://reskilll.com";

export async function crawlReskilll() {
  return fetchWithFallback({
    sourceName: "reskilll",

    htmlUrl: `${BASE_URL}/allhacks`,

    parseHTML: ($) => {
      // Final normalized results
      const finalItems = [];

      // Dedup should happen centrally in addResult()
      const runSeen = new Set();

      try {
        // Find Reskilll hackathon/event links
        const cards = $("a[href*='/hack/']");

        console.log(
          `[crawler][reskilll] candidate cards=${cards.length}`
        );

        cards.each((i, el) => {
          // Maximum 100 valid results
          if (finalItems.length >= 100) return false;

          try {
            // ==========================================
            // STEP 1: Parse raw card data
            // ==========================================
            const parsed = parseCard($, el, BASE_URL, {
              sourceDayFirst: true,
              minConfidence: 40,
            });

            if (!parsed) {
              return;
            }

            // ==========================================
            // STEP 2: Normalize + validate + dedup
            // ==========================================
            const item = addResult(parsed, {
              seen: runSeen,
              minConfidence: 40,
            });

            if (!item) {
              return;
            }

            // ==========================================
            // STEP 3: Add final DB-ready item
            // ==========================================
            finalItems.push(item);
          } catch (itemErr) {
            console.warn(
              `[reskilll] item ${i} parse/normalize failed:`,
              itemErr.message
            );
          }
        });

        // ==========================================
        // Diagnostics
        // ==========================================
        console.log(
          `[crawler][reskilll] candidates=${cards.length} parsed=${finalItems.length}`
        );

        if (finalItems.length === 0) {
          console.warn(
            "[reskilll] ⚠️ No valid results after parsing + normalization"
          );
        }
      } catch (err) {
        console.error(
          "[reskilll] ❌ parse failed:",
          err.message
        );
      }

      // Return normalized results to crawler pipeline
      return finalItems;
    },

    useBrowser: true,
  });
}