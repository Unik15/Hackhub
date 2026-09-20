import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import * as hackathonRepo from "../repositories/hackathonRepo.js";
import { toggleSavedHackathon } from "../repositories/userRepo.js";

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
