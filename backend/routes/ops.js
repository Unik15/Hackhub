import { Router } from "express";
import { getAllState, getState } from "../utils/strategyEngine.js";

const router = Router();

/**
 * GET /api/ops/crawler-strategy
 * Shows, per source, what the runtime decision engine currently believes:
 * which strategy last succeeded, how many consecutive failures each
 * strategy has, and the last 10 outcomes. This is the visible proof that
 * the system is actively deciding rather than blindly re-trying the same
 * fixed order every run.
 *
 * No auth required — this is operational visibility, not user data. If
 * this API is ever exposed publicly, consider gating it behind requireAuth
 * + an admin role check.
 */
router.get("/crawler-strategy", (req, res) => {
  const { source } = req.query;
  if (source) {
    return res.json({ source, state: getState(source) });
  }
  res.json({ sources: getAllState() });
});

export default router;
