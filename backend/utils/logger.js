/**
 * Minimal structured logger. Swap the console.* calls for a real
 * transport (pino, winston, Datadog, etc.) in production without
 * touching any call sites — everything goes through here.
 */
function format(level, scope, message, meta) {
  const base = `[${level}] ${new Date().toISOString()} (${scope}) - ${message}`;
  return meta ? `${base} ${JSON.stringify(meta)}` : base;
}

export function makeLogger(scope) {
  return {
    info: (message, meta) => console.log(format("info", scope, message, meta)),
    warn: (message, meta) => console.warn(format("warn", scope, message, meta)),
    error: (message, meta) => console.error(format("error", scope, message, meta)),
  };
}
