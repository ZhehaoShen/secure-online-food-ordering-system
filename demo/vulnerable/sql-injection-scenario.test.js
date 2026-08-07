import { spawnSync } from "node:child_process";
import { once } from "node:events";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

import pg from "pg";
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  test,
} from "vitest";

import { startPostgresTestServer } from "../../tests/helpers/postgres-test-server.js";
import {
  APPROVED_SQL_INJECTION_PAYLOAD,
  createVulnerableDemoApplication,
  SQL_INJECTION_CONTROL_TERM,
} from "./app.js";
import { resetVulnerableDemo } from "./reset.js";
import { LOCAL_ONLY_WARNING_TITLE } from "./safety.js";

const DEMO_HOST = "127.0.0.1";
const DEMO_DATABASE = "food_ordering_vulnerable_demo";
const DEMO_USER = "food_ordering_vulnerable_demo";
const DEMO_PASSWORD = "fictional-sql-scenario-password";

function executable(name) {
  return process.platform === "win32" ? `${name}.exe` : name;
}

function runPostgresCommand(environment, name, argumentsList) {
  const command = join(environment.POSTGRES_BIN, executable(name));

  if (!existsSync(command)) {
    throw new Error(`PostgreSQL command not found: ${name}`);
  }

  const result = spawnSync(command, argumentsList, {
    encoding: "utf8",
    shell: false,
    windowsHide: true,
  });

  if (result.error || result.status !== 0) {
    throw result.error ?? new Error(`${name} failed: ${result.stderr}`);
  }
}

function databaseArguments(environment, database, user) {
  return [
    "--host",
    environment.DATABASE_HOST,
    "--port",
    environment.DATABASE_PORT,
    "--username",
    user,
    "--dbname",
    database,
  ];
}

function poolConfig(environment, database, user) {
  return {
    host: environment.DATABASE_HOST,
    port: Number(environment.DATABASE_PORT),
    database,
    user,
    password: DEMO_PASSWORD,
    ssl: false,
    allowExitOnIdle: true,
  };
}

function demoEnvironment(environment) {
  return Object.freeze({
    VULNERABLE_DEMO_MODE: "local-classroom-only",
    VULNERABLE_DEMO_DATA_CLASSIFICATION: "fictional-only",
    VULNERABLE_DEMO_DATABASE_MARKER: "isolated-vulnerable-demo",
    VULNERABLE_DEMO_HOST: DEMO_HOST,
    VULNERABLE_DEMO_PORT: "3100",
    VULNERABLE_DEMO_DATABASE_HOST: environment.DATABASE_HOST,
    VULNERABLE_DEMO_DATABASE_PORT: environment.DATABASE_PORT,
    VULNERABLE_DEMO_DATABASE_NAME: DEMO_DATABASE,
    VULNERABLE_DEMO_DATABASE_USER: DEMO_USER,
    VULNERABLE_DEMO_DATABASE_PASSWORD: DEMO_PASSWORD,
  });
}

async function listen(app) {
  const server = app.listen(0, DEMO_HOST);
  await once(server, "listening");
  const address = server.address();

  return Object.freeze({
    origin: `http://${DEMO_HOST}:${address.port}`,
    server,
  });
}

async function closeServer(server) {
  if (!server) {
    return;
  }

  await new Promise((resolveClose, rejectClose) => {
    server.close((error) => {
      if (error) {
        rejectClose(error);
        return;
      }

      resolveClose();
    });
  });
}

