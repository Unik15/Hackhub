/**
 * Extracts a user-safe message from any axios/network error.
 * Relies on the friendlyMessage set by the axiosClient response interceptor,
 * but falls back gracefully if a request bypassed that (e.g. non-axios throw).
 */
export function getErrorMessage(err, fallback = "Something went wrong. Please try again.") {
  return err?.friendlyMessage || err?.response?.data?.message || err?.message || fallback;
}

export function isNotFound(err) {
  return err?.response?.status === 404;
}
