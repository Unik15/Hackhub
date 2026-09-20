import axios from "axios";
import NodeCache from "node-cache";
import crypto from "crypto";

// Cache AI responses for 6 hours per (user profile + hackathon set) signature,
// so identical requests don't re-hit the LLM every page load.
const cache = new NodeCache({ stdTTL: 6 * 60 * 60, checkperiod: 600 });

const OLLAMA_URL = () => `${process.env.OLLAMA_BASE_URL || "http://localhost:11434"}/api/generate`;
const MODEL = () => process.env.OLLAMA_MODEL || "llama3";

function cacheKeyFor(user, hackathons) {
  const sig = JSON.stringify({
    skills: user.profile?.skills || [],
    experience: user.profile?.experience,
    interests: user.profile?.interests || [],
    city: user.profile?.city,
    ids: hackathons.map((h) => h.id).sort(),
  });
  return crypto.createHash("md5").update(sig).digest("hex");
}

function buildPrompt(user, hackathons) {
  const profileSummary = {
    skills: user.profile?.skills || [],
    experience: user.profile?.experience || "beginner",
    interests: user.profile?.interests || [],
    city: user.profile?.city || "unspecified",
    preferredMode: user.profile?.preferredMode || "both",
  };

  const eventList = hackathons.map((h) => ({
    id: h.id,
    title: h.title,
    domain: h.domain,
    tags: h.tags,
    mode: h.mode,
    distanceKm: h.distanceKm ?? null,
    registrationDeadline: h.registrationDeadline,
    prizePool: h.prizePool,
  }));

  return `You are a ranking engine for a hackathon discovery platform. Given a user profile and a list of candidate hackathons, score how well each hackathon matches the user.

Scoring factors (weigh in this priority order):
1. Skill/interest match between user and hackathon domain/tags
2. Distance — prefer events under 500km, or online events
3. Deadline urgency — soon-but-not-impossible deadlines score higher than ones that already passed or are extremely far away
4. Overall event quality signals (prize pool, organizer reputation if inferable)

User profile:
${JSON.stringify(profileSummary, null, 2)}

Candidate hackathons:
${JSON.stringify(eventList, null, 2)}

Respond with ONLY a JSON array, no markdown fences, no commentary, no preamble. Each element must be exactly:
{"id": "<hackathon id>", "title": "<title>", "score": <integer 0-100>, "reason": "<one short sentence>"}

Return the array sorted by score descending.`;
}

function safeParseJsonArray(text) {
  // Strip accidental code fences if the model ignores instructions
  const cleaned = text.replace(/```json|```/g, "").trim();
  const start = cleaned.indexOf("[");
  const end = cleaned.lastIndexOf("]");
  if (start === -1 || end === -1) throw new Error("No JSON array found in model output");
  const jsonSlice = cleaned.slice(start, end + 1);
  const parsed = JSON.parse(jsonSlice);
  if (!Array.isArray(parsed)) throw new Error("Parsed result is not an array");
  return parsed;
}

/**
 * Score/rank hackathons for a user via the local/cloud Ollama model.
 * Falls back to a deterministic heuristic ranking if the LLM call fails,
 * so the product degrades gracefully instead of showing an error screen.
 */
export async function rankHackathonsForUser(user, hackathons) {
  if (!hackathons.length) return [];

  const key = cacheKeyFor(user, hackathons);
  const cached = cache.get(key);
  if (cached) return cached;

  try {
    const prompt = buildPrompt(user, hackathons);
    const { data } = await axios.post(
      OLLAMA_URL(),
      {
        model: MODEL(),
        prompt,
        stream: false,
        format: "json",
        options: { temperature: 0.2 },
      },
      { timeout: 30000 }
    );

    const parsed = safeParseJsonArray(data.response);
    cache.set(key, parsed);
    return parsed;
  } catch (err) {
    console.error("[ai] Ollama scoring failed, falling back to heuristic:", err.message);
    const fallback = heuristicRank(user, hackathons);
    cache.set(key, fallback, 60 * 30); // shorter TTL for degraded results
    return fallback;
  }
}

/**
 * Deterministic backup ranking used when the LLM is unreachable.
 * Keeps the product usable during model outages.
 */
function heuristicRank(user, hackathons) {
  const userSkills = new Set((user.profile?.skills || []).map((s) => s.toLowerCase()));
  const userInterests = new Set((user.profile?.interests || []).map((s) => s.toLowerCase()));

  return hackathons
    .map((h) => {
      const tags = [...(h.domain || []), ...(h.tags || [])].map((t) => t.toLowerCase());
      const matchCount = tags.filter((t) => userSkills.has(t) || userInterests.has(t)).length;

      let score = Math.min(60, matchCount * 20);
      if (h.mode === "online") score += 10;
      if (h.distanceKm != null && h.distanceKm < 500) score += 10;

      const deadline = h.registrationDeadline ? new Date(h.registrationDeadline) : null;
      if (deadline) {
        const daysLeft = (deadline - Date.now()) / (1000 * 60 * 60 * 24);
        if (daysLeft > 0 && daysLeft < 14) score += 15;
        else if (daysLeft <= 0) score -= 40;
      }

      return {
        id: h.id,
        title: h.title,
        score: Math.max(0, Math.min(100, Math.round(score))),
        reason: matchCount
          ? "Matches your listed skills/interests"
          : "General recommendation based on timing and location",
      };
    })
    .sort((a, b) => b.score - a.score);
}