describe.sequential("isolated vulnerable SQL injection scenario", () => {
  let testDatabase;
  let demoPool;
  let ordinaryPool;
  let demoHttp;
  let wrongTargetHttp;
  let environment;

  beforeAll(async () => {
    testDatabase = await startPostgresTestServer();
    const owner = testDatabase.environment;

    runPostgresCommand(owner, "psql", [
      ...databaseArguments(owner, owner.DATABASE_NAME, owner.DATABASE_USER),
      "--set",
      "ON_ERROR_STOP=1",
      "--command",
      `CREATE ROLE ${DEMO_USER} LOGIN`,
    ]);
    runPostgresCommand(owner, "createdb", [
      "--host",
      owner.DATABASE_HOST,
      "--port",
      owner.DATABASE_PORT,
      "--username",
      owner.DATABASE_USER,
      "--owner",
      DEMO_USER,
      DEMO_DATABASE,
    ]);

    for (const file of ["schema.sql", "seed.sql"]) {
      runPostgresCommand(owner, "psql", [
        ...databaseArguments(owner, DEMO_DATABASE, DEMO_USER),
        "--set",
        "ON_ERROR_STOP=1",
        "--file",
        resolve("demo", "vulnerable", file),
      ]);
    }

    environment = demoEnvironment(owner);
    demoPool = new pg.Pool(poolConfig(owner, DEMO_DATABASE, DEMO_USER));
    ordinaryPool = new pg.Pool(poolConfig(
      owner,
      owner.DATABASE_NAME,
      owner.DATABASE_USER,
    ));
    const config = {
      mode: "local-classroom-only",
      dataClassification: "fictional-only",
      databaseMarker: "isolated-vulnerable-demo",
      database: {
        database: DEMO_DATABASE,
        user: DEMO_USER,
      },
    };

    demoHttp = await listen(createVulnerableDemoApplication({
      pool: demoPool,
      config,
    }));
    wrongTargetHttp = await listen(createVulnerableDemoApplication({
      pool: ordinaryPool,
      config,
    }));
  }, 30_000);

  afterAll(async () => {
    await closeServer(wrongTargetHttp?.server);
    await closeServer(demoHttp?.server);
    await ordinaryPool?.end();
    await demoPool?.end();
    await testDatabase?.stop();
  });

  test("the approved payload expands one fictional result to all three", async () => {
    const controlUrl = new URL("/scenarios/sql-injection", demoHttp.origin);
    controlUrl.searchParams.set("q", SQL_INJECTION_CONTROL_TERM);
    const injectionUrl = new URL("/scenarios/sql-injection", demoHttp.origin);
    injectionUrl.searchParams.set("q", APPROVED_SQL_INJECTION_PAYLOAD);

    const controlResponse = await fetch(controlUrl);
    const injectionResponse = await fetch(injectionUrl);
    const controlHtml = await controlResponse.text();
    const injectionHtml = await injectionResponse.text();

    expect(controlResponse.status).toBe(200);
    expect(injectionResponse.status).toBe(200);
    expect(controlHtml).toContain("1 fictional item returned");
    expect(injectionHtml).toContain("3 fictional items returned");
    expect(injectionHtml).toContain(LOCAL_ONLY_WARNING_TITLE);
    expect(injectionHtml).not.toContain(DEMO_PASSWORD);
    expect(injectionHtml).not.toContain("postgresql://");

    const count = await demoPool.query(
      "SELECT count(*)::integer AS count FROM vulnerable_demo_foods",
    );
    expect(count.rows[0].count).toBe(3);
  });

  test("unapproved and destructive inputs are rejected before SQL execution", async () => {
    const rejectedUrl = new URL("/scenarios/sql-injection", demoHttp.origin);
    rejectedUrl.searchParams.set("q", "'; DROP TABLE vulnerable_demo_foods; --");
    const response = await fetch(rejectedUrl);
    const html = await response.text();

    expect(response.status).toBe(422);
    expect(html).toContain("Only the documented control term");
    expect(html).toContain(LOCAL_ONLY_WARNING_TITLE);

    const count = await demoPool.query(
      "SELECT count(*)::integer AS count FROM vulnerable_demo_foods",
    );
    expect(count.rows[0].count).toBe(3);
  });

  test("the scenario refuses a non-demo database and user", async () => {
    const url = new URL("/scenarios/sql-injection", wrongTargetHttp.origin);
    url.searchParams.set("q", APPROVED_SQL_INJECTION_PAYLOAD);
    const response = await fetch(url);
    const html = await response.text();

    expect(response.status).toBe(503);
    expect(html).toContain("The isolated SQL demonstration is unavailable.");
    expect(html).toContain(LOCAL_ONLY_WARNING_TITLE);
  });

  test("reset restores the deterministic fictional state and repeatability", async () => {
    await demoPool.query(`
      INSERT INTO vulnerable_demo_foods (
        id,
        name,
        category,
        description,
        price_cents
      )
      VALUES (999, 'Temporary Demo Food', 'Reset Check', 'Fictional reset check.', 1)
    `);

    await resetVulnerableDemo(environment);

    const counts = await demoPool.query(`
      SELECT
        (SELECT count(*)::integer FROM vulnerable_demo_users) AS users,
        (SELECT count(*)::integer FROM vulnerable_demo_foods) AS foods,
        (SELECT count(*)::integer FROM vulnerable_demo_orders) AS orders,
        (SELECT count(*)::integer FROM vulnerable_demo_order_items) AS items
    `);
    expect(counts.rows[0]).toEqual({
      users: 2,
      foods: 3,
      orders: 1,
      items: 1,
    });

    const url = new URL("/scenarios/sql-injection", demoHttp.origin);
    url.searchParams.set("q", APPROVED_SQL_INJECTION_PAYLOAD);
    const response = await fetch(url);
    expect(await response.text()).toContain("3 fictional items returned");
  });
});
