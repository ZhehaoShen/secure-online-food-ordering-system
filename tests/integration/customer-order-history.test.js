import { randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { createApplication } from "../../src/app.js";
import { readSessionConfig } from "../../src/config/session.js";
import {
  closeDatabasePool,
  createDatabasePool,
} from "../../src/db/pool.js";
import { createFoodItemRepository } from "../../src/repositories/food-item-repository.js";
import { createOrderRepository } from "../../src/repositories/order-repository.js";
import { createUserRepository } from "../../src/repositories/user-repository.js";
import { startServer } from "../../src/server.js";
import { createCartService } from "../../src/services/cart-service.js";
import { createOrderService } from "../../src/services/order-service.js";
import { createUserService } from "../../src/services/user-service.js";
import { createSessionMiddleware } from "../../src/session/middleware.js";
import {
  closeSessionStore,
  createSessionStore,
} from "../../src/session/store.js";
import { startPostgresTestServer } from "../helpers/postgres-test-server.js";

const TEST_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(TEST_DIRECTORY, "../..");
const SCHEMA_FILE = resolve(PROJECT_ROOT, "db/schema.sql");
const SESSION_SCHEMA_FILE = resolve(PROJECT_ROOT, "db/session-schema.sql");
const SEED_FILE = resolve(PROJECT_ROOT, "db/seed.sql");
const COOKIE_NAME = "food_ordering_history_test_sid";

function closeServer(server) {
  return new Promise((resolveClose, rejectClose) => {
    server.close((error) => {
      if (error) {
        rejectClose(error);
        return;
      }

      resolveClose();
    });
  });
}

async function listen(app) {
  const server = startServer({
    app,
    host: "127.0.0.1",
    port: 0,
  });
  await new Promise((resolveListening) => {
    server.once("listening", resolveListening);
  });
  const address = server.address();

  return Object.freeze({
    baseUrl: `http://127.0.0.1:${address.port}`,
    server,
  });
}

function cookiePair(response) {
  return response.headers.get("set-cookie")?.split(";", 1)[0] ?? null;
}

async function postForm(baseUrl, path, values, cookie = null) {
  return fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      accept: "text/html",
      "content-type": "application/x-www-form-urlencoded",
      ...(cookie ? { cookie } : {}),
    },
    body: new URLSearchParams(values),
    redirect: "manual",
  });
}

async function getHtml(baseUrl, path, cookie = null) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: {
      accept: "text/html",
      ...(cookie ? { cookie } : {}),
    },
    redirect: "manual",
  });

  return Object.freeze({
    response,
    html: await response.text(),
  });
}

