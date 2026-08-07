import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import pg from "pg";
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  test,
} from "vitest";

import { startPostgresTestServer } from "../../tests/helpers/postgres-test-server.js";
import { createVulnerableDemoApplication } from "./app.js";
import {
  APPROVED_WEAK_PASSWORD,
  APPROVED_XSS_PAYLOAD,
  UNSAFE_SESSION_COOKIE_NAME,
  UNSAFE_SESSION_COOKIE_VALUE,
  XSS_CONTROL_MESSAGE,
} from "./baseline-scenarios.js";
import { LOCAL_ONLY_WARNING_TITLE } from "./safety.js";

const DEMO_HOST = "127.0.0.1";
const DEMO_DATABASE = "food_ordering_vulnerable_demo";
const DEMO_USER = "food_ordering_vulnerable_demo";
const DEMO_PASSWORD = "fictional-baseline-scenario-password";

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

async function postForm(origin, path, values, cookie = null) {
  const headers = {
    "Content-Type": "application/x-www-form-urlencoded",
  };

  if (cookie) {
    headers.Cookie = cookie;
  }

  return fetch(new URL(path, origin), {
    method: "POST",
    headers,
    body: new URLSearchParams(values),
  });
}

async function fixtureCounts(pool) {
  const result = await pool.query(`
    SELECT
      (SELECT count(*)::integer FROM vulnerable_demo_users) AS users,
      (SELECT count(*)::integer FROM vulnerable_demo_foods) AS foods,
      (SELECT count(*)::integer FROM vulnerable_demo_orders) AS orders,
      (SELECT count(*)::integer FROM vulnerable_demo_order_items) AS items
  `);

  return result.rows[0];
}

