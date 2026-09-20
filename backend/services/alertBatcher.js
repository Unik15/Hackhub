import { sendOpsAlert } from "./alertService.js";
import { makeLogger } from "../utils/logger.js";

export const ALERT_TYPES = Object.freeze({
  ERROR: {
    icon: "🔴",
    level: "error",
    label: "ERROR",
  },
  WARNING: {
    icon: "⚠️",
    level: "warn",
    label: "WARNING",
  },
  SUCCESS: {
    icon: "✅",
    level: "info",
    label: "SUCCESS",
  },
  INFO: {
    icon: "ℹ️",
    level: "info",
    label: "INFO",
  },
});

const log = makeLogger("alert-batcher");

// In-memory only — resets on process restart. Acceptable trade-off here:
// worst case after a restart is one extra alert being allowed through
// sooner than its cooldown would normally permit, never a lost alert.
const lastSentAtByKey = new Map();
let buffer = [];

/**
 * Queues an alert instead of sending it immediately. This is what was
 * missing before: every anomaly and every crawler crash fired its own
 * Telegram/email message the instant it happened, so a run where all three
 * sources had a bad day meant three separate pings instead of one summary —
 * and a recurring problem (same broken selector every 6 hours) would alert
 * every single run forever.
 *
 * @param {string} message - human-readable alert line
 * @param {object} [opts]
 * @param {string} [opts.dedupeKey] - if provided, suppresses repeat alerts
 *   sharing this key within `cooldownMs` (e.g. "anomaly-devpost")
 * @param {number} [opts.cooldownMs] - cooldown window, default 1 hour
 */

export function formatAlert({
  type = "INFO",
  title,
  message,
  meta = {},
}) {
  if (!title || !message) {
    throw new Error("formatAlert: title and message required");
  }

  // ✅ yaha use ho raha hai ALERT_TYPES
  const alertType = ALERT_TYPES[type] || ALERT_TYPES.INFO;

  const icon = alertType.icon;
  const level = alertType.level;
  const label = alertType.label;

  const escape = (text = "") =>
   text.replace(/[_*\[\]()~`>#+=|{}.!-]/g, "\\$&");

  let formatted =
    `${icon} *${escape(label)}: ${escape(title)}*\n\n${escape(message)}`;

  if (meta && Object.keys(meta).length > 0) {
    formatted += "\n\n📌 Details:";

    for (const [key, val] of Object.entries(meta)) {
      let value;
      try {
        value =
          typeof val === "object"
            ? JSON.stringify(val)
            : val;
      } catch {
        value = "[unserializable]";
      }

      formatted += `\n- ${escape(key)}: ${escape(String(value))}`;
    }
  }

  if (formatted.length > 3500) {
    formatted = formatted.slice(0, 3500) + "\n...truncated";
  }

  return formatted;
}

function normalizeMessage(messageOrObject) {
if (
  messageOrObject &&
  typeof messageOrObject === "object" &&
  !Array.isArray(messageOrObject)
) {
  try {
    return formatAlert(messageOrObject);
  } catch {
    return "⚠️ Invalid alert format";
  }
}

return String(messageOrObject);
}
export function collectAlert(messageOrObject, { dedupeKey, cooldownMs = 60 * 60 * 1000 } = {})  {

  if (dedupeKey) {
    const last = lastSentAtByKey.get(dedupeKey);
    if (last && Date.now() - last < cooldownMs) {
      log.info("Alert suppressed by cooldown", {
  dedupeKey,
  message: messageOrObject,
 });
      return;
    }
    lastSentAtByKey.set(dedupeKey, Date.now());
  }

 const message = normalizeMessage(messageOrObject);

buffer.push(message);
log.info("Alert queued for batch send", { message, queueLength: buffer.length });
}

/**
 * Sends everything queued since the last flush as ONE consolidated message,
 * then clears the queue. Call this once, at the end of a crawl run (or any
 * other batch of related work) — not per-item.
 */
function buildAlertMessage({ title, buffer }) {
  if (!Array.isArray(buffer) || buffer.length === 0) {
    return null;
  }

  const escape = (text = "") => text;
  const MAX_ITEMS = 20;
  const items = buffer.slice(0, MAX_ITEMS);

  let combined = `📊 <b>${escape(title)}</b>\n\n${items
    .map((m, i) => `${i + 1}. ${escape(String(m))}`)
    .join("\n\n")}`;

  if (combined.length > 3500) {
    combined = combined.slice(0, 3500) + "\n...truncated";
  }

  return combined;
}

let isFlushing = false;

export async function flushAlerts({
  title = "HackHub alert summary",
} = {}) {
  if (!Array.isArray(buffer) || buffer.length === 0) {
    return { sent: false, reason: "nothing queued" };
  }

  if (isFlushing) {
    return { sent: false, reason: "already flushing" };
  }

  isFlushing = true;

  // 👇 snapshot buffer (safe copy)
  const items = [...buffer];

  const message = buildAlertMessage({
    title,
    buffer: items,
  });

  if (!message) {
    isFlushing = false;
    return { sent: false, reason: "empty message" };
  }

  log.info(`Flushing ${items.length} batched alert(s)`);

  try {
    // 👇 simple retry inline (no external dependency)
    let attempts = 2;
    while (attempts >= 0) {
      try {
        await sendOpsAlert(message);
        break;
      } catch (err) {
        if (attempts === 0) throw err;
        await new Promise(res => setTimeout(res, 1000));
        attempts--;
      }
    }

    // ✅ ONLY remove items that were sent
    buffer = buffer.slice(items.length);

    return { sent: true, count: items.length };

  } catch (err) {
    log.error("Alert send failed:", err.message);

    return {
      sent: false,
      error: err.message,
      pending: items.length,
    };

  } finally {
    isFlushing = false;
  }
}

/** Exposed mainly for tests/debugging — how many alerts are waiting. */
export function pendingAlertCount() {
  return buffer.length;
}
