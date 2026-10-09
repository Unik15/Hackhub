import rateLimit from "express-rate-limit";

// General API traffic
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please slow down." },
});

// Auth endpoints — tighter, to blunt credential stuffing / brute force
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many auth attempts, try again later." },
});

// Public submissions are intentionally more restrictive than normal reads to
// limit spam while still allowing legitimate organizers to submit an event.
export const submissionLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many submissions from this network. Please try again later." },
});

// AI recommendation endpoint — expensive (LLM calls), so throttle harder per user
export const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 6,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.userId || req.ip,
  message: { error: "Recommendation requests are limited — please wait a moment." },
});
