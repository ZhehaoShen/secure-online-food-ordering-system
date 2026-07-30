const DEFAULT_DATABASE_HOST = "127.0.0.1";
const DEFAULT_DATABASE_PORT = 5432;
const DEFAULT_DATABASE_NAME = "food_ordering_dev";

export class DatabaseConfigurationError extends Error {
  constructor(message = "Database configuration is incomplete or invalid.") {
    super(message);
    this.name = "DatabaseConfigurationError";
    this.code = "DATABASE_CONFIGURATION_ERROR";
  }
}

function requiredValue(environment, name) {
  const value = environment[name];

  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.startsWith("replace_with_")
  ) {
    throw new DatabaseConfigurationError();
  }

  return value;
}

function optionalValue(environment, name, fallback) {
  const value = environment[name];

  if (value === undefined || value === "") {
    return fallback;
  }

  if (typeof value !== "string" || value !== value.trim()) {
    throw new DatabaseConfigurationError();
  }

  return value;
}

function databasePort(environment) {
  const value = optionalValue(
    environment,
    "DATABASE_PORT",
    String(DEFAULT_DATABASE_PORT),
  );

  if (!/^[0-9]{1,5}$/.test(value)) {
    throw new DatabaseConfigurationError();
  }

  const port = Number.parseInt(value, 10);

  if (port < 1 || port > 65_535) {
    throw new DatabaseConfigurationError();
  }

  return port;
}

function databaseSsl(environment) {
  const value = optionalValue(environment, "DATABASE_SSL", "false");

  if (value === "false") {
    return false;
  }

  if (value === "true") {
    return { rejectUnauthorized: true };
  }

  throw new DatabaseConfigurationError();
}

export function readDatabaseConfig(environment = process.env) {
  const host = optionalValue(
    environment,
    "DATABASE_HOST",
    DEFAULT_DATABASE_HOST,
  );
  const database = optionalValue(
    environment,
    "DATABASE_NAME",
    DEFAULT_DATABASE_NAME,
  );
  const user = requiredValue(environment, "DATABASE_USER");
  const password = requiredValue(environment, "DATABASE_PASSWORD");

  if (
    host.length > 255 ||
    database.length > 63 ||
    user.length > 63 ||
    password.length > 1024
  ) {
    throw new DatabaseConfigurationError();
  }

  return Object.freeze({
    host,
    port: databasePort(environment),
    database,
    user,
    password,
    ssl: databaseSsl(environment),
  });
}
