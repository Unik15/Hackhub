export const trackEvent = (event_type, page, metadata = {}) => {
  const token = localStorage.getItem("token");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);

  // 🧠 metadata safety
  const safeMetadata =
    metadata && typeof metadata === "object" ? metadata : {};

  fetch(`${import.meta.env.VITE_API_URL}/api/track`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token && {
        Authorization: `Bearer ${token}`
      })
    },
    body: JSON.stringify({
      event_type,
      page,
      metadata: safeMetadata
    }),
    signal: controller.signal
  })
    .then((res) => {
      clearTimeout(timeout);

      if (!res.ok) {
        console.warn("Analytics failed:", res.status);
      }
    })
    .catch((err) => {
      if (err.name === "AbortError") {
        console.warn("Analytics timeout");
      } else {
        console.warn("Analytics failed silently");
      }
    });
};