import { Router } from "express";
import { body, validationResult } from "express-validator";
import {
  requireAuth,
  SESSION_COOKIE_NAME,
  sessionCookieOptions,
  signToken,
} from "../middleware/auth.js";
import {
  authLimiter,
  otpRequestLimiter,
  otpVerifyLimiter,
} from "../middleware/rateLimit.js";
import {
  createUser,
  findByEmail,
  findByEmailWithPassword,
  comparePassword,
  findById,
  deleteUnverifiedUser,
} from "../repositories/userRepo.js";
import {
  OTP_RESEND_COOLDOWN_SECONDS,
  OTP_TTL_MS,
  otpService,
} from "../services/otpService.js";
import {
  getMissingSmtpVariables,
  sendOtpEmail,
} from "../services/notificationService.js";
import { getPasswordStrengthError } from "../utils/passwordPolicy.js";
import { hasSubmittedHackathons } from "../repositories/hackathonRepo.js";
import passwordResetRoutes from "./passwordReset.js";

const router = Router();

router.use(passwordResetRoutes);
const OTP_EXPIRES_IN_SECONDS = Math.floor(OTP_TTL_MS / 1000);

function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    college: user.college || null,
    emailVerified: user.emailVerified ?? user.email_verified === true,
    emailVerifiedAt: user.emailVerifiedAt ?? user.email_verified_at ?? null,
    role: user.role || "user",
  };
}

function sendSession(res, user, status = 200) {
  const token = signToken(user.id);
  res
    .status(status)
    .cookie(SESSION_COOKIE_NAME, token, sessionCookieOptions())
    .json({ user: publicUser(user) });
}

function verificationMetadata() {
  return {
    expiresInSeconds: OTP_EXPIRES_IN_SECONDS,
    resendAfterSeconds: OTP_RESEND_COOLDOWN_SECONDS,
  };
}

function emailConfigProblem(res) {
  const missing = getMissingSmtpVariables();
  if (!missing.length) return false;

  console.error(`[auth] Email delivery is not configured. Missing: ${missing.join(", ")}`);
  res.status(503).json({
    code: "EMAIL_NOT_CONFIGURED",
    error: "Email delivery is not configured. Please contact support.",
  });
  return true;
}

async function deliverVerificationCode(user) {
  const issued = await otpService.issue(user.id);

  if (issued.status === "cooldown") {
    return {
      status: "cooldown",
      retryAfterSeconds: issued.retryAfterSeconds || OTP_RESEND_COOLDOWN_SECONDS,
    };
  }

  if (issued.status !== "issued") {
    throw Object.assign(new Error("Could not create a verification code"), {
      status: 500,
    });
  }

  try {
    await sendOtpEmail({ to: user.email, name: user.name, otp: issued.otp });
  } catch (err) {
    await otpService.revoke(issued.otpId).catch(() => {});
    throw err;
  }

  return { status: "issued" };
}

function otpDeliveryError(res, err) {
  console.error("[auth] Verification email delivery failed:", err.message);
  const status = err.status === 503 ? 503 : 502;
  return res.status(status).json({
    code: "EMAIL_DELIVERY_FAILED",
    error: "We couldn't send the verification email. Please try again.",
  });
}

router.post(
  ["/register", "/signup"],
  authLimiter,
  otpRequestLimiter,
  [
    body("name").trim().notEmpty().withMessage("Name is required"),
    body("email").isEmail().withMessage("Valid email required").normalizeEmail(),
    body("password").custom((value) => {
      const message = getPasswordStrengthError(value);
      if (message) throw new Error(message);
      return true;
    }),
    body("college").optional().trim().isLength({ max: 150 }).withMessage("College must be 150 characters or fewer"),
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
      const { name, email, password, college } = req.body;
      const existing = await findByEmail(email);

      if (existing?.emailVerified) {
        return res.status(409).json({
          code: "EMAIL_ALREADY_REGISTERED",
          error: "Email already registered",
        });
      }

      if (existing) {
        return res.status(409).json({
          code: "ACCOUNT_PENDING_VERIFICATION",
          error: "This email is already registered but not verified. Request a new verification code.",
          email: existing.email,
          requiresEmailVerification: true,
          verification: verificationMetadata(),
        });
      }

      if (emailConfigProblem(res)) return;

      const user = await createUser({ name, email, password, college });
      let delivery;

      try {
        delivery = await deliverVerificationCode(user);
      } catch (err) {
        await deleteUnverifiedUser(user.id).catch((cleanupErr) => {
          console.error("[auth] Failed to roll back unverified account:", cleanupErr.message);
        });
        throw err;
      }

      if (delivery.status === "cooldown") {
        return res.status(429).json({
          code: "OTP_RESEND_COOLDOWN",
          error: "A verification code was just sent. Please wait before requesting another.",
          retryAfterSeconds: delivery.retryAfterSeconds,
          email: user.email,
          requiresEmailVerification: true,
          verification: verificationMetadata(),
        });
      }

      res.status(201).json({
        user: publicUser(user),
        requiresEmailVerification: true,
        message: "Account created. Verification code sent.",
        verification: verificationMetadata(),
      });
    } catch (err) {
      if (err.status === 409) {
        return res.status(409).json({ error: err.message, code: err.code });
      }
      if (err.code === "EMAIL_NOT_CONFIGURED" || err.status === 502 || err.status === 503) {
        return otpDeliveryError(res, err);
      }
      next(err);
    }
  }
);

