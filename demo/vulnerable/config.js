const REQUIRED_MODE = "local-classroom-only";
const REQUIRED_DATA_CLASSIFICATION = "fictional-only";
const REQUIRED_DATABASE_MARKER = "isolated-vulnerable-demo";
const REQUIRED_LOOPBACK_HOST = "127.0.0.1";
const REQUIRED_DATABASE_NAME = "food_ordering_vulnerable_demo";
const REQUIRED_DATABASE_USER = "food_ordering_vulnerable_demo";
const DEFAULT_PORT = 3100;
const DEFAULT_DATABASE_PORT = 5432;

const NORMAL_RUNTIME_KEYS = Object.freeze([
  "HOST",
  "PORT",
  "DATABASE_URL",
  "DATABASE_HOST",
  "DATABASE_PORT",
  "DATABASE_NAME",
  "DATABASE_USER",
  "DATABASE_PASSWORD",
  "DATABASE_SSL",
  "SESSION_SECRET",
  "SESSION_COOKIE_NAME",
  "SESSION_IDLE_TIMEOUT_MINUTES",
  "SESSION_SECURE_COOKIE",
]);

export class VulnerableDemoConfigurationError extends Error {
  constructor() {
    super("The isolated vulnerable demo configuration is invalid.");
    this.name = "VulnerableDemoConfigurationError";
    this.code = "VULNERABLE_DEMO_CONFIGURATION_ERROR";
  }
}

function fail() {
  throw new VulnerableDemoConfigurationError();
}

function hasValue(environment, key) {
  return environment[key] !== undefined && environment[key] !== "";
}

function requiredValue(environment, key, maximumLength = 1024) {
  const value = environment[key];

  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > maximumLength ||
    value !== value.trim() ||
    value.startsWith("replace_with_")
  ) {
    fail();
  }

  return value;
}

function exactValue(environment, key, expected) {
  if (environment[key] !== expected) {
    fail();
  }

  return expected;
}

function portValue(environment, key, fallback) {
  const rawValue = environment[key] ?? String(fallback);

  if (typeof rawValue !== "string" || !/^[0-9]{1,5}$/.test(rawValue)) {
    fail();
  }

  const port = Number.parseInt(rawValue, 10);

  if (port < 1 || port > 65_535) {
    fail();
  }

  return port;
}

function rejectNormalOrProductionConfiguration(environment) {
  if (
    environment.NODE_ENV === "production" ||
    NORMAL_RUNTIME_KEYS.some((key) => hasValue(environment, key))
  ) {
    fail();
  }
}

export function readVulnerableDemoConfig(environment = process.env) {
  rejectNormalOrProductionConfiguration(environment);

  exactValue(environment, "VULNERABLE_DEMO_MODE", REQUIRED_MODE);
  exactValue(
    environment,
    "VULNERABLE_DEMO_DATA_CLASSIFICATION",
    REQUIRED_DATA_CLASSIFICATION,
  );
  exactValue(
    environment,
    "VULNERABLE_DEMO_DATABASE_MARKER",
    REQUIRED_DATABASE_MARKER,
  );
  const host = exactValue(
    environment,
    "VULNERABLE_DEMO_HOST",
    REQUIRED_LOOPBACK_HOST,
  );
  const databaseHost = exactValue(
    environment,
    "VULNERABLE_DEMO_DATABASE_HOST",
    REQUIRED_LOOPBACK_HOST,
  );
  const database = exactValue(
    environment,
    "VULNERABLE_DEMO_DATABASE_NAME",
    REQUIRED_DATABASE_NAME,
  );
  const user = exactValue(
    environment,
    "VULNERABLE_DEMO_DATABASE_USER",
    REQUIRED_DATABASE_USER,
  );
  const password = requiredValue(
    environment,
    "VULNERABLE_DEMO_DATABASE_PASSWORD",
  );

  return Object.freeze({
    mode: REQUIRED_MODE,
    dataClassification: REQUIRED_DATA_CLASSIFICATION,
    databaseMarker: REQUIRED_DATABASE_MARKER,
    host,
    port: portValue(environment, "VULNERABLE_DEMO_PORT", DEFAULT_PORT),
    database: Object.freeze({
      host: databaseHost,
      port: portValue(
        environment,
        "VULNERABLE_DEMO_DATABASE_PORT",
        DEFAULT_DATABASE_PORT,
      ),
      database,
      user,
      password,
    }),
  });
}
