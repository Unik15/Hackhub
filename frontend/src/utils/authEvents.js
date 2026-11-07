const AUTH_EVENT_KEY = "hackhub-auth-event";
const TAB_ID =
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export function publishAuthEvent(type) {
  try {
    localStorage.setItem(
      AUTH_EVENT_KEY,
      JSON.stringify({ type, sourceId: TAB_ID, at: Date.now() })
    );
  } catch {}
}

export function subscribeToAuthEvents(handler) {
  const onStorage = (event) => {
    if (event.key !== AUTH_EVENT_KEY || !event.newValue) return;

    try {
      const payload = JSON.parse(event.newValue);
      if (payload?.type && payload.sourceId !== TAB_ID) handler(payload);
    } catch {}
  };

  window.addEventListener("storage", onStorage);
  return () => window.removeEventListener("storage", onStorage);
}
