export const PASSWORD_POLICY = Object.freeze({
  minimumCodePoints: 12,
  maximumCodePoints: 128,
  maximumBytes: 512,
  minimumCharacterGroups: 3,
});

const CHARACTER_GROUPS = Object.freeze([
  /\p{Ll}/u,
  /\p{Lu}/u,
  /\p{N}/u,
  /[^\p{L}\p{N}]/u,
]);

export function passwordMeetsPolicy(password) {
  if (
    typeof password !== "string" ||
    (typeof password.isWellFormed === "function" && !password.isWellFormed())
  ) {
    return false;
  }

  const codePoints = Array.from(password).length;
  if (
    codePoints < PASSWORD_POLICY.minimumCodePoints ||
    codePoints > PASSWORD_POLICY.maximumCodePoints ||
    Buffer.byteLength(password, "utf8") > PASSWORD_POLICY.maximumBytes
  ) {
    return false;
  }

  return CHARACTER_GROUPS.filter((pattern) => pattern.test(password)).length >=
    PASSWORD_POLICY.minimumCharacterGroups;
}
