import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, test } from "vitest";

import {
  closeDatabasePool,
  createDatabasePool,
} from "../../src/db/pool.js";
import {
  closeSessionStore,
  createSessionStore,
} from "../../src/session/store.js";
import { startPostgresTestServer } from "../helpers/postgres-test-server.js";

const TEST_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(TEST_DIRECTORY, "../..");
const SESSION_SCHEMA_FILE = resolve(PROJECT_ROOT, "db/session-schema.sql");

function storeOperation(store, method, ...argumentsList) {
  return new Promise((resolveOperation, rejectOperation) => {
    store[method](...argumentsList, (error, value) => {
      if (error) {
        rejectOperation(error);
        return;
      }

      resolveOperation(value);
    });
  });
}

describe.sequential("PostgreSQL session foundation", () => {
  let databaseServer;
  let pool;
  let store;

  beforeAll(async () => {
    databaseServer = await startPostgresTestServer();
    databaseServer.applySqlFile(SESSION_SCHEMA_FILE);
    pool = createDatabasePool({
      environment: databaseServer.environment,
      logger: () => {},
    });
    store = createSessionStore({
      pool,
      idleTimeoutMilliseconds: 30 * 60_000,
      logger: () => {},
      pruneSessionInterval: false,
    });
  }, 60_000);

  afterAll(async () => {
    await closeSessionStore(store);

    if (pool) {
      await closeDatabasePool(pool);
    }

    if (databaseServer) {
      await databaseServer.stop();
    }
  }, 30_000);

  test("creates the compatible session table and can apply it repeatedly", async () => {
    databaseServer.applySqlFile(SESSION_SCHEMA_FILE);

    const [columnsResult, constraintResult, indexResult] = await Promise.all([
      pool.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'session'
        ORDER BY ordinal_position
      `),
      pool.query(`
        SELECT constraint_name
        FROM information_schema.table_constraints
        WHERE table_schema = 'public'
          AND table_name = 'session'
          AND constraint_type = 'PRIMARY KEY'
      `),
      pool.query(`
        SELECT indexname
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND tablename = 'session'
          AND indexname = 'IDX_session_expire'
      `),
    ]);

    expect(columnsResult.rows).toEqual([
      {
        column_name: "sid",
        data_type: "character varying",
        is_nullable: "NO",
      },
      {
        column_name: "sess",
        data_type: "json",
        is_nullable: "NO",
      },
      {
        column_name: "expire",
        data_type: "timestamp without time zone",
        is_nullable: "NO",
      },
    ]);
    expect(constraintResult.rows).toEqual([
      { constraint_name: "session_pkey" },
    ]);
    expect(indexResult.rows).toEqual([
      { indexname: "IDX_session_expire" },
    ]);
  });

  test("stores, retrieves, and destroys a fictional session", async () => {
    const sessionId = "fictional-session-id";
    const sessionValue = {
      cookie: {
        expires: new Date(Date.now() + 30 * 60_000).toISOString(),
      },
      user: {
        id: "1001",
        role: "customer",
      },
    };

    await storeOperation(store, "set", sessionId, sessionValue);
    await expect(storeOperation(store, "get", sessionId)).resolves.toEqual(
      sessionValue,
    );

    await storeOperation(store, "destroy", sessionId);
    await expect(
      storeOperation(store, "get", sessionId),
    ).resolves.toBeUndefined();
  });
});
