import { Router } from "express";
import { body, validationResult } from "express-validator";
import { requireAuth, SESSION_COOKIE_NAME, sessionCookieOptions, signToken } from "../middleware/auth.js";
import { authLimiter } from "../middleware/rateLimit.js";
import { createUser, findByEmailWithPassword, comparePassword, findById } from "../repositories/userRepo.js";

const router = Router();

function sendSession(res, user, status = 200) {
  const token = signToken(user.id);
  res
    .status(status)
    .cookie(SESSION_COOKIE_NAME, token, sessionCookieOptions())
    .json({ user: { id: user.id, name: user.name, email: user.email } });
}

router.post(
  ["/register", "/signup"],
  authLimiter,
  [
    body("name").trim().notEmpty().withMessage("Name is required"),
    body("email").isEmail().withMessage("Valid email required").normalizeEmail(),
    body("password").isLength({ min: 8 }).withMessage("Password must be at least 8 characters"),
  ],
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      const { name, email, password } = req.body;
      const user = await createUser({ name, email, password });
      sendSession(res, user, 201);
    } catch (err) {
      if (err.status === 409) return res.status(409).json({ error: err.message });
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
      if (!row) return res.status(401).json({ error: "Invalid credentials" });

      const match = await comparePassword(row, password);
      if (!match) return res.status(401).json({ error: "Invalid credentials" });

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
    res.json({ user });
  } catch (err) {
    next(err);
  }
});

router.post("/logout", (req, res) => {
  const { maxAge, ...clearOptions } = sessionCookieOptions();
  res.clearCookie(SESSION_COOKIE_NAME, clearOptions).status(204).send();
});

export default router;
