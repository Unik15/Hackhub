export const PENDING_VERIFICATION_EMAIL_KEY = "hackhub_pending_verification_email";

export function rememberPendingEmail(email) {
  if (!email) return;
  try {
    sessionStorage.setItem(PENDING_VERIFICATION_EMAIL_KEY, email);
  } catch {
    return;
  }
}

export function readPendingEmail() {
  try {
    return sessionStorage.getItem(PENDING_VERIFICATION_EMAIL_KEY) || "";
  } catch {
    return "";
  }
}

export function clearPendingEmail() {
  try {
    sessionStorage.removeItem(PENDING_VERIFICATION_EMAIL_KEY);
  } catch {
    return;
  }
}
