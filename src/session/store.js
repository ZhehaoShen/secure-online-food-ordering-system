import connectPgSimple from "connect-pg-simple";
import session from "express-session";

import { logEvent } from "../logger.js";

const PostgreSqlSessionStore = connectPgSimple(session);
const SESSION_TABLE_NAME = "session";

export function createSessionStore({
  pool,
  idleTimeoutMilliseconds,
  logger = logEvent,
  pruneSessionInterval,
} = {}) {
  if (!pool || typeof pool.query !== "function") {
    throw new TypeError("A PostgreSQL pool is required for the session store.");
  }

  if (
    !Number.isSafeInteger(idleTimeoutMilliseconds) ||
    idleTimeoutMilliseconds < 1_000
  ) {
    throw new TypeError("A valid session idle timeout is required.");
  }

  return new PostgreSqlSessionStore({
    pool,
    tableName: SESSION_TABLE_NAME,
    createTableIfMissing: false,
    ttl: Math.ceil(idleTimeoutMilliseconds / 1_000),
    pruneSessionInterval,
    errorLog: () => {
      logger("error", "session_store_error", {
        errorName: "SessionStoreError",
        errorCode: "SESSION_STORE_ERROR",
      });
    },
  });
}

export async function closeSessionStore(store) {
  if (store && typeof store.close === "function") {
    await store.close();
  }
}
