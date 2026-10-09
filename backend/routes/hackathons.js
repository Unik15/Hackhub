import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import * as hackathonRepo from "../repositories/hackathonRepo.js";
import { toggleSavedHackathon } from "../repositories/userRepo.js";
import { filterByProximity, geocodeCity } from "../services/geoService.js";

const router = Router();

// GET /api/hackathons?search=&domain=&mode=&page=&limit=
router.get("/", async (req, res, next) => {
  try {
    const { search, domain, mode, page = 1, limit = 20 } = req.query;
    const result = await hackathonRepo.findMany({ search, domain, mode, page, limit });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// GET /api/hackathons/trending?limit=12&offset=0 — ranked by a lightweight trending score
router.get("/trending", async (req, res, next) => {
  try {
    const { limit = 12, offset = 0 } = req.query;
    const items = await hackathonRepo.findTrending(limit, offset);
    res.json({ items });
  } catch (err) {
    next(err);
  }
});

// GET /api/hackathons/nearby?city=Delhi&radius=500
router.get("/nearby", async (req, res, next) => {
  try {
    const city = typeof req.query.city === "string" ? req.query.city.trim() : "";
    const radius = Number(req.query.radius ?? 500);

    if (!city || city.length > 200) {
      return res.status(400).json({ error: "Enter a valid city or location" });
    }
    if (!Number.isFinite(radius) || radius < 10 || radius > 2000) {
      return res.status(400).json({ error: "Radius must be between 10 and 2000 km" });
    }

    const userLocation = await geocodeCity(city);
    if (!userLocation) {
      return res.status(422).json({ error: "We could not find that location. Try a city and country." });
    }

    const candidates = await hackathonRepo.findLocatedActive();
    const items = filterByProximity(candidates, userLocation, radius, { includeOnline: false })
      .sort((a, b) => a.distanceKm - b.distanceKm);

    res.json({ items, location: userLocation.formattedAddress || city, radiusKm: radius, total: items.length });
  } catch (err) {
    next(err);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const item = await hackathonRepo.findById(req.params.id);
    if (!item) return res.status(404).json({ error: "Hackathon not found" });
    res.json({ item });
  } catch (err) {
    next(err);
  }
});

// Save / unsave a hackathon to a user's list (also nudges its trending score)
router.post("/:id/save", requireAuth, async (req, res, next) => {
  try {
    const { saved } = await toggleSavedHackathon(req.userId, req.params.id);
    if (saved) await hackathonRepo.incrementTrendingScore(req.params.id);
    res.json({ saved });
  } catch (err) {
    next(err);
  }
});

export default router;
