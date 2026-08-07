import { readFile, readdir } from "node:fs/promises";
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
  readVulnerableDemoConfig,
  VulnerableDemoConfigurationError,
} from "./config.js";
import { resetVulnerableDemo } from "./reset.js";
import { setupVulnerableDemo } from "./setup.js";

const DEMO_DIRECTORY = resolve("demo", "vulnerable");
const DEMO_DATABASE = "food_ordering_vulnerable_demo";
const DEMO_USER = "food_ordering_vulnerable_demo";
const DEMO_PASSWORD = "fictional-baseline-safety-password";
const BASELINE_MARKER = "day4-isolated-vulnerable-baseline-2026-08-03";
const SIX_SCENARIO_ROUTES = Object.freeze([
  "/scenarios/sql-injection",
  "/scenarios/xss",
  "/scenarios/weak-password",
  "/scenarios/unsafe-session",
  "/scenarios/missing-admin-authorization",
  "/scenarios/excessive-database-privileges",
]);

function safeEnvironment(overrides = {}) {
  return {
    VULNERABLE_DEMO_MODE: "local-classroom-only",
    VULNERABLE_DEMO_DATA_CLASSIFICATION: "fictional-only",
    VULNERABLE_DEMO_DATABASE_MARKER: "isolated-vulnerable-demo",
    VULNERABLE_DEMO_HOST: "127.0.0.1",
    VULNERABLE_DEMO_PORT: "3100",
    VULNERABLE_DEMO_DATABASE_HOST: "127.0.0.1",
    VULNERABLE_DEMO_DATABASE_PORT: "5432",
    VULNERABLE_DEMO_DATABASE_NAME: DEMO_DATABASE,
    VULNERABLE_DEMO_DATABASE_USER: DEMO_USER,
    VULNERABLE_DEMO_DATABASE_PASSWORD: DEMO_PASSWORD,
    ...overrides,
  };
}

async function filesBelow(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesBelow(path) : [path];
  }));

  return nested.flat();
}

async function combinedText(paths) {
  return (await Promise.all(paths.map((path) => readFile(path, "utf8"))))
    .join("\n");
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

async function fixtureSnapshot(pool) {
  const tableNames = [
    "vulnerable_demo_users",
    "vulnerable_demo_foods",
    "vulnerable_demo_orders",
    "vulnerable_demo_order_items",
  ];
  const snapshot = {};

  for (const tableName of tableNames) {
    const result = await pool.query(
      `SELECT * FROM ${tableName} ORDER BY 1 ASC, 2 ASC`,
    );
    snapshot[tableName] = result.rows;
  }

  return snapshot;
}

describe("vulnerable baseline safety contract", () => {
  test("the exact local fictional configuration is accepted", () => {
    const config = readVulnerableDemoConfig(safeEnvironment());

    expect(config).toMatchObject({
      mode: "local-classroom-only",
      dataClassification: "fictional-only",
      databaseMarker: "isolated-vulnerable-demo",
      host: "127.0.0.1",
      database: {
        host: "127.0.0.1",
        database: DEMO_DATABASE,
        user: DEMO_USER,
      },
    });
  });

  test.each([
    ["production mode", { NODE_ENV: "production" }],
    ["normal database URL", { DATABASE_URL: "ordinary-application-value" }],
    ["public listener", { VULNERABLE_DEMO_HOST: "0.0.0.0" }],
    ["remote database", { VULNERABLE_DEMO_DATABASE_HOST: "192.0.2.10" }],
    ["wrong database", { VULNERABLE_DEMO_DATABASE_NAME: "food_ordering" }],
    ["wrong user", { VULNERABLE_DEMO_DATABASE_USER: "food_ordering_app" }],
    ["wrong marker", { VULNERABLE_DEMO_DATABASE_MARKER: "ordinary" }],
    ["placeholder password", {
      VULNERABLE_DEMO_DATABASE_PASSWORD: "replace_with_local_demo_password",
    }],
  ])("rejects %s", (_label, overrides) => {
    expect(() => readVulnerableDemoConfig(safeEnvironment(overrides)))
      .toThrow(VulnerableDemoConfigurationError);
  });

  test("all pages include the warning and the index links all scenarios", async () => {
    const viewDirectory = join(DEMO_DIRECTORY, "views");
    const pageFiles = (await readdir(viewDirectory))
      .filter((filename) => filename.endsWith(".ejs"));
    const pages = await Promise.all(pageFiles.map(async (filename) => ({
      filename,
      text: await readFile(join(viewDirectory, filename), "utf8"),
    })));
    const index = await readFile(join(viewDirectory, "index.ejs"), "utf8");
    const warning = await readFile(
      join(viewDirectory, "partials", "local-only-warning.ejs"),
      "utf8",
    );

    expect(pageFiles).toHaveLength(4);
    for (const page of pages) {
      expect(page.text, page.filename)
        .toContain('include("partials/local-only-warning")');
    }
    for (const route of SIX_SCENARIO_ROUTES) {
      expect(index).toContain(`href="${route}"`);
    }
    expect(warning).toContain('role="alert"');
  });

  test("documentation identifies the baseline and every repeatable comparison", async () => {
    const readme = await readFile(join(DEMO_DIRECTORY, "README.md"), "utf8");

    expect(readme).toContain(BASELINE_MARKER);
    expect(readme).toContain("documentation marker, not a Git tag");
    expect(readme).toContain("Expected vulnerable result");
    expect(readme).toContain("Secure expected result and schedule");
    expect(readme).toContain("npm run demo:vulnerable:reset");
    expect(readme).toContain("Control-C");
    expect(readme).toContain("complete local teardown");
    for (const route of SIX_SCENARIO_ROUTES) {
      expect(readme).toContain(route);
    }
  });

  test("secure runtime contains no vulnerable-demo import or route", async () => {
    const secureFiles = await filesBelow(resolve("src"));
    const secureSource = await combinedText(secureFiles);

    expect(secureSource).not.toMatch(/demo[\\/]vulnerable/);
    expect(secureSource).not.toContain("vulnerable_demo_");
    for (const route of SIX_SCENARIO_ROUTES) {
      expect(secureSource).not.toContain(route);
    }
  });

  test("runtime baseline files contain no private token or personal identity", async () => {
    const runtimeFiles = (await filesBelow(DEMO_DIRECTORY)).filter((path) =>
      !path.endsWith(".test.js"),
    );
    const runtimeSource = await combinedText(runtimeFiles);
    const emails = runtimeSource.match(
      /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,
    ) ?? [];

    expect(existsSync(join(DEMO_DIRECTORY, ".env"))).toBe(false);
    expect(emails.length).toBeGreaterThan(0);
    expect(emails.every((email) =>
      email.endsWith("@vulnerable-demo.test"),
    )).toBe(true);
    expect(runtimeSource).not.toMatch(
      /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|gh[pousr]_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9]{20,}|postgres(?:ql)?:\/\//,
    );
  });
});

