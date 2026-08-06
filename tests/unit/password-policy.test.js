import { describe, expect, test } from "vitest";

import {
  PASSWORD_POLICY,
  passwordMeetsPolicy,
} from "../../src/security/password-policy.js";

describe("registration password policy", () => {
  test.each([
    "Fictional-Table-2026",
    "fictional passphrase 2026",
    "Àurore-Fiction-42",
  ])("accepts strong Unicode-safe password %s", (password) => {
    expect(passwordMeetsPolicy(password)).toBe(true);
  });

  test.each([
    ["short", "Short-42"],
    ["one group", "abcdefghijkl"],
    ["two groups", "fictional2026"],
    ["over code-point limit", `Aa1-${"x".repeat(125)}`],
    ["over byte limit", `Aa1-${"🙂".repeat(127)}`],
    ["non-string", null],
  ])("rejects %s password", (_description, password) => {
    expect(passwordMeetsPolicy(password)).toBe(false);
  });

  test("publishes bounded policy values", () => {
    expect(PASSWORD_POLICY).toEqual({
      minimumCodePoints: 12,
      maximumCodePoints: 128,
      maximumBytes: 512,
      minimumCharacterGroups: 3,
    });
  });
});
