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
      next(new InvalidCsrfTokenError());
      return;
    }
  }

  next();
}