describe.sequential("repeatable fictional baseline data", () => {
  let testDatabase;
  let ownerPool;
  let demoPool;
  let environment;

  beforeAll(async () => {
    testDatabase = await startPostgresTestServer();
    const owner = testDatabase.environment;
    ownerPool = new pg.Pool(poolConfig(
      owner,
      owner.DATABASE_NAME,
      owner.DATABASE_USER,
    ));
    await ownerPool.query(`CREATE ROLE ${DEMO_USER} LOGIN`);
    await ownerPool.query(
      `CREATE DATABASE ${DEMO_DATABASE} OWNER ${DEMO_USER}`,
    );
    environment = safeEnvironment({
      VULNERABLE_DEMO_DATABASE_PORT: owner.DATABASE_PORT,
    });
  }, 30_000);

  afterAll(async () => {
    await demoPool?.end();
    await ownerPool?.end();
    await testDatabase?.stop();
  });

  test("setup and reset reproduce only the approved fictional snapshot", async () => {
    await setupVulnerableDemo(environment);
    await setupVulnerableDemo(environment);
    const owner = testDatabase.environment;
    demoPool = new pg.Pool(poolConfig(owner, DEMO_DATABASE, DEMO_USER));
    const setupSnapshot = await fixtureSnapshot(demoPool);

    await resetVulnerableDemo(environment);
    await resetVulnerableDemo(environment);
    const resetSnapshot = await fixtureSnapshot(demoPool);
    const users = resetSnapshot.vulnerable_demo_users;

    expect(resetSnapshot).toEqual(setupSnapshot);
    expect(users).toHaveLength(2);
    expect(resetSnapshot.vulnerable_demo_foods).toHaveLength(3);
    expect(resetSnapshot.vulnerable_demo_orders).toHaveLength(1);
    expect(resetSnapshot.vulnerable_demo_order_items).toHaveLength(1);
    expect(users.every((user) =>
      user.email.endsWith("@vulnerable-demo.test"),
    )).toBe(true);
    expect(users.every((user) =>
      /^scrypt\$v1\$N=16384,r=8,p=1\$/.test(user.password_hash),
    )).toBe(true);
    expect(users.every((user) =>
      !["1234", "ClassroomCustomer!42", "ClassroomAdmin!42"]
        .includes(user.password_hash),
    )).toBe(true);
  }, 30_000);
});
