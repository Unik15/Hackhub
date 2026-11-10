import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import {
  findSubmissionById,
  listSubmissionsForReview,
  markApproved,
  markRejected,
} from "../repositories/submissionRepo.js";
import {
  deleteHackathonById,
  publishManualSubmission,
} from "../repositories/hackathonRepo.js";

const router = Router();

// Every route below is admin-only. requireAuth resolves the session, then
// requireAdmin re-reads the role from the database.
router.use(requireAuth, requireAdmin);

const REVIEW_STATUSES = new Set(["pending", "approved", "rejected"]);
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/admin/submissions?status=pending|approved|rejected|all
 * Defaults to the pending queue.
 */
router.get("/submissions", async (req, res, next) => {
  try {
    const requested = String(req.query.status || "pending").toLowerCase();
    const status = requested === "all" ? null : requested;

    if (status && !REVIEW_STATUSES.has(status)) {
      return res.status(400).json({ error: "Unknown status filter." });
    }

    const items = await listSubmissionsForReview({ status });
    res.json({ items, total: items.length });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/admin/submissions/:id/approve
 *
 * Publishes the submission into the public hackathons table (status derived
 * from its dates) and marks the submission approved. If the submission was
 * already reviewed by someone else, the freshly published listing is removed
 * again so the two tables cannot drift.
 */
router.post("/submissions/:id/approve", async (req, res, next) => {
  let published = null;

  try {
    const { id } = req.params;
    if (!UUID_PATTERN.test(id)) {
      return res.status(400).json({ error: "Invalid submission id." });
    }

    const submission = await findSubmissionById(id);
    if (!submission) {
      return res.status(404).json({ error: "Submission not found." });
    }
    if (submission.status !== "pending") {
      return res.status(409).json({
        error: `This submission was already ${submission.status}.`,
      });
    }

    published = await publishManualSubmission(submission);
    const updated = await markApproved(submission.id, req.user.id, published.hackathon.id);

    if (!updated) {
      // Lost a race with another admin: undo the listing we just created.
      if (published.created) {
        await deleteHackathonById(published.hackathon.id).catch((cleanupError) => {
          console.error("[admin] Failed to remove orphaned listing:", cleanupError.message);
        });
      }
      return res.status(409).json({ error: "This submission was already reviewed." });
    }

    res.json({ item: updated, hackathon: published.hackathon });
  } catch (err) {
    if (published?.created) {
      await deleteHackathonById(published.hackathon.id).catch((cleanupError) => {
        console.error("[admin] Failed to remove orphaned listing:", cleanupError.message);
      });
    }
    next(err);
  }
});

/**
 * POST /api/admin/submissions/:id/reject  { note }
 * A note is mandatory: the organizer sees it on their dashboard, so "rejected"
 * without a reason would be unactionable.
 */
router.post("/submissions/:id/reject", async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!UUID_PATTERN.test(id)) {
      return res.status(400).json({ error: "Invalid submission id." });
    }

    const note = String(req.body?.note || "").trim();
    if (!note) {
      return res.status(400).json({ error: "A rejection note is required." });
    }
    if (note.length > 2000) {
      return res.status(400).json({ error: "Rejection note must be 2000 characters or fewer." });
    }

    const submission = await findSubmissionById(id);
    if (!submission) {
      return res.status(404).json({ error: "Submission not found." });
    }
    if (submission.status !== "pending") {
      return res.status(409).json({
        error: `This submission was already ${submission.status}.`,
      });
    }

    const updated = await markRejected(submission.id, req.user.id, note);
    if (!updated) {
      return res.status(409).json({ error: "This submission was already reviewed." });
    }

    res.json({ item: updated });
  } catch (err) {
    next(err);
  }
});

export default router;
