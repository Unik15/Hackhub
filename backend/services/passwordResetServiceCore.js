import {
  PASSWORD_RESET_RESEND_COOLDOWN_SECONDS,
  PASSWORD_RESET_TTL_MS,
  generatePasswordResetToken,
  hashPasswordResetToken,
  resolvePasswordResetSecret,
} from "./passwordResetCrypto.js";

function resolveBaseUrl(override) {
  const value = override || process.env.PASSWORD_RESET_BASE_URL || process.env.CLIENT_URL;

  if (!value) {
    throw Object.assign(new Error("Password reset URL base is not configured"), {
      status: 503,
      code: "PASSWORD_RESET_NOT_CONFIGURED",
    });
  }

  return String(value).replace(/\/+$/, "");
}

export function createPasswordResetService({
  repo,
  sendEmail,
  now = () => new Date(),
  secret,
  baseUrl,
  ttlMs = PASSWORD_RESET_TTL_MS,
  resendAfterSeconds = PASSWORD_RESET_RESEND_COOLDOWN_SECONDS,
} = {}) {
  if (!repo) {
    throw new Error("createPasswordResetService requires a repository");
  }

  if (typeof sendEmail !== "function") {
    throw new Error("createPasswordResetService requires an email sender");
  }

  const getSecret = () => secret || resolvePasswordResetSecret();

  return {
    async requestReset(user) {
      const token = generatePasswordResetToken();
      const tokenHash = hashPasswordResetToken(token, getSecret());
      const expiresAt = new Date(now().getTime() + ttlMs);
      const resetBaseUrl = resolveBaseUrl(baseUrl);

      const result = await repo.issueResetToken({
        userId: user.id,
        tokenHash,
        expiresAt,
        resendAfterSeconds,
      });

      if (!result || result.status !== "issued") {
        return {
          status: result?.status || "error",
          retryAfterSeconds: Number(result?.retry_after_seconds) || 0,
        };
      }

      const resetUrl = `${resetBaseUrl}/reset-password?token=${encodeURIComponent(token)}`;

      try {
        await sendEmail({
          to: user.email,
          name: user.name,
          resetUrl,
          expiresInMinutes: Math.round(ttlMs / 60000),
        });
      } catch (err) {
        try {
          await repo.removeResetToken(result.token_id);
        } catch {}
        throw err;
      }

      return {
        status: "sent",
        tokenId: result.token_id,
        expiresAt,
      };
    },

    async resetPassword({ token, passwordHash }) {
      const tokenHash = hashPasswordResetToken(token, getSecret());

      return repo.consumeResetToken({ tokenHash, passwordHash });
    },
  };
}
