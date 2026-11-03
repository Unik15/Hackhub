import {
  OTP_RESEND_COOLDOWN_SECONDS,
  OTP_TTL_MS,
  generateOtp,
  hashOtp,
  resolveOtpSecret,
} from "./otpCrypto.js";

export function createOtpService({ repo, now = () => new Date(), secret } = {}) {
  if (!repo) {
    throw new Error("createOtpService requires a repository");
  }

  const getSecret = () => secret || resolveOtpSecret();

  return {
    async issue(userId, { resendAfterSeconds = OTP_RESEND_COOLDOWN_SECONDS } = {}) {
      const otp = generateOtp();
      const expiresAt = new Date(now().getTime() + OTP_TTL_MS);
      const result = await repo.issueOtp({
        userId,
        otpHash: hashOtp(otp, userId, getSecret()),
        expiresAt,
        resendAfterSeconds,
      });

      if (!result || result.status !== "issued") {
        return {
          status: result?.status || "error",
          retryAfterSeconds: Number(result?.retry_after_seconds) || 0,
        };
      }

      return {
        status: "issued",
        otp,
        otpId: result.otp_id,
        expiresAt,
        resendAfterSeconds,
      };
    },

    async verify(userId, otp) {
      return repo.verifyOtp({
        userId,
        otpHash: hashOtp(otp, userId, getSecret()),
      });
    },

    async revoke(otpId) {
      if (!otpId) return;
      await repo.removeOtp(otpId);
    },
  };
}
