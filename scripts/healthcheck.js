const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = "3000";
const TIMEOUT_MS = 5_000;

function healthUrl() {
  if (process.env.APP_BASE_URL) {
    return new URL("/health", process.env.APP_BASE_URL);
  }

  const configuredHost = process.env.HOST || DEFAULT_HOST;
  const requestHost =
    configuredHost === "0.0.0.0" || configuredHost === "::"
      ? DEFAULT_HOST
      : configuredHost;
  const host = requestHost.includes(":") ? `[${requestHost}]` : requestHost;
  const port = process.env.PORT || DEFAULT_PORT;

  return new URL(`http://${host}:${port}/health`);
}

const response = await fetch(healthUrl(), {
  signal: AbortSignal.timeout(TIMEOUT_MS),
});

if (!response.ok) {
  throw new Error(`Health check failed with HTTP ${response.status}.`);
}

const body = await response.json();

if (
  body.status !== "ok" ||
  body.service !== "secure-online-food-ordering-system"
) {
  throw new Error("Health check returned an unexpected response.");
}

console.log("Health check passed.");
