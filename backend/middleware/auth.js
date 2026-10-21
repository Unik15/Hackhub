import jwt from "jsonwebtoken";

export const SESSION_COOKIE_NAME = "hackhub_session";

function readCookie(cookieHeader, name) {
  if (!cookieHeader) return null;

  const prefix = `${name}=`;
  const entry = cookieHeader.split(";").map((value) => value.trim()).find((value) => value.startsWith(prefix));
  if (!entry) return null;

  try {
    return decodeURIComponent(entry.slice(prefix.length));
  } catch {
    return null;
  }
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: Number(process.env.JWT_COOKIE_MAX_AGE_MS || 7 * 24 * 60 * 60 * 1000),
    path: "/",
  };
}

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const bearerToken = header.startsWith("Bearer ") ? header.slice(7) : null;
  const token = bearerToken || readCookie(req.headers.cookie, SESSION_COOKIE_NAME);

  if (!token) {
    return res.status(401).json({ error: "Authentication is required" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.sub;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

export function signToken(userId) {
  return jwt.sign({ sub: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });
}
