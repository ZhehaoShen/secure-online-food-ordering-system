export const LOCAL_ONLY_WARNING_TITLE =
  "LOCAL-ONLY INTENTIONALLY VULNERABLE CLASSROOM DEMO";

export const LOCAL_ONLY_WARNING_TEXT =
  "Use only fictional data on this computer. Never deploy this application publicly or connect it to a real or production database.";

export function emitLocalOnlyWarning(writer = console.warn) {
  if (typeof writer !== "function") {
    throw new TypeError("A warning writer is required.");
  }

  writer(`${LOCAL_ONLY_WARNING_TITLE}: ${LOCAL_ONLY_WARNING_TEXT}`);
}
