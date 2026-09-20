import nodemailer from "nodemailer";
import twilio from "twilio";

let mailer = null;
function getMailer() {
  if (mailer) return mailer;
  mailer = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: false,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  return mailer;
}

let twilioClient = null;
function getTwilio() {
  if (twilioClient) return twilioClient;
  if (!process.env.TWILIO_ACCOUNT_SID) return null;
  twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  return twilioClient;
}

function formatDigestText(user, recommendations) {
  const top = recommendations.slice(0, 5);
  const lines = top.map(
    (r, i) => `${i + 1}. ${r.title} — score ${r.score}/100\n   ${r.reason}\n   ${r.link || ""}`
  );
  return `Hi ${user.name.split(" ")[0]}, here are today's top hackathon picks for you:\n\n${lines.join(
    "\n\n"
  )}\n\nManage preferences in your HackHub profile.`;
}

function formatDigestHtml(user, recommendations) {
  const top = recommendations.slice(0, 5);
  const items = top
    .map(
      (r) => `
      <tr>
        <td style="padding:12px 0;border-bottom:1px solid #232838;">
          <div style="font-weight:600;color:#E8ECF1;">${r.title}</div>
          <div style="color:#00D9C0;font-size:12px;margin:4px 0;">Match score: ${r.score}/100</div>
          <div style="color:#7A8699;font-size:13px;">${r.reason}</div>
          ${r.link ? `<a href="${r.link}" style="color:#FFB84D;font-size:13px;">View hackathon →</a>` : ""}
        </td>
      </tr>`
    )
    .join("");

  return `
  <div style="background:#0A0E17;padding:24px;font-family:Arial,sans-serif;">
    <h2 style="color:#E8ECF1;">Your daily HackHub picks</h2>
    <table style="width:100%;border-collapse:collapse;">${items}</table>
  </div>`;
}

export async function sendEmailDigest(user, recommendations) {
  if (!user.notificationPrefs?.email || !user.email) return { skipped: true };

  const transporter = getMailer();
  await transporter.sendMail({
    from: `"HackHub" <${process.env.SMTP_USER}>`,
    to: user.email,
    subject: `${recommendations.length} hackathons matched for you today`,
    text: formatDigestText(user, recommendations),
    html: formatDigestHtml(user, recommendations),
  });

  return { sent: true, channel: "email" };
}

export async function sendWhatsappDigest(user, recommendations) {
  if (!user.notificationPrefs?.whatsapp || !user.phone) return { skipped: true };

  const client = getTwilio();
  if (!client) return { skipped: true, reason: "Twilio not configured" };

  const top = recommendations.slice(0, 3);
  const body =
    `HackHub picks for you:\n` +
    top.map((r, i) => `${i + 1}. ${r.title} (${r.score}/100)\n${r.link || ""}`).join("\n");

  await client.messages.create({
    from: process.env.TWILIO_WHATSAPP_FROM,
    to: `whatsapp:${user.phone}`,
    body,
  });

  return { sent: true, channel: "whatsapp" };
}

export async function sendDailyDigest(user, recommendations) {
  if (!user.notificationPrefs?.dailyDigest || !recommendations.length) {
    return { skipped: true };
  }
  const results = await Promise.allSettled([
    sendEmailDigest(user, recommendations),
    sendWhatsappDigest(user, recommendations),
  ]);
  return results;
}
