import { describe, expect, test } from "vitest";

import {
  readSessionConfig,
  SessionConfigurationError,
} from "../../src/config/session.js";

const VALID_SECRET = "fictional-session-secret-value-1234567890";

describe("session configuration", () => {
  test("returns bounded cross-platform defaults", () => {
    expect(
      readSessionConfig({
        SESSION_SECRET: VALID_SECRET,
      }),
    ).toEqual({
      secret: VALID_SECRET,
      cookieName: "food_ordering_sid",
      idleTimeoutMilliseconds: 30 * 60_000,
      secureCookie: false,
    });
  });

  test("accepts explicit supported settings", () => {
    expect(
      readSessionConfig({
        SESSION_SECRET: VALID_SECRET,
        SESSION_COOKIE_NAME: "fictional.sid",
        SESSION_IDLE_TIMEOUT_MINUTES: "45",
        SESSION_SECURE_COOKIE: "true",
      }),
    ).toEqual({
      secret: VALID_SECRET,
      cookieName: "fictional.sid",
      idleTimeoutMilliseconds: 45 * 60_000,
      secureCookie: true,
    });
  });

  test.each([
    {},
    { SESSION_SECRET: "replace_with_local_session_secret" },
    { SESSION_SECRET: "too-short" },
    {
      SESSION_SECRET: VALID_SECRET,
      SESSION_COOKIE_NAME: "invalid cookie name",
    },
    {
      SESSION_SECRET: VALID_SECRET,
      SESSION_IDLE_TIMEOUT_MINUTES: "0",
    },
    {
      SESSION_SECRET: VALID_SECRET,
      SESSION_IDLE_TIMEOUT_MINUTES: "1441",
    },
    {
      SESSION_SECRET: VALID_SECRET,
      SESSION_SECURE_COOKIE: "yes",
    },
  ])("rejects incomplete or invalid settings without exposing values", (input) => {
    expect(() => readSessionConfig(input)).toThrow(SessionConfigurationError);

    try {
      readSessionConfig(input);
    } catch (error) {
      expect(error.message).toBe(
        "Session configuration is incomplete or invalid.",
      );

      if (input.SESSION_SECRET) {
        expect(error.message).not.toContain(input.SESSION_SECRET);
      }
    }
  });
});
