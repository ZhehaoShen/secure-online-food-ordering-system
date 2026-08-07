import { randomBytes, timingSafeEqual } from "node:crypto";
import { PublicApplicationError } from "../errors.js";

export class InvalidCsrfTokenError extends PublicApplicationError {
  constructor() {
    super({
      name: "InvalidCsrfTokenError",
      code: "CSRF_TOKEN_INVALID",
      message: "Security check failed. The CSRF token was missing or invalid.",
      statusCode: 403,
    });
  }
}

export function generateCsrfToken() {
  return randomBytes(32).toString("hex");
}

export function getOrCreateCsrfToken(session) {
  if (!session) {
    return null;
  }

  if (
    !session.csrfToken ||
    typeof session.csrfToken !== "string" ||
    session.csrfToken.length !== 64
  ) {
    session.csrfToken = generateCsrfToken();
  }

  return session.csrfToken;
}

export function rotateCsrfToken(session) {
  if (session) {
    session.csrfToken = generateCsrfToken();
    return session.csrfToken;
  }

  return null;
}

export function verifyCsrfToken(session, providedToken) {
  if (!session || !session.csrfToken) {
    return false;
  }

  if (typeof providedToken !== "string" || providedToken.length !== 64) {
    return false;
  }

  const sessionBuffer = Buffer.from(session.csrfToken, "utf8");
  const providedBuffer = Buffer.from(providedToken, "utf8");

  if (sessionBuffer.length !== providedBuffer.length) {
    return false;
  }

  return timingSafeEqual(sessionBuffer, providedBuffer);
}
