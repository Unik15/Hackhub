import { findById } from "../repositories/userRepo.js";

export async function requireVerifiedEmail(req, res, next) {
  try {
    const user = await findById(req.userId);
    if (!user) {
      return res.status(401).json({ error: "Session is no longer valid" });
    }

    if (!user.emailVerified) {
      return res.status(403).json({
        code: "EMAIL_NOT_VERIFIED",
        error: "Verify your email before submitting a hackathon.",
      });
    }

    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}
