import nodemailer from "nodemailer";
import twilio from "twilio";

const REQUIRED_SMTP_VARIABLES = ["SMTP_HOST", "SMTP_USER", "SMTP_PASS"];

export function getMissingSmtpVariables() {
  return REQUIRED_SMTP_VARIABLES.filter((name) => !process.env[name]);
}

let mailer = null;
function getMailer() {
  if (mailer) return mailer;
  const port = Number(process.env.SMTP_PORT || 587);
  mailer = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  return mailer;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatOtpText(name, otp) {
  const firstName = (name || "there").trim().split(/\s+/)[0];
  return `Hi ${firstName},

Your HackHub email verification code is:

${otp}

This code expires in 10 minutes. Enter it on the HackHub verification page to activate your account.

Never share this code with anyone. HackHub will never ask you for it.

If you did not create a HackHub account, you can safely ignore this email.`;
}

function formatOtpHtml(name, otp) {
  const safeName = escapeHtml((name || "there").trim().split(/\s+/)[0]);
  const safeOtp = escapeHtml(otp);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Verify your HackHub email</title>
  </head>
  <body style="margin:0;padding:0;background:#F7F3EA;font-family:Arial,Helvetica,sans-serif;color:#191B29;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F7F3EA;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#FFFFFF;border:1px solid #E8DFCE;border-radius:12px;overflow:hidden;">
            <tr>
              <td style="background:#191B29;padding:24px 32px;">
                <span style="display:inline-block;width:30px;height:30px;line-height:30px;text-align:center;border-radius:6px;background:#F2A93B;color:#191B29;font-weight:700;font-size:16px;">H</span>
                <span style="font-size:22px;font-weight:700;color:#FFFFFF;margin-left:10px;vertical-align:middle;">HackHub</span>
              </td>
            </tr>
            <tr>
              <td style="padding:36px 32px 12px;">
                <h1 style="margin:0 0 12px;font-size:26px;line-height:1.25;color:#191B29;">Verify your email</h1>
                <p style="margin:0;font-size:15px;line-height:1.6;color:#5A5D6B;">Hi ${safeName}, use the code below to finish creating your HackHub account.</p>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:14px 32px 24px;">
                <div style="display:inline-block;background:#FFF7E8;border:1px solid #F2A93B;border-radius:10px;padding:18px 26px;font-family:'Courier New',Courier,monospace;font-size:38px;line-height:1;font-weight:700;letter-spacing:10px;color:#191B29;">${safeOtp}</div>
                <p style="margin:14px 0 0;font-size:13px;color:#7A7D8A;">This code expires in 10 minutes.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 28px;">
                <div style="background:#FFF7E8;border-left:4px solid #F2A93B;padding:14px 16px;font-size:13px;line-height:1.6;color:#5A5D6B;">
                  <strong style="color:#191B29;">Never share this code.</strong> HackHub will never ask you for your verification code by email, phone, or chat.
                </div>
                <p style="margin:22px 0 0;font-size:13px;line-height:1.6;color:#7A7D8A;">If you did not create a HackHub account, you can safely ignore this email. No account changes will happen without this code.</p>
              </td>
            </tr>
            <tr>
              <td style="background:#F7F3EA;border-top:1px solid #E8DFCE;padding:18px 32px;font-size:12px;line-height:1.5;color:#7A7D8A;">
                Need help? Reply to this email and our team will take a look.<br />
                HackHub - discover, build, compete.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export async function sendOtpEmail({ to, name, otp }) {
  const missing = getMissingSmtpVariables();
  if (missing.length) {
    throw Object.assign(
      new Error(`Email service is missing configuration: ${missing.join(", ")}`),
      { status: 503, code: "EMAIL_NOT_CONFIGURED" }
    );
  }

  const transporter = getMailer();
  await transporter.sendMail({
    from: `"HackHub" <${process.env.SMTP_USER}>`,
    to,
    subject: "Your HackHub verification code",
    text: formatOtpText(name, otp),
    html: formatOtpHtml(name, otp),
  });

  return { sent: true };
}

function formatPasswordResetText(name, resetUrl, expiresInMinutes) {
  const firstName = (name || "there").trim().split(/\s+/)[0];
  return `Hi ${firstName},

We received a request to reset your HackHub account password.

Open this link to choose a new password:

${resetUrl}

This link expires in ${expiresInMinutes} minutes and can only be used once.

If you did not request a password reset, you can safely ignore this email. Your password will not change.

Regards,
HackHub Team`;
}

function formatPasswordResetHtml(name, resetUrl, expiresInMinutes) {
  const safeName = escapeHtml((name || "there").trim().split(/\s+/)[0]);
  const safeUrl = escapeHtml(resetUrl);
  const safeMinutes = escapeHtml(expiresInMinutes);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Reset your HackHub password</title>
  </head>
  <body style="margin:0;padding:0;background:#F7F3EA;font-family:Arial,Helvetica,sans-serif;color:#191B29;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F7F3EA;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#FFFFFF;border:1px solid #E8DFCE;border-radius:12px;overflow:hidden;">
            <tr>
              <td style="background:#191B29;padding:24px 32px;">
                <span style="display:inline-block;width:30px;height:30px;line-height:30px;text-align:center;border-radius:6px;background:#F2A93B;color:#191B29;font-weight:700;font-size:16px;">H</span>
                <span style="font-size:22px;font-weight:700;color:#FFFFFF;margin-left:10px;vertical-align:middle;">HackHub</span>
              </td>
            </tr>
            <tr>
              <td style="padding:36px 32px 12px;">
                <h1 style="margin:0 0 12px;font-size:26px;line-height:1.25;color:#191B29;">Reset your password</h1>
                <p style="margin:0;font-size:15px;line-height:1.6;color:#5A5D6B;">Hi ${safeName}, we received a request to reset your HackHub account password.</p>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:14px 32px 24px;">
                <a href="${safeUrl}" style="display:inline-block;background:#F2A93B;color:#191B29;text-decoration:none;font-size:15px;font-weight:700;padding:14px 28px;border-radius:8px;">Reset Password</a>
                <p style="margin:16px 0 0;font-size:13px;color:#7A7D8A;">This link expires in ${safeMinutes} minutes and can only be used once.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 28px;">
                <p style="margin:0 0 16px;font-size:13px;line-height:1.6;color:#7A7D8A;">If the button doesn't work, copy and paste this link into your browser:</p>
                <p style="margin:0 0 22px;font-size:13px;line-height:1.6;color:#5A5D6B;word-break:break-all;">${safeUrl}</p>
                <div style="background:#FFF7E8;border-left:4px solid #F2A93B;padding:14px 16px;font-size:13px;line-height:1.6;color:#5A5D6B;">
                  <strong style="color:#191B29;">Didn't request this?</strong> You can safely ignore this email. Your password will not change unless you open the link and choose a new one.
                </div>
              </td>
            </tr>
            <tr>
              <td style="background:#F7F3EA;border-top:1px solid #E8DFCE;padding:18px 32px;font-size:12px;line-height:1.5;color:#7A7D8A;">
                Need help? Reply to this email and our team will take a look.<br />
                HackHub - discover, build, compete.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export async function sendPasswordResetEmail({ to, name, resetUrl, expiresInMinutes = 30 }) {
  const missing = getMissingSmtpVariables();
  if (missing.length) {
    throw Object.assign(
      new Error(`Email service is missing configuration: ${missing.join(", ")}`),
      { status: 503, code: "EMAIL_NOT_CONFIGURED" }
    );
  }

  const transporter = getMailer();
  await transporter.sendMail({
    from: `"HackHub" <${process.env.SMTP_USER}>`,
    to,
    subject: "Reset your HackHub password",
    text: formatPasswordResetText(name, resetUrl, expiresInMinutes),
    html: formatPasswordResetHtml(name, resetUrl, expiresInMinutes),
  });

  return { sent: true };
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
