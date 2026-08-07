const SENSITIVE_KEY_PATTERN =
  /pass|pwd|token|csrf|session|cookie|secret|auth|key|connection/i;

function sanitizeValue(key, value) {
  if (SENSITIVE_KEY_PATTERN.test(key)) {
    return "[REDACTED]";
  }

  if (value && typeof value === "object" && !Array.isArray(value)) {
    return sanitizeObject(value);
  }

  return value;
}

function sanitizeObject(obj) {
  if (!obj || typeof obj !== "object") {
    return {};
  }

  const sanitized = {};
  for (const [key, value] of Object.entries(obj)) {
    sanitized[key] = sanitizeValue(key, value);
  }

  return sanitized;
}

export function createPersistentAuditRecorder(auditRepository) {
  if (!auditRepository || typeof auditRepository.record !== "function") {
    throw new TypeError("An audit repository is required.");
  }

  return Object.freeze({
    async record(event = {}) {
      const {
        action,
        actorUserId = null,
        entityType = "system",
        entityId = null,
        result = "success",
        details = {},
      } = event;

      const safeDetails = sanitizeObject(details);

      try {
        await auditRepository.record({
          actorUserId,
          action,
          entityType,
          entityId,
          result,
          details: safeDetails,
        });
      } catch (error) {
        // Fallback: log error to system logger without throwing to preserve main application flow
        console.error("Audit log persistence error:", error.message);
      }
    },
  });
}
