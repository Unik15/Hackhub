import axios from "axios";

export const axiosClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:4000/api",
  headers: { "Content-Type": "application/json" },
  timeout: 10000,
  withCredentials: true, // send/receive the HTTP-only session cookie
});

// Central place to attach auth headers later, e.g.:
// axiosClient.interceptors.request.use((config) => {
//   const token = localStorage.getItem("token");
//   if (token) config.headers.Authorization = `Bearer ${token}`;
//   return config;
// });

// Normalizes every failure into a single `error.friendlyMessage` so every
// page can show a decent error without re-deriving this logic each time.
axiosClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.code === "ECONNABORTED") {
      error.friendlyMessage = "That took too long to respond. Please try again.";
    } else if (!error.response) {
      error.friendlyMessage = "Can't reach the server. Check your connection and try again.";
    } else {
      const status = error.response.status;
      const serverMessage = error.response.data?.message;
      error.friendlyMessage =
        serverMessage ||
        (status === 404
          ? "We couldn't find that."
          : status === 401 || status === 403
          ? "You're not authorized to do that."
          : status >= 500
          ? "Something went wrong on our end. Please try again shortly."
          : "Something went wrong. Please try again.");
    }
    return Promise.reject(error);
  }
);
