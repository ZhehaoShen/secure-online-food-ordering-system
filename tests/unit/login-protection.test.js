import { describe, expect, test } from "vitest";

import {
  createUserService,
  LOGIN_PROTECTION,
} from "../../src/services/user-service.js";

const FICTIONAL_EMAIL = "lockout.user@example.test";
const FICTIONAL_PASSWORD = "Fictional-Seed-Compatibility-2026!";
const FICTIONAL_PASSWORD_HASH =
  "scrypt$v1$N=16384,r=8,p=1$kGidufkqVjs8ewM5ntCaVg$_PUJyf8TahJ-iU28IDK2hBv3-regvY6_h_ek7tRQSi6cujsL1UyyrLPoQNEUxUnZSeW-w5zjpyTvTneGJCbnkg";

function createFixture() {
  let now = new Date("2026-08-03T23:00:00.000Z");
  const auditEvents = [];
  const authenticationState = {
    failedLoginCount: 0,
    lockedUntil: null,
  };
  const calls = {
    failure: 0,
    reset: 0,
  };
  const user = Object.freeze({
    id: "42",
    name: "Lockout Fiction",
    email: FICTIONAL_EMAIL,
    passwordHash: FICTIONAL_PASSWORD_HASH,
    role: "customer",
  });
  const repository = {
    async createCustomer() {
      throw new Error("Registration is outside this fixture.");
    },
    async findActiveByEmail(email) {
      if (email !== FICTIONAL_EMAIL) {
        return null;
      }

      return Object.freeze({
        ...user,
        failedLoginCount: authenticationState.failedLoginCount,
        lockedUntil: authenticationState.lockedUntil,
      });
    },
    async recordAuthenticationFailure({
      attemptedAt,
      threshold,
      lockedUntil,
    }) {
      calls.failure += 1;
      const expired = authenticationState.lockedUntil &&
        authenticationState.lockedUntil <= attemptedAt;
      authenticationState.failedLoginCount = Math.min(
        expired ? 1 : authenticationState.failedLoginCount + 1,
        threshold,
      );
      authenticationState.lockedUntil =
        authenticationState.failedLoginCount >= threshold
          ? lockedUntil
          : null;
    },
    async resetAuthenticationFailures() {
      calls.reset += 1;
      authenticationState.failedLoginCount = 0;
      authenticationState.lockedUntil = null;
    },
  };
  const service = createUserService(repository, {
    auditRecorder: {
      async record(event) {
        auditEvents.push(event);
      },
    },
    clock: () => new Date(now),
  });

  return {
    auditEvents,
    calls,
    service,
    state() {
      return {
        failedLoginCount: authenticationState.failedLoginCount,
        lockedUntil: authenticationState.lockedUntil,
      };
    },
    advance(milliseconds) {
      now = new Date(now.getTime() + milliseconds);
    },
  };
}

describe("bounded login protection", () => {
  test("locks at the threshold, denies correct credentials, then resets after expiry", async () => {
    const fixture = createFixture();

    for (let attempt = 1; attempt < LOGIN_PROTECTION.failureThreshold; attempt += 1) {
      await expect(fixture.service.authenticate({
        email: FICTIONAL_EMAIL,
        password: `Wrong-Fictional-${attempt}!`,
      })).resolves.toBeNull();
    }

    expect(fixture.state()).toEqual({
      failedLoginCount: LOGIN_PROTECTION.failureThreshold - 1,
      lockedUntil: null,
    });

    await expect(fixture.service.authenticate({
      email: FICTIONAL_EMAIL,
      password: "Wrong-Fictional-Threshold!",
    })).resolves.toBeNull();

    const lockedState = fixture.state();
    expect(lockedState.failedLoginCount).toBe(
      LOGIN_PROTECTION.failureThreshold,
    );
    expect(lockedState.lockedUntil).toEqual(
      new Date("2026-08-03T23:05:00.000Z"),
    );

    await expect(fixture.service.authenticate({
      email: FICTIONAL_EMAIL,
      password: FICTIONAL_PASSWORD,
    })).resolves.toBeNull();
    expect(fixture.state()).toEqual(lockedState);

    fixture.advance(LOGIN_PROTECTION.lockoutMilliseconds);
    await expect(fixture.service.authenticate({
      email: FICTIONAL_EMAIL,
      password: FICTIONAL_PASSWORD,
    })).resolves.toEqual({
      id: "42",
      name: "Lockout Fiction",
      email: FICTIONAL_EMAIL,
      role: "customer",
    });
    expect(fixture.state()).toEqual({
      failedLoginCount: 0,
      lockedUntil: null,
    });
    expect(fixture.calls.failure).toBe(LOGIN_PROTECTION.failureThreshold);
    expect(fixture.calls.reset).toBe(1);
  });

  test("an expired lock restarts at one after another failed attempt", async () => {
    const fixture = createFixture();

    for (let attempt = 0; attempt < LOGIN_PROTECTION.failureThreshold; attempt += 1) {
      await fixture.service.authenticate({
        email: FICTIONAL_EMAIL,
        password: `Wrong-Expiry-${attempt}!`,
      });
    }

    fixture.advance(LOGIN_PROTECTION.lockoutMilliseconds);
    await fixture.service.authenticate({
      email: FICTIONAL_EMAIL,
      password: "Wrong-After-Expiry!",
    });

    expect(fixture.state()).toEqual({
      failedLoginCount: 1,
      lockedUntil: null,
    });
  });

  test("unknown accounts create no state and audits contain no credentials", async () => {
    const fixture = createFixture();
    const unknownEmail = "unknown.lockout@example.test";
    const sentinelPassword = "Unknown-Fictional-Secret-2026!";

    for (let attempt = 0; attempt < 12; attempt += 1) {
      await expect(fixture.service.authenticate({
        email: unknownEmail,
        password: sentinelPassword,
      })).resolves.toBeNull();
    }

    expect(fixture.calls).toEqual({ failure: 0, reset: 0 });
    expect(fixture.state()).toEqual({
      failedLoginCount: 0,
      lockedUntil: null,
    });
    expect(fixture.auditEvents).toHaveLength(12);
    expect(fixture.auditEvents.every((event) =>
      event.action === "authentication.login" &&
      event.actorUserId === null &&
      event.result === "failure"
    )).toBe(true);
    const serializedAudits = JSON.stringify(fixture.auditEvents);
    expect(serializedAudits).not.toContain(unknownEmail);
    expect(serializedAudits).not.toContain(sentinelPassword);
    expect(serializedAudits).not.toContain("passwordHash");
  });

  test("publishes fixed bounded protection values", () => {
    expect(LOGIN_PROTECTION).toEqual({
      failureThreshold: 5,
      lockoutMilliseconds: 300_000,
    });
  });
});
