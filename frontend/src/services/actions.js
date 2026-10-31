import { axiosClient } from "./axiosClient";

/**
 * POST /actions
 * Engagement counter for a listing (view / click / apply). The backend
 * records the action and bumps views_count/apply_count via RPC.
 *
 * We deliberately rescope it fire-and-forget by callers, not here: this
 * function resolves or rejects normally, and tracking is the last thing
 * that should ever break a page.
 */
export async function postAction({ hackathonId, actionType, metadata }) {
  const { data } = await axiosClient.post("/actions", {
    hackathon_id: hackathonId,
    action_type: actionType,
    ...(metadata ? { metadata } : {}),
  });
  return data;
}
