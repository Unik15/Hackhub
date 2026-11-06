import crypto from "crypto";

export const PASSWORD_RESET_TOKEN_BYTES = 32;
export const PASSWORD_RESET_TTL_MS = 30 * 60 * 1000;
export const PASSWORD_RESET_TTL_MINUTES = Math.floor(PASSWORD_RESET_TTL_MS / 60000);
export const PASSWORD_RESET_RESEND_COOLDOWN_SECONDS = 60;

export function generatePasswordResetToken() {
  return crypto.randomBytes(PASSWORD_RESET_TOKEN_BYTES).toString("base64url");
}

export function isPasswordResetToken(value) {
  return typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value);
}

export function resolvePasswordResetSecret() {
  const secret =
    process.env.PASSWORD_RESET_TOKEN_SECRET ||
    process.env.OTP_HASH_SECRET ||
    process.env.JWT_SECRET;

  if (!secret) {
    throw Object.assign(new Error("Password reset token secret is not configured"), {
      status: 503,
      code: "PASSWORD_RESET_CONFIG_MISSING",
    });
  }

  return secret;
}

export function hashPasswordResetToken(token, secret = resolvePasswordResetSecret()) {
  return crypto.createHmac("sha256", secret).update(String(token)).digest("hex");
}
