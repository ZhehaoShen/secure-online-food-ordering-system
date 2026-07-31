import { randomUUID } from "node:crypto";

import { describe, expect, test } from "vitest";

import {
  hashPassword,
  isSupportedPasswordHash,
  verifyPassword,
} from "../../src/security/passwords.js";

const EXISTING_SEED_HASH =
  "scrypt$v1$N=16384,r=8,p=1$d4Jpp3loApQAVVlwYFqHCQ$-SjiSUOeYYW-7fNEMJCzdL-7ZSwycl70PhHA_BdMIBlei0y02sL5XPVwcrxt9xyJgJmEnjuhnKCrThjI0Ct6iw";

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
