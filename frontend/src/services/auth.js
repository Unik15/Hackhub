import { axiosClient } from "./axiosClient";

/**
 * All of these rely on the backend setting/clearing an HTTP-only session
 * cookie — the frontend never touches a token directly. `withCredentials`
 * on axiosClient is what makes that cookie actually get sent.
 */

export async function loginRequest({ email, password }) {
  const { data } = await axiosClient.post("/auth/login", { email, password });
  return data;
}

export async function signupRequest(payload) {
  const { data } = await axiosClient.post("/auth/signup", payload);
  return data;
}

/** GET /auth/me — the source of truth for "is anyone logged in right now". */
export async function getMe() {
  const { data } = await axiosClient.get("/auth/me");
  return data?.user ?? data;
}

export async function logoutRequest() {
  const { data } = await axiosClient.post("/auth/logout");
  return data;
}

/**
 * Google OAuth is a full page redirect, not an axios call — the backend
 * owns the whole OAuth dance (redirect → Google → callback → set cookie →
 * redirect back to the app), so the frontend just needs to send the browser
 * to the right URL.
 */
export function getGoogleAuthUrl() {
  const base = import.meta.env.VITE_API_URL || "http://localhost:4000/api";
  return `${base}/auth/google`;
}
