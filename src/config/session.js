const DEFAULT_COOKIE_NAME = "food_ordering_sid";
const DEFAULT_IDLE_TIMEOUT_MINUTES = 30;
const MINIMUM_SECRET_LENGTH = 32;
const MAXIMUM_SECRET_LENGTH = 1024;
const MAXIMUM_IDLE_TIMEOUT_MINUTES = 24 * 60;

export class SessionConfigurationError extends Error {
  constructor(message = "Session configuration is incomplete or invalid.") {
    super(message);
    this.name = "SessionConfigurationError";
    this.code = "SESSION_CONFIGURATION_ERROR";
  }
}

function sessionSecret(environment) {
  const value = environment.SESSION_SECRET;

  if (
    typeof value !== "string" ||
    value.startsWith("replace_with_") ||
    value.length < MINIMUM_SECRET_LENGTH ||
    value.length > MAXIMUM_SECRET_LENGTH
  ) {
    throw new SessionConfigurationError();
  }

  return value;
}

function cookieName(environment) {
  const value = environment.SESSION_COOKIE_NAME || DEFAULT_COOKIE_NAME;

  if (
    typeof value !== "string" ||
    !/^[A-Za-z0-9._-]{1,64}$/.test(value)
  ) {
    throw new SessionConfigurationError();
  }

  return value;
}

function idleTimeoutMilliseconds(environment) {
  const value =
    environment.SESSION_IDLE_TIMEOUT_MINUTES ??
    String(DEFAULT_IDLE_TIMEOUT_MINUTES);

  if (typeof value !== "string" || !/^[0-9]{1,4}$/.test(value)) {
    throw new SessionConfigurationError();
  }

  const minutes = Number.parseInt(value, 10);

  if (minutes < 1 || minutes > MAXIMUM_IDLE_TIMEOUT_MINUTES) {
    throw new SessionConfigurationError();
  }

  return minutes * 60_000;
}

function secureCookie(environment) {
  const value = environment.SESSION_SECURE_COOKIE ?? "false";

  if (value === "false") {
    return false;
  }

  if (value === "true") {
    return true;
  }

  throw new SessionConfigurationError();
}

export function readSessionConfig(environment = process.env) {
  return Object.freeze({
    secret: sessionSecret(environment),
    cookieName: cookieName(environment),
    idleTimeoutMilliseconds: idleTimeoutMilliseconds(environment),
    secureCookie: secureCookie(environment),
  });
}
