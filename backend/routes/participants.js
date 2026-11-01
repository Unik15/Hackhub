import express from "express";
import rateLimit from "express-rate-limit";
import { body, validationResult } from "express-validator";
import { registerParticipant } from "../repositories/participantRepo.js";

const router = express.Router();

router.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many registration attempts. Please try again later." },
  })
);

router.post(
  "/",
  [
    body("hackathon_id").isUUID().withMessage("A valid hackathon is required."),
    body("name").trim().isLength({ min: 1, max: 120 }).withMessage("Name must be between 1 and 120 characters."),
    body("email").trim().isEmail().normalizeEmail().isLength({ max: 180 }).withMessage("Enter a valid email address."),
    body("college").trim().isLength({ min: 1, max: 150 }).withMessage("College / organization must be between 1 and 150 characters."),
  ],
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: errors.array()[0].msg });
    }

    try {
      const participant = await registerParticipant({
        hackathonId: req.body.hackathon_id,
        name: req.body.name.trim(),
        email: req.body.email.trim(),
        college: req.body.college.trim(),
      });

      return res.status(201).json({ participant });
    } catch (error) {
      if (error.status) return res.status(error.status).json({ error: error.message });
      return next(error);
    }
  }
);

export default router;