describe.sequential("customer order confirmation and history", () => {
  let aliceCookie;
  let aliceFirstOrder;
  let aliceSecondOrder;
  let baseUrl;
  let bobOrder;
  let databaseServer;
  let emptyCookie;
  let pool;
  let server;
  let sessionStore;

  beforeAll(async () => {
    databaseServer = await startPostgresTestServer();
    databaseServer.applySqlFile(SCHEMA_FILE);
    databaseServer.applySqlFile(SESSION_SCHEMA_FILE);
    databaseServer.applySqlFile(SEED_FILE);
    pool = createDatabasePool({
      environment: databaseServer.environment,
      logger: () => {},
    });

    const foodItemRepository = createFoodItemRepository(pool);
    const orderService = createOrderService(createOrderRepository(pool));
    const userService = createUserService(createUserRepository(pool));
    const alicePassword = randomUUID();
    const bobPassword = randomUUID();
    const emptyPassword = randomUUID();
    const alice = await userService.createCustomer({
      name: "Alice Fiction",
      email: `alice-${randomUUID()}@example.test`,
      password: alicePassword,
    });
    const bob = await userService.createCustomer({
      name: "Bob Fiction",
      email: `bob-${randomUUID()}@example.test`,
      password: bobPassword,
    });
    const emptyCustomer = await userService.createCustomer({
      name: "Empty History Fiction",
      email: `empty-${randomUUID()}@example.test`,
      password: emptyPassword,
    });

    const foodResult = await pool.query(`
      SELECT id::text, name
      FROM food_items
      WHERE name IN (
        'Maple Garden Bowl',
        'Northern Berry Fizz',
        'Cedar Lentil Soup',
        'Harbour Veggie Wrap'
      )
    `);
    const foods = Object.fromEntries(
      foodResult.rows.map((food) => [food.name, food]),
    );

    aliceFirstOrder = await orderService.checkout({
      userId: alice.id,
      cart: {
        items: {
          [foods["Maple Garden Bowl"].id]: 1,
          [foods["Northern Berry Fizz"].id]: 2,
        },
      },
    });
    await pool.query(
      `
        UPDATE orders
        SET status = 'completed', updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `,
      [aliceFirstOrder.id],
    );
    aliceSecondOrder = await orderService.checkout({
      userId: alice.id,
      cart: {
        items: {
          [foods["Cedar Lentil Soup"].id]: 1,
        },
      },
    });
    bobOrder = await orderService.checkout({
      userId: bob.id,
      cart: {
        items: {
          [foods["Harbour Veggie Wrap"].id]: 3,
        },
      },
    });

    const sessionConfig = readSessionConfig({
      SESSION_SECRET: `${randomUUID()}${randomUUID()}`,
      SESSION_COOKIE_NAME: COOKIE_NAME,
      SESSION_IDLE_TIMEOUT_MINUTES: "30",
      SESSION_SECURE_COOKIE: "false",
    });
    sessionStore = createSessionStore({
      pool,
      idleTimeoutMilliseconds: sessionConfig.idleTimeoutMilliseconds,
      logger: () => {},
      pruneSessionInterval: false,
    });
    const app = createApplication({
      cartService: createCartService(foodItemRepository),
      orderService,
      sessionCookie: {
        name: sessionConfig.cookieName,
        secure: sessionConfig.secureCookie,
      },
      sessionMiddleware: createSessionMiddleware({
        store: sessionStore,
        config: sessionConfig,
      }),
      userService,
    });
    const listening = await listen(app);
    baseUrl = listening.baseUrl;
    server = listening.server;

    const aliceLogin = await postForm(baseUrl, "/login", {
      email: alice.email,
      password: alicePassword,
    });
    const emptyLogin = await postForm(baseUrl, "/login", {
      email: emptyCustomer.email,
      password: emptyPassword,
    });
    expect(aliceLogin.status).toBe(303);
    expect(emptyLogin.status).toBe(303);
    aliceCookie = cookiePair(aliceLogin);
    emptyCookie = cookiePair(emptyLogin);
  }, 60_000);

  afterAll(async () => {
    if (server) {
      await closeServer(server);
    }

    await closeSessionStore(sessionStore);

    if (pool) {
      await closeDatabasePool(pool);
    }

    if (databaseServer) {
      await databaseServer.stop();
    }
  }, 30_000);

  test("requires authentication for history and detail", async () => {
    const history = await getHtml(baseUrl, "/orders");
    const detail = await getHtml(
      baseUrl,
      `/orders/${aliceFirstOrder.id}`,
    );

    expect(history.response.status).toBe(303);
    expect(history.response.headers.get("location")).toBe("/login");
    expect(detail.response.status).toBe(303);
    expect(detail.response.headers.get("location")).toBe("/login");
  });

  test("lists only the signed-in customer's expected order history", async () => {
    const history = await getHtml(baseUrl, "/orders", aliceCookie);

    expect(history.response.status).toBe(200);
    expect(history.html).toContain("Order history");
    expect(history.html).toContain(`Order #${aliceFirstOrder.id}`);
    expect(history.html).toContain(`Order #${aliceSecondOrder.id}`);
    expect(history.html).toContain("$20.97");
    expect(history.html).toContain("$7.99");
    expect(history.html).toContain("Completed");
    expect(history.html).toContain("Confirmed");
    expect(history.html).toMatch(/3\s+items/);
    expect(history.html).not.toContain(`Order #${bobOrder.id}`);
    expect(history.html.indexOf(`Order #${aliceSecondOrder.id}`))
      .toBeLessThan(history.html.indexOf(`Order #${aliceFirstOrder.id}`));
  });

  test("renders an owned completed order with saved line snapshots", async () => {
    const detail = await getHtml(
      baseUrl,
      `/orders/${aliceFirstOrder.id}`,
      aliceCookie,
    );

    expect(detail.response.status).toBe(200);
    expect(detail.html).toContain("Order confirmed");
    expect(detail.html).toContain(`Order #<strong>${aliceFirstOrder.id}`);
    expect(detail.html).toContain("Completed");
    expect(detail.html).toContain("Maple Garden Bowl");
    expect(detail.html).toContain("Northern Berry Fizz");
    expect(detail.html).toMatch(/Quantity\s+1/);
    expect(detail.html).toMatch(/Quantity\s+2/);
    expect(detail.html).toContain("$12.99 each");
    expect(detail.html).toContain("$3.99 each");
    expect(detail.html).toContain("$7.98");
    expect(detail.html).toContain("$20.97");
  });

  test("uses the same missing state for invalid, absent, and non-owned orders", async () => {
    const invalid = await getHtml(baseUrl, "/orders/0", aliceCookie);
    const absent = await getHtml(
      baseUrl,
      "/orders/999999999",
      aliceCookie,
    );
    const nonOwned = await getHtml(
      baseUrl,
      `/orders/${bobOrder.id}`,
      aliceCookie,
    );

    for (const result of [invalid, absent, nonOwned]) {
      expect(result.response.status).toBe(404);
      expect(result.html).toContain("The order could not be found.");
      expect(result.html).toContain(
        "It may not exist or may not belong to this account.",
      );
      expect(result.html).not.toContain("Harbour Veggie Wrap");
    }
  });

  test("renders a clear empty-history state", async () => {
    const history = await getHtml(baseUrl, "/orders", emptyCookie);

    expect(history.response.status).toBe(200);
    expect(history.html).toContain("Your order history is empty.");
    expect(history.html).toContain("Browse the menu");
    expect(history.html).not.toContain(
      `Order #${aliceFirstOrder.id}`,
    );
    expect(history.html).not.toContain(`Order #${bobOrder.id}`);
  });
});
