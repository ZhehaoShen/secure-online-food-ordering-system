import { randomUUID } from "node:crypto";

import { describe, expect, test } from "vitest";

import {
  hashPassword,
  isSupportedPasswordHash,
  verifyPassword,
} from "../../src/security/passwords.js";

const EXISTING_SEED_HASH =
  "scrypt$v1$N=16384,r=8,p=1$d4Jpp3loApQAVVlwYFqHCQ$-SjiSUOeYYW-7fNEMJCzdL-7ZSwycl70PhHA_BdMIBlei0y02sL5XPVwcrxt9xyJgJmEnjuhnKCrThjI0Ct6iw";
const SEED_COMPATIBILITY_PASSWORD = "Fictional-Seed-Compatibility-2026!";
const SEED_COMPATIBILITY_HASH =
  "scrypt$v1$N=16384,r=8,p=1$kGidufkqVjs8ewM5ntCaVg$_PUJyf8TahJ-iU28IDK2hBv3-regvY6_h_ek7tRQSi6cujsL1UyyrLPoQNEUxUnZSeW-w5zjpyTvTneGJCbnkg";

describe("password hashing", () => {
  test("creates unique supported hashes and verifies only the matching value", async () => {
    const password = randomUUID();
    const otherPassword = randomUUID();
    const firstHash = await hashPassword(password);
    const secondHash = await hashPassword(password);

    expect(firstHash).not.toBe(secondHash);
    expect(firstHash).not.toContain(password);
    expect(isSupportedPasswordHash(firstHash)).toBe(true);
    await expect(verifyPassword(password, firstHash)).resolves.toBe(true);
    await expect(verifyPassword(otherPassword, firstHash)).resolves.toBe(false);
  });

  test("recognizes the existing fictional seed format", async () => {
    expect(isSupportedPasswordHash(EXISTING_SEED_HASH)).toBe(true);
    await expect(
      verifyPassword(randomUUID(), EXISTING_SEED_HASH),
    ).resolves.toBe(false);
  });

  test("authenticates a pre-generated seed-compatible hash", async () => {
    expect(isSupportedPasswordHash(SEED_COMPATIBILITY_HASH)).toBe(true);
    await expect(
      verifyPassword(SEED_COMPATIBILITY_PASSWORD, SEED_COMPATIBILITY_HASH),
    ).resolves.toBe(true);
    await expect(
      verifyPassword(randomUUID(), SEED_COMPATIBILITY_HASH),
    ).resolves.toBe(false);
  });

  test.each([
    null,
    "",
    "plaintext",
    "scrypt$v2$N=16384,r=8,p=1$salt$hash",
    "scrypt$v1$N=1,r=1,p=1$salt$hash",
    "scrypt$v1$N=16384,r=8,p=1$not+base64url$invalid",
  ])("rejects unsupported stored values", async (storedValue) => {
    expect(isSupportedPasswordHash(storedValue)).toBe(false);
    await expect(
      verifyPassword(randomUUID(), storedValue),
    ).resolves.toBe(false);
  });
});
