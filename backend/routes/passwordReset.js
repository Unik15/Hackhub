import { Router } from "express";
import { body, validationResult } from "express-validator";
import {
  SESSION_COOKIE_NAME,
  sessionCookieOptions,
} from "../middleware/auth.js";
import {
  passwordResetRequestLimiter,
  passwordResetSubmitLimiter,
} from "../middleware/rateLimit.js";
import { findByEmail, hashPassword } from "../repositories/userRepo.js";
import { getMissingSmtpVariables } from "../services/notificationService.js";
import { passwordResetService } from "../services/passwordResetService.js";
import { getPasswordStrengthError } from "../utils/passwordPolicy.js";

export const GENERIC_RESET_REQUEST_MESSAGE =
  "If an account exists for that email, we've sent password reset instructions.";

const defaultUsers = { findByEmail, hashPassword };

function passwordResetIsConfigured() {
  const smtpReady = getMissingSmtpVariables().length === 0;
  const baseUrlReady = Boolean(
    process.env.PASSWORD_RESET_BASE_URL || process.env.CLIENT_URL
  );
  return smtpReady && baseUrlReady;
}

function configurationProblem(res) {
  console.error("[auth] Password reset is not configured.");
  return res.status(503).json({
    code: "PASSWORD_RESET_NOT_CONFIGURED",
    error: "Password reset is temporarily unavailable. Please contact support.",
  });
}

export function createPasswordResetRouter({
  users = defaultUsers,
  service = passwordResetService,
  isConfigured = passwordResetIsConfigured,
} = {}) {
  const router = Router();

  router.post(
    "/forgot-password",
    passwordResetRequestLimiter,
    [body("email").isEmail().withMessage("Valid email required").normalizeEmail()],
    async (req, res, next) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: errors.array()[0].msg,
          errors: errors.array(),
        });
      }

      if (!isConfigured()) {
        return configurationProblem(res);
      }

      try {
        const user = await users.findByEmail(req.body.email);

        if (user) {
          try {
            await service.requestReset(user);
          } catch (err) {
            const reason = err.code ? `${err.code}: ${err.message}` : err.message;
            console.error("[auth] Password reset request failed:", reason);
          }
        }

        return res.json({ message: GENERIC_RESET_REQUEST_MESSAGE });
      } catch (err) {
        next(err);
      }
    }
  );

  router.post(
    "/reset-password",
    passwordResetSubmitLimiter,
    [
      body("token")
        .isString()
        .trim()
        .isLength({ min: 20, max: 200 })
        .withMessage("This password reset link is invalid."),
      body("password").custom((value) => {
        const message = getPasswordStrengthError(value);
        if (message) throw new Error(message);
        return true;
      }),
    ],
    async (req, res, next) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: errors.array()[0].msg,
          errors: errors.array(),
        });
      }

      try {
        const { token, password } = req.body;
        const passwordHash = await users.hashPassword(password);
        const status = await service.resetPassword({ token, passwordHash });

        switch (status) {
          case "reset": {
            const { maxAge, ...clearOptions } = sessionCookieOptions();
            return res
              .clearCookie(SESSION_COOKIE_NAME, clearOptions)
              .json({
                message:
                  "Your password has been reset. You can now log in with your new password.",
              });
          }
          case "expired":
            return res.status(410).json({
              code: "RESET_TOKEN_EXPIRED",
              error: "This password reset link has expired. Please request a new one.",
            });
          case "used":
            return res.status(410).json({
              code: "RESET_TOKEN_USED",
              error: "This password reset link has already been used. Please request a new one.",
            });
          case "invalid":
          case "user_not_found":
            return res.status(400).json({
              code: "RESET_TOKEN_INVALID",
              error: "This password reset link is invalid. Please request a new one.",
            });
          default:
            throw Object.assign(new Error("Unexpected password reset result"), {
              status: 500,
            });
        }
      } catch (err) {
        next(err);
      }
    }
  );

  return router;
}

const passwordResetRoutes = createPasswordResetRouter();

export default passwordResetRoutes;
