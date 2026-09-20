import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { aiLimiter } from "../middleware/rateLimit.js";
import { findById } from "../repositories/userRepo.js";
import { findActive } from "../repositories/hackathonRepo.js";
import { rankHackathonsForUser } from "../services/aiService.js";
import { filterByProximity } from "../services/geoService.js";

const router = Router();

// GET /api/recommendations — personalized "Recommended for YOU" feed
router.get("/", requireAuth, aiLimiter, async (req, res, next) => {
  try {
    const user = await findById(req.userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    let candidates = await findActive(200);
    if (user.profile?.preferredMode && user.profile.preferredMode !== "both") {
      candidates = candidates.filter((h) => h.mode === user.profile.preferredMode);
    }

    const [lng, lat] = user.profile?.location?.coordinates || [0, 0];
    const userCoords = lng !== 0 || lat !== 0 ? { lat, lng } : null;

    const nearby = filterByProximity(
      candidates,
      userCoords,
      Number(process.env.MAX_DISTANCE_KM || 500)
    );

    if (!nearby.length) {
      return res.json({ recommendations: [] });
    }

    const ranked = await rankHackathonsForUser(user, nearby);

    // Attach link/mode/deadline back onto the AI's slimmed-down response
    const byId = new Map(nearby.map((h) => [h.id, h]));
    const enriched = ranked.map((r) => {
      const full = byId.get(r.id);
      return {
        ...r,
        link: full?.link,
        mode: full?.mode,
        distanceKm: full?.distanceKm,
        registrationDeadline: full?.registrationDeadline,
      };
    });

    res.json({ recommendations: enriched });
  } catch (err) {
    next(err);
  }
});

export default router;
