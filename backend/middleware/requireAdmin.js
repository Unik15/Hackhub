import { findById } from "../repositories/userRepo.js";

/**
 * Admin-only gate for the submission review queue. Must run after requireAuth,
 * which populates req.userId. The role is read from the database on every
 * request, not from the JWT, so revoking admin access takes effect immediately.
 */
export async function requireAdmin(req, res, next) {
  try {
    const user = await findById(req.userId);
    if (!user) {
      return res.status(401).json({ error: "Session is no longer valid" });
    }

    if (user.role !== "admin") {
      return res.status(403).json({ error: "Admin access required." });
    }

    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}
