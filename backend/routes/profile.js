import { Router } from "express";
import { body, validationResult } from "express-validator";
import { requireAuth } from "../middleware/auth.js";
import { findById, updateProfile } from "../repositories/userRepo.js";
import { geocodeCity } from "../services/geoService.js";

const router = Router();

router.get("/", requireAuth, async (req, res, next) => {
  try {
    const user = await findById(req.userId);
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json({ user });
  } catch (err) {
    next(err);
  }
});

router.put(
  "/",
  requireAuth,
  [
    body("profile.skills").optional().isArray(),
    body("profile.interests").optional().isArray(),
    body("profile.experience").optional().isIn(["beginner", "intermediate", "advanced"]),
    body("profile.city").optional().isString(),
    body("profile.preferredMode").optional().isIn(["online", "offline", "both"]),
    body("phone").optional().isString(),
  ],
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      const { profile = {}, phone, notificationPrefs } = req.body;

      // Re-geocode if the city changed, so location-based filtering stays accurate
      if (profile.city) {
        const geo = await geocodeCity(profile.city);
        if (geo) {
          profile.location = { coordinates: [geo.lng, geo.lat] };
        }
      }

      const user = await updateProfile(req.userId, { profile, phone, notificationPrefs });
      res.json({ user });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
