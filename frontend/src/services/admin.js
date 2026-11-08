import { axiosClient } from "./axiosClient";

/**
 * Admin-only submission review API. Every call relies on the session cookie;
 * the backend rejects non-admins with 403.
 */

/** GET /admin/submissions?status=pending|approved|rejected|all */
export async function fetchAdminSubmissions(status = "pending") {
  const { data } = await axiosClient.get("/admin/submissions", { params: { status } });
  return data?.items ?? [];
}

/** POST /admin/submissions/:id/approve — publishes the listing and marks the submission approved. */
export async function approveSubmission(id) {
  const { data } = await axiosClient.post(`/admin/submissions/${id}/approve`);
  return data;
}

/** POST /admin/submissions/:id/reject — the note is shown to the organizer. */
export async function rejectSubmission(id, note) {
  const { data } = await axiosClient.post(`/admin/submissions/${id}/reject`, { note });
  return data;
}
