import { Router } from "express";
import { body, validationResult } from "express-validator";
import { signToken } from "../middleware/auth.js";
import { authLimiter } from "../middleware/rateLimit.js";
import { createUser, findByEmailWithPassword, comparePassword } from "../repositories/userRepo.js";

const router = Router();

router.post(
  "/register",
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
      const token = signToken(user.id);
      res.status(201).json({ token, user: { id: user.id, name: user.name, email: user.email } });
    } catch (err) {
      if (err.status === 409) return res.status(409).json({ error: err.message });
      next(err);
    }
  }
);

router.post(
  "/login",
  authLimiter,
  [body("email").isEmail(), body("password").notEmpty()],
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      const { email, password } = req.body;
      const row = await findByEmailWithPassword(email);
      if (!row) return res.status(401).json({ error: "Invalid credentials" });

      const match = await comparePassword(row, password);
      if (!match) return res.status(401).json({ error: "Invalid credentials" });

      const token = signToken(row.id);
      res.json({ token, user: { id: row.id, name: row.name, email: row.email } });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
