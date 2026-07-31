import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, test } from "vitest";

import {
  closeDatabasePool,
  createDatabasePool,
} from "../../src/db/pool.js";
import { startPostgresTestServer } from "../helpers/postgres-test-server.js";

const TEST_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(TEST_DIRECTORY, "../..");
const DATABASE_TASK = resolve(PROJECT_ROOT, "scripts/database-task.js");

function runDatabaseTask(task, { environment, workingDirectory }) {
  const result = spawnSync(process.execPath, [DATABASE_TASK, task], {
    cwd: workingDirectory,
    env: {
      ...process.env,
      ...environment,
      MIGRATION_DATABASE_USER: environment.DATABASE_USER,
      MIGRATION_DATABASE_PASSWORD: randomUUID(),
    },
    encoding: "utf8",
    shell: false,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "Database task failed.");
  }
}

describe.sequential("cross-platform database commands", () => {
  let databaseServer;
  let pool;
  let workingDirectory;

  beforeAll(async () => {
    databaseServer = await startPostgresTestServer();
    workingDirectory = mkdtempSync(
      join(tmpdir(), "food-ordering-command-tests-"),
    );
  }, 60_000);

  afterAll(async () => {
    if (pool) {
      await closeDatabasePool(pool);
    }

    if (databaseServer) {
      await databaseServer.stop();
    }

    if (workingDirectory) {
      rmSync(workingDirectory, { recursive: true, force: true });
    }
  }, 30_000);

  test("applies repeatable business/session schemas and fictional seeds outside the project directory", async () => {
    runDatabaseTask("migrate", {
      environment: databaseServer.environment,
      workingDirectory,
    });
    runDatabaseTask("migrate", {
      environment: databaseServer.environment,
      workingDirectory,
    });
    runDatabaseTask("seed", {
      environment: databaseServer.environment,
      workingDirectory,
    });
    runDatabaseTask("seed", {
      environment: databaseServer.environment,
      workingDirectory,
    });

    pool = createDatabasePool({
      environment: databaseServer.environment,
      logger: () => {},
    });
    const [tableResult, userResult, foodResult] = await Promise.all([
      pool.query(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name IN ('food_items', 'order_items', 'orders', 'session', 'users')
        ORDER BY table_name
      `),
      pool.query("SELECT COUNT(*)::integer AS count FROM users"),
      pool.query("SELECT COUNT(*)::integer AS count FROM food_items"),
    ]);

    expect(tableResult.rows.map((row) => row.table_name)).toEqual([
      "food_items",
      "order_items",
      "orders",
      "session",
      "users",
    ]);
    expect(userResult.rows).toEqual([{ count: 3 }]);
    expect(foodResult.rows).toEqual([{ count: 6 }]);
  });
});
