import {
  getOrCreateCsrfToken,
  InvalidCsrfTokenError,
  verifyCsrfToken,
} from "../security/csrf.js";

const STATE_CHANGING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function csrfProtectionMiddleware(request, response, next) {
  if (request.session) {
    const token = getOrCreateCsrfToken(request.session);
    response.locals.csrfToken = token;
  } else {
    response.locals.csrfToken = "";
  }

  if (STATE_CHANGING_METHODS.has(request.method.toUpperCase())) {
    const providedToken =
      request.body?._csrf ||
      request.body?.csrfToken ||
      request.get("x-csrf-token");

    if (!verifyCsrfToken(request.session, providedToken)) {
      const actorUserId = request.authenticatedUser?.id ?? null;
      const auditRecorder = request.app?.locals?.auditRecorder;
      if (auditRecorder && typeof auditRecorder.record === "function") {
        auditRecorder.record({
          action: "security.csrf_rejected",
          actorUserId,
          entityType: "request",
          entityId: null,
          result: "denied",
          details: {
            method: request.method,
            path: request.path,
          },
        }).catch(() => {});
      }
      next(new InvalidCsrfTokenError());
      return;
    }
    if (request.body && typeof request.body === "object") {
      delete request.body._csrf;
      delete request.body.csrfToken;
    }
  }

  next();
}
