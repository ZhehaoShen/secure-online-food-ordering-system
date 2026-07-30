import pg from "pg";

import { readDatabaseConfig } from "../config/database.js";
import { PublicApplicationError } from "../errors.js";
import { logEvent } from "../logger.js";

const { Pool } = pg;

const CONNECTION_TIMEOUT_MS = 5_000;
const IDLE_TIMEOUT_MS = 10_000;
const MAXIMUM_POOL_SIZE = 10;

function safeDatabaseCode(error) {
  return typeof error?.code === "string" &&
    /^[A-Z0-9_]{2,32}$/.test(error.code)
    ? error.code
    : "DATABASE_ERROR";
}

export class DatabaseUnavailableError extends PublicApplicationError {
  constructor(cause) {
    super({
      name: "DatabaseUnavailableError",
      code: "DATABASE_UNAVAILABLE",
      message: "The data service is temporarily unavailable.",
      statusCode: 503,
      cause,
    });
  }
}

export function createDatabasePool({
  environment = process.env,
  logger = logEvent,
} = {}) {
  const config = readDatabaseConfig(environment);
  const pool = new Pool({
    ...config,
    application_name: "secure-online-food-ordering-system",
    connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
    idleTimeoutMillis: IDLE_TIMEOUT_MS,
    max: MAXIMUM_POOL_SIZE,
    allowExitOnIdle: true,
  });

  pool.on("error", (error) => {
    logger("error", "database_pool_error", {
      errorName: "DatabaseError",
      errorCode: safeDatabaseCode(error),
    });
  });

  return pool;
}

export async function checkDatabaseConnection(pool) {
  try {
    const result = await pool.query({
      name: "application-database-health",
      text: "SELECT 1 AS connected",
    });

    return result.rows[0]?.connected === 1;
  } catch (error) {
    throw new DatabaseUnavailableError(error);
  }
}

export async function closeDatabasePool(pool) {
  await pool.end();
}