router.post(
  "/verify-otp",
  otpVerifyLimiter,
  [
    body("email").isEmail().withMessage("Valid email required").normalizeEmail(),
    body("otp")
      .isString()
      .trim()
      .matches(/^\d{6}$/)
      .withMessage("Enter the 6-digit verification code"),
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
      const { email, otp } = req.body;
      const user = await findByEmail(email);

      if (!user) {
        return res.status(400).json({
          code: "INVALID_OTP",
          error: "Invalid OTP. Please try again.",
        });
      }

      if (user.emailVerified) {
        return res.status(409).json({
          code: "EMAIL_ALREADY_VERIFIED",
          error: "This email is already verified. Please log in.",
        });
      }

      const result = await otpService.verify(user.id, otp);

      switch (result) {
        case "verified": {
          const verifiedUser = await findById(user.id);
          return res.json({
            verified: true,
            message: "Email verified successfully.",
            user: verifiedUser,
          });
        }
        case "invalid":
          return res.status(400).json({
            code: "INVALID_OTP",
            error: "Invalid OTP. Please try again.",
          });
        case "expired":
          return res.status(410).json({
            code: "OTP_EXPIRED",
            error: "Your OTP has expired. Please request a new code.",
          });
        case "attempts_exceeded":
          return res.status(429).json({
            code: "OTP_ATTEMPTS_EXCEEDED",
            error: "Too many incorrect attempts. Please request a new code.",
          });
        case "not_found":
          return res.status(400).json({
            code: "OTP_NOT_FOUND",
            error: "No active verification code found. Please request a new code.",
          });
        default:
          throw new Error("Unexpected OTP verification result");
      }
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  "/resend-otp",
  otpRequestLimiter,
  [body("email").isEmail().withMessage("Valid email required").normalizeEmail()],
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: errors.array()[0].msg,
        errors: errors.array(),
      });
    }

    if (emailConfigProblem(res)) return;

    try {
      const { email } = req.body;
      const user = await findByEmail(email);

      if (!user) {
        return res.status(404).json({
          code: "ACCOUNT_NOT_FOUND",
          error: "No account found for this email.",
        });
      }

      if (user.emailVerified) {
        return res.status(409).json({
          code: "EMAIL_ALREADY_VERIFIED",
          error: "This email is already verified. Please log in.",
        });
      }

      let delivery;
      try {
        delivery = await deliverVerificationCode(user);
      } catch (err) {
        return otpDeliveryError(res, err);
      }

      if (delivery.status === "cooldown") {
        res.set("Retry-After", String(delivery.retryAfterSeconds));
        return res.status(429).json({
          code: "OTP_RESEND_COOLDOWN",
          error: "Please wait before requesting another verification code.",
          retryAfterSeconds: delivery.retryAfterSeconds,
        });
      }

      res.json({
        message: "A new verification code has been sent.",
        requiresEmailVerification: true,
        verification: verificationMetadata(),
      });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  "/login",
  authLimiter,
  [body("email").isEmail().normalizeEmail(), body("password").isLength({ min: 8 })],
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      const { email, password } = req.body;
      const row = await findByEmailWithPassword(email);
      if (!row) {
        return res.status(404).json({
          code: "ACCOUNT_NOT_FOUND",
          error: "No account found for this email. Please sign up first.",
        });
      }

      const match = await comparePassword(row, password);
      if (!match) {
        return res.status(401).json({
          code: "INVALID_PASSWORD",
          error: "Incorrect password. Please try again.",
        });
      }

      sendSession(res, row);
    } catch (err) {
      next(err);
    }
  }
);

router.get("/me", requireAuth, async (req, res, next) => {
  try {
    const user = await findById(req.userId);
    if (!user) return res.status(401).json({ error: "Session is no longer valid" });

    // Organizer-only surfaces (the dashboard) key off this: an account that
    // has never submitted anything sees the simple-user experience.
    const hasSubmissions = await hasSubmittedHackathons(user.email);

    res.json({ user: { ...user, hasSubmissions } });
  } catch (err) {
    next(err);
  }
});

router.post("/logout", (req, res) => {
  const { maxAge, ...clearOptions } = sessionCookieOptions();
  res.clearCookie(SESSION_COOKIE_NAME, clearOptions).status(204).send();
});

export default router;
