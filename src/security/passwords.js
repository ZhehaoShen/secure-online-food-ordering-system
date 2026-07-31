import {
  randomBytes,
  scrypt,
  timingSafeEqual,
} from "node:crypto";

const FORMAT_PREFIX = "scrypt$v1";
const PARAMETER_SEGMENT = "N=16384,r=8,p=1";
const COST = 16_384;
const BLOCK_SIZE = 8;
const PARALLELIZATION = 1;
const KEY_LENGTH_BYTES = 64;
const SALT_LENGTH_BYTES = 16;
const MAXIMUM_MEMORY_BYTES = 64 * 1024 * 1024;
const MAXIMUM_PASSWORD_BYTES = 4_096;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;

function validPassword(password) {
  return typeof password === "string" &&
    password.length > 0 &&
    Buffer.byteLength(password, "utf8") <= MAXIMUM_PASSWORD_BYTES;
}

function deriveKey(password, salt) {
  return new Promise((resolve, reject) => {
    scrypt(
      password,
      salt,
      KEY_LENGTH_BYTES,
      {
        N: COST,
        r: BLOCK_SIZE,
        p: PARALLELIZATION,
        maxmem: MAXIMUM_MEMORY_BYTES,
      },
      (error, derivedKey) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(derivedKey);
      },
    );
  });
}

function decodeBase64Url(value, expectedLength) {
  if (
    typeof value !== "string" ||
    !BASE64URL_PATTERN.test(value)
  ) {
    return null;
  }

  const decoded = Buffer.from(value, "base64url");

  if (
    decoded.length !== expectedLength ||
    decoded.toString("base64url") !== value
  ) {
    return null;
  }

  return decoded;
}

function parsePasswordHash(encodedHash) {
  if (typeof encodedHash !== "string") {
    return null;
  }

  const [
    algorithm,
    version,
    parameters,
    encodedSalt,
    encodedDerivedKey,
    ...remaining
  ] = encodedHash.split("$");

  if (
    remaining.length > 0 ||
    `${algorithm}$${version}` !== FORMAT_PREFIX ||
    parameters !== PARAMETER_SEGMENT
  ) {
    return null;
  }

  const salt = decodeBase64Url(encodedSalt, SALT_LENGTH_BYTES);
  const derivedKey = decodeBase64Url(
    encodedDerivedKey,
    KEY_LENGTH_BYTES,
  );

  if (!salt || !derivedKey) {
    return null;
  }

  return Object.freeze({
    salt,
    derivedKey,
  });
}

export function isSupportedPasswordHash(encodedHash) {
  return parsePasswordHash(encodedHash) !== null;
}

export async function hashPassword(password) {
  if (!validPassword(password)) {
    throw new TypeError("A valid password value is required.");
  }

  const salt = randomBytes(SALT_LENGTH_BYTES);
  const derivedKey = await deriveKey(password, salt);

  return [
    FORMAT_PREFIX,
    PARAMETER_SEGMENT,
    salt.toString("base64url"),
    derivedKey.toString("base64url"),
  ].join("$");
}

export async function verifyPassword(password, encodedHash) {
  if (!validPassword(password)) {
    return false;
  }

  const parsedHash = parsePasswordHash(encodedHash);

  if (!parsedHash) {
    return false;
  }

  const candidate = await deriveKey(password, parsedHash.salt);
  return timingSafeEqual(candidate, parsedHash.derivedKey);
}
