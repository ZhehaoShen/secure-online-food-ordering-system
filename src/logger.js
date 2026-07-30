const SAFE_LOG_FIELDS = new Set([
  "requestId",
  "method",
  "path",
  "statusCode",
  "durationMs",
  "host",
  "port",
  "signal",
  "errorName",
  "errorCode",
]);

function selectSafeFields(fields) {
  const safeFields = {};

  for (const [key, value] of Object.entries(fields)) {
    if (
      SAFE_LOG_FIELDS.has(key) &&
      ["string", "number", "boolean"].includes(typeof value)
    ) {
      safeFields[key] = value;
    }
  }

  return safeFields;
}

export function logEvent(level, event, fields = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...selectSafeFields(fields),
  };

  const output = JSON.stringify(entry);

  if (level === "error") {
    console.error(output);
    return;
  }

  console.log(output);
}
