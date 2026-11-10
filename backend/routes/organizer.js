import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { listOrganizerHackathons } from "../repositories/hackathonRepo.js";
import { listSubmissionsByEmail } from "../repositories/submissionRepo.js";
import { findById } from "../repositories/userRepo.js";

const router = Router();

/**
 * Organizer surfaces are scoped to the signed-in account's own email.
 *
 * The dashboard used to take an arbitrary `email` query param and return that
 * organizer's data to anyone — a privacy hole, and the reason the endpoint
 * never needed auth. Admins may still pass `email` to inspect an organizer;
 * everyone else is pinned to their own address server-side.
 */
async function resolveScope(req, res) {
  const user = await findById(req.userId);
  if (!user) {
    res.status(401).json({ error: "Session is no longer valid" });
    return null;
  }

  const requested = String(req.query.email || "").trim().toLowerCase();
  const own = String(user.email || "").toLowerCase();

  if (requested && requested !== own && user.role !== "admin") {
    res.status(403).json({ error: "You can only view your own submissions." });
    return null;
  }

  return { email: requested || own, isAdmin: user.role === "admin" };
}

router.get("/hackathons", requireAuth, async (req, res, next) => {
  try {
    const scope = await resolveScope(req, res);
    if (!scope) return;

    const items = await listOrganizerHackathons(scope.email);
    res.json({ items, total: items.length });
  } catch (err) {
    next(err);
  }
});

router.get("/submissions", requireAuth, async (req, res, next) => {
  try {
    const scope = await resolveScope(req, res);
    if (!scope) return;

    const items = await listSubmissionsByEmail(scope.email);
    res.json({ items, total: items.length });
  } catch (err) {
    next(err);
  }
});

export default router;
