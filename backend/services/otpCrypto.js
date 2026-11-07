import crypto from "crypto";

export const OTP_LENGTH = 6;
export const OTP_TTL_MS = 10 * 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RESEND_COOLDOWN_SECONDS = 60;

export function generateOtp() {
  return crypto.randomInt(0, 10 ** OTP_LENGTH).toString().padStart(OTP_LENGTH, "0");
}

export function isSixDigitOtp(value) {
  return typeof value === "string" && /^\d{6}$/.test(value);
}

export function resolveOtpSecret() {
  const secret = process.env.OTP_HASH_SECRET || process.env.JWT_SECRET;
  if (!secret) {
    throw Object.assign(new Error("OTP hashing secret is not configured"), {
      status: 503,
      code: "OTP_CONFIG_MISSING",
    });
  }
  return secret;
}

export function hashOtp(otp, userId, secret = resolveOtpSecret()) {
  return crypto
    .createHmac("sha256", secret)
    .update(`${userId}:${otp}`)
    .digest("hex");
}