describe.sequential("other isolated vulnerable baseline scenarios", () => {
  let testDatabase;
  let ownerPool;
  let demoPool;
  let ordinaryPool;
  let demoHttp;
  let wrongTargetHttp;
  let initialCounts;

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

    demoPool = new pg.Pool(poolConfig(owner, DEMO_DATABASE, DEMO_USER));
    await demoPool.query(await readFile(
      resolve("demo", "vulnerable", "schema.sql"),
      "utf8",
    ));
    await demoPool.query(await readFile(
      resolve("demo", "vulnerable", "seed.sql"),
      "utf8",
    ));
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
    initialCounts = await fixtureCounts(demoPool);
  }, 30_000);

  afterAll(async () => {
    await closeServer(wrongTargetHttp?.server);
    await closeServer(demoHttp?.server);
    await ordinaryPool?.end();
    await demoPool?.end();
    await ownerPool?.end();
    await testDatabase?.stop();
  });

  test("the fixed reflected XSS payload reaches only the raw demo sink", async () => {
    const controlUrl = new URL("/scenarios/xss", demoHttp.origin);
    controlUrl.searchParams.set("message", XSS_CONTROL_MESSAGE);
    const payloadUrl = new URL("/scenarios/xss", demoHttp.origin);
    payloadUrl.searchParams.set("message", APPROVED_XSS_PAYLOAD);

    const controlResponse = await fetch(controlUrl);
    const controlHtml = await controlResponse.text();
    const payloadResponse = await fetch(payloadUrl);
    const payloadHtml = await payloadResponse.text();

    expect(controlResponse.status).toBe(200);
    expect(controlHtml).toContain(XSS_CONTROL_MESSAGE);
    expect(controlHtml).not.toContain('id="xss-demo-marker"');
    expect(payloadResponse.status).toBe(200);
    expect(payloadHtml).toContain(APPROVED_XSS_PAYLOAD);
    expect(payloadHtml).toContain(LOCAL_ONLY_WARNING_TITLE);

    const rejectedUrl = new URL("/scenarios/xss", demoHttp.origin);
    rejectedUrl.searchParams.set("message", "<script>alert(1)</script>");
    const rejectedResponse = await fetch(rejectedUrl);
    expect(rejectedResponse.status).toBe(422);
    expect(await rejectedResponse.text()).not.toContain("<script>alert(1)</script>");
  });

  test("the isolated weak-password check accepts only its fixed short example", async () => {
    const accepted = await postForm(
      demoHttp.origin,
      "/scenarios/weak-password",
      { password: APPROVED_WEAK_PASSWORD },
    );
    const acceptedHtml = await accepted.text();
    const rejected = await postForm(
      demoHttp.origin,
      "/scenarios/weak-password",
      { password: "not-the-approved-example" },
    );

    expect(accepted.status).toBe(200);
    expect(acceptedHtml).toContain("Weak fictional password accepted");
    expect(acceptedHtml).toContain(LOCAL_ONLY_WARNING_TITLE);
    expect(rejected.status).toBe(422);
  });

  test("the fixed unprotected session cookie is predictable and reusable", async () => {
    const firstStart = await postForm(
      demoHttp.origin,
      "/scenarios/unsafe-session",
      { action: "start" },
    );
    const secondStart = await postForm(
      demoHttp.origin,
      "/scenarios/unsafe-session",
      { action: "start" },
    );
    const firstCookie = firstStart.headers.get("set-cookie");
    const secondCookie = secondStart.headers.get("set-cookie");
    const cookiePair = `${UNSAFE_SESSION_COOKIE_NAME}=${UNSAFE_SESSION_COOKIE_VALUE}`;

    expect(firstCookie).toBe(secondCookie);
    expect(firstCookie).toContain(cookiePair);
    expect(firstCookie).not.toMatch(/HttpOnly|SameSite|Secure/i);

    const missingCookie = await postForm(
      demoHttp.origin,
      "/scenarios/unsafe-session",
      { action: "reuse" },
    );
    const reused = await postForm(
      demoHttp.origin,
      "/scenarios/unsafe-session",
      { action: "reuse" },
      cookiePair,
    );
    const reusedHtml = await reused.text();

    expect(missingCookie.status).toBe(422);
    expect(reused.status).toBe(200);
    expect(reusedHtml).toContain("Fixed session reused as fictional customer");
    expect(reusedHtml).toContain(LOCAL_ONLY_WARNING_TITLE);
  });

  test("the fictional customer reaches the isolated administrator order view", async () => {
    const response = await postForm(
      demoHttp.origin,
      "/scenarios/missing-admin-authorization",
      { actor: "fictional-customer" },
    );
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain("Customer received administrator order view");
    expect(html).toContain("customer");
    expect(html).toContain("#1001");
    expect(html).toContain(LOCAL_ONLY_WARNING_TITLE);
  });

  test("read-only inspection confirms excessive dummy-database privileges", async () => {
    const response = await postForm(
      demoHttp.origin,
      "/scenarios/excessive-database-privileges",
      { inspect: "approved-read-only" },
    );
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain("Excessive demo-only privileges confirmed");
    expect(html.match(/<dd>true<\/dd>/g)).toHaveLength(4);
    expect(html).toContain(LOCAL_ONLY_WARNING_TITLE);
  });

  test("database-backed scenarios refuse an ordinary database and user", async () => {
    const unauthorized = await postForm(
      wrongTargetHttp.origin,
      "/scenarios/missing-admin-authorization",
      { actor: "fictional-customer" },
    );
    const privileges = await postForm(
      wrongTargetHttp.origin,
      "/scenarios/excessive-database-privileges",
      { inspect: "approved-read-only" },
    );

    expect(unauthorized.status).toBe(503);
    expect(privileges.status).toBe(503);
    expect(await unauthorized.text()).toContain(LOCAL_ONLY_WARNING_TITLE);
    expect(await privileges.text()).toContain(LOCAL_ONLY_WARNING_TITLE);
  });

  test("all five scenarios leave the fictional database state unchanged", async () => {
    expect(await fixtureCounts(demoPool)).toEqual(initialCounts);
    expect(initialCounts).toEqual({
      users: 2,
      foods: 3,
      orders: 1,
      items: 1,
    });
  });
});
