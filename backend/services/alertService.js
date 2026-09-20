import axios from "axios";
import nodemailer from "nodemailer";
import { makeLogger } from "../utils/logger.js";
import { retryAsync } from "../utils/retry.js";

const log = makeLogger("alerts");

let mailer = null;
function getOpsMailer() {
  if (mailer) return mailer;
  if (!process.env.SMTP_HOST) return null;
  mailer = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: false,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  return mailer;
}

/**
 * Sends a message to a Telegram chat via the Bot API. Requires
 * TELEGRAM_BOT_TOKEN (from @BotFather) and TELEGRAM_CHAT_ID (the chat/group
 * the bot should post into) — silently skips if either is missing, rather
 * than throwing, so a misconfigured alert channel never breaks the crawler
 * run that triggered it.
 */
export async function sendTelegramAlert(message) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    log.warn("Telegram alert skipped — TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set");
    return { skipped: true };
  }

  try {
    await retryAsync(
      () =>
        axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
          chat_id: chatId,
          text: message,
          parse_mode: "HTML",
        }),
      { retries: 2, baseDelayMs: 1000, label: "Telegram alert send" }
    );
    return { sent: true, channel: "telegram" };
  } catch (err) {
    log.error("Telegram alert failed to send", { message: err.response?.data?.description || err.message });
    return { sent: false, error: err.message };
  }
}

/**
 * Sends an ops alert email to a fixed admin address (OPS_ALERT_EMAIL) —
 * distinct from the per-user digest emails in notificationService.js.
 * Skips silently if SMTP or the admin address isn't configured.
 */
export async function sendOpsEmailAlert(message) {
  const to = process.env.OPS_ALERT_EMAIL;
  const transporter = getOpsMailer();

  if (!to || !transporter) {
    log.warn("Email alert skipped — SMTP not configured or OPS_ALERT_EMAIL not set");
    return { skipped: true };
  }

  try {
    await retryAsync(
      () =>
        transporter.sendMail({
          from: `"HackHub Alerts" <${process.env.SMTP_USER}>`,
          to,
          subject: "HackHub alert",
          text: message,
        }),
      { retries: 2, baseDelayMs: 1000, label: "Email alert send" }
    );
    return { sent: true, channel: "email" };
  } catch (err) {
    log.error("Email alert failed to send", { message: err.message });
    return { sent: false, error: err.message };
  }
}

/**
 * Fan out an ops alert to every configured channel. Each channel fails
 * independently (Promise.allSettled) — a broken Telegram token shouldn't
 * suppress the email alert, or vice versa.
 */
export async function sendOpsAlert(message) {
  log.warn(`ALERT: ${message}`);
  return Promise.allSettled([sendTelegramAlert(message), sendOpsEmailAlert(message)]);
}
