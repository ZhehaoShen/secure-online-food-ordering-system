import { describe, expect, test, vi } from "vitest";
import {
  csrfProtectionMiddleware,
} from "../../src/middleware/csrf.js";
import {
  generateCsrfToken,
  getOrCreateCsrfToken,
  InvalidCsrfTokenError,
  rotateCsrfToken,
  verifyCsrfToken,
} from "../../src/security/csrf.js";

describe("CSRF protection security unit tests", () => {
  test("generates a 64-character hex cryptographically secure token", () => {
    const token1 = generateCsrfToken();
    const token2 = generateCsrfToken();

    expect(token1).toMatch(/^[a-f0-9]{64}$/);
    expect(token2).toMatch(/^[a-f0-9]{64}$/);
    expect(token1).not.toBe(token2);
  });

  test("getOrCreateCsrfToken creates token if absent and reuses existing token", () => {
    const session = {};
    const token = getOrCreateCsrfToken(session);

    expect(token).toMatch(/^[a-f0-9]{64}$/);
    expect(session.csrfToken).toBe(token);

    const reobtained = getOrCreateCsrfToken(session);
    expect(reobtained).toBe(token);
  });

  test("rotateCsrfToken generates a fresh token", () => {
    const session = {};
    const oldToken = getOrCreateCsrfToken(session);
    const newToken = rotateCsrfToken(session);

    expect(newToken).toMatch(/^[a-f0-9]{64}$/);
    expect(newToken).not.toBe(oldToken);
    expect(session.csrfToken).toBe(newToken);
  });

  test("verifyCsrfToken validates matching tokens and rejects missing or malformed tokens", () => {
    const session = {};
    const token = getOrCreateCsrfToken(session);

    expect(verifyCsrfToken(session, token)).toBe(true);
    expect(verifyCsrfToken(session, "wrong-token")).toBe(false);
    expect(verifyCsrfToken(session, null)).toBe(false);
    expect(verifyCsrfToken(session, undefined)).toBe(false);
    expect(verifyCsrfToken({}, token)).toBe(false);
    expect(verifyCsrfToken(null, token)).toBe(false);
    expect(verifyCsrfToken(session, "a".repeat(64))).toBe(false);
  });

  test("csrfProtectionMiddleware exposes csrfToken on GET requests", () => {
    const session = {};
    const request = { method: "GET", session };
    const response = { locals: {} };
    const next = vi.fn();

    csrfProtectionMiddleware(request, response, next);

    expect(next).toHaveBeenCalledWith();
    expect(response.locals.csrfToken).toMatch(/^[a-f0-9]{64}$/);
  });

  test("csrfProtectionMiddleware rejects POST requests without valid CSRF token", () => {
    const session = {};
    getOrCreateCsrfToken(session);
    const request = { method: "POST", session, body: {}, get: () => null };
    const response = { locals: {} };
    const next = vi.fn();

    csrfProtectionMiddleware(request, response, next);

    expect(next).toHaveBeenCalledWith(expect.any(InvalidCsrfTokenError));
    const error = next.mock.calls[0][0];
    expect(error.statusCode).toBe(403);
    expect(error.publicCode).toBe("CSRF_TOKEN_INVALID");
    expect(error.message).toContain("CSRF token was missing or invalid");
  });

  test("csrfProtectionMiddleware accepts POST requests with valid body _csrf token", () => {
    const session = {};
    const token = getOrCreateCsrfToken(session);
    const request = {
      method: "POST",
      session,
      body: { _csrf: token },
      get: () => null,
    };
    const response = { locals: {} };
    const next = vi.fn();

    csrfProtectionMiddleware(request, response, next);

    expect(next).toHaveBeenCalledWith();
  });
});
