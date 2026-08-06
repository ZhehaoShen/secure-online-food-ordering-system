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
const COOKIE_NAME = "food_ordering_checkout_test_sid";

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

async function postForm(baseUrl, path, values = {}, cookie = null) {
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

describe.sequential("transactional checkout", () => {
  const auditEvents = [];
  let baseUrl;
  let cookie;
  let customer;
  let databaseServer;
  let foods;
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

    await pool.query(`
      CREATE OR REPLACE FUNCTION test_reject_quantity_seven()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $$
      BEGIN
        IF NEW.quantity = 7 THEN
          RAISE EXCEPTION 'forced order item failure';
        END IF;
        RETURN NEW;
      END;
      $$;

      CREATE TRIGGER test_reject_quantity_seven_trigger
      BEFORE INSERT ON order_items
      FOR EACH ROW
      EXECUTE FUNCTION test_reject_quantity_seven();
    `);

    const foodItemRepository = createFoodItemRepository(pool);
    const userService = createUserService(createUserRepository(pool));
    const customerEmail = `checkout-${randomUUID()}@example.test`;
    const customerPassword = randomUUID();
    customer = await userService.createCustomer({
      name: "Checkout Fiction",
      email: customerEmail,
      password: customerPassword,
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
    const cartService = createCartService(foodItemRepository);
    const orderService = createOrderService(
      createOrderRepository(pool),
      {
        auditRecorder: {
          async record(event) {
            auditEvents.push(event);
          },
        },
      },
    );
    const app = createApplication({
      cartService,
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

    const loginResponse = await postForm(baseUrl, "/login", {
      email: customerEmail,
      password: customerPassword,
    });
    expect(loginResponse.status).toBe(303);
    cookie = cookiePair(loginResponse);

    const foodResult = await pool.query(`
      SELECT id::text, name, price_cents, is_available
      FROM food_items
      ORDER BY name
    `);
    foods = Object.fromEntries(
      foodResult.rows.map((food) => [food.name, food]),
    );
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

  async function storedCart() {
    const result = await pool.query(
      `
        SELECT sess
        FROM "session"
        WHERE sess -> 'user' ->> 'id' = $1
      `,
      [customer.id],
    );

    return result.rows[0].sess.cart;
  }

  async function customerOrderCounts() {
    const result = await pool.query(
      `
        SELECT
          count(DISTINCT customer_order.id)::integer AS order_count,
          count(order_line.food_item_id)::integer AS item_count
        FROM orders AS customer_order
        LEFT JOIN order_items AS order_line
          ON order_line.order_id = customer_order.id
        WHERE customer_order.user_id = $1
      `,
      [customer.id],
    );

    return result.rows[0];
  }

  test("requires authentication and rejects an empty cart", async () => {
    const anonymous = await postForm(baseUrl, "/orders");
    expect(anonymous.status).toBe(303);
    expect(anonymous.headers.get("location")).toBe("/login");

    const empty = await postForm(baseUrl, "/orders", {}, cookie);
    expect(empty.status).toBe(409);
    expect(await empty.text()).toContain(
      "Add at least one available food before placing an order.",
    );
    expect(await customerOrderCounts()).toEqual({
      order_count: 0,
      item_count: 0,
    });
  });

  test("uses current database snapshots, commits all rows, then clears the cart", async () => {
    const bowl = foods["Maple Garden Bowl"];
    const drink = foods["Northern Berry Fizz"];

    await postForm(
      baseUrl,
      "/cart/items",
      { foodItemId: bowl.id, quantity: "2" },
      cookie,
    );
    await postForm(
      baseUrl,
      "/cart/items",
      { foodItemId: drink.id, quantity: "1" },
      cookie,
    );
    await pool.query(
      "UPDATE food_items SET price_cents = $1 WHERE id = $2",
      [1499, bowl.id],
    );

    const cartBeforeCheckout = await getHtml(baseUrl, "/cart", cookie);
    expect(cartBeforeCheckout.html).toContain('action="/orders"');
    expect(cartBeforeCheckout.html).toContain("Place order");

    const tamperedResponse = await postForm(
      baseUrl,
      "/orders",
      {
        priceCents: "1",
        totalCents: "1",
        userId: "1",
        role: "admin",
        status: "completed",
      },
      cookie,
    );

    expect(tamperedResponse.status).toBe(422);
    expect(await tamperedResponse.text()).toContain("unexpected field");
    expect(await customerOrderCounts()).toEqual({
      order_count: 0,
      item_count: 0,
    });
    expect(await storedCart()).toEqual({
      items: {
        [bowl.id]: 2,
        [drink.id]: 1,
      },
    });

    const response = await postForm(baseUrl, "/orders", {}, cookie);

    expect(response.status).toBe(303);
    const location = response.headers.get("location");
    expect(location).toMatch(/^\/orders\/[1-9][0-9]*$/);
    const orderId = location.split("/").at(-1);

    const orderResult = await pool.query(
      `
        SELECT id::text, user_id::text, status, total_cents
        FROM orders
        WHERE id = $1
      `,
      [orderId],
    );
    expect(orderResult.rows[0]).toEqual({
      id: orderId,
      user_id: customer.id,
      status: "confirmed",
      total_cents: 3397,
    });

    const itemResult = await pool.query(
      `
        SELECT
          food_item_id::text,
          food_name_snapshot,
          unit_price_cents,
          quantity
        FROM order_items
        WHERE order_id = $1
        ORDER BY food_item_id
      `,
      [orderId],
    );
    expect(itemResult.rows).toEqual([
      {
        food_item_id: drink.id,
        food_name_snapshot: "Northern Berry Fizz",
        unit_price_cents: 399,
        quantity: 1,
      },
      {
        food_item_id: bowl.id,
        food_name_snapshot: "Maple Garden Bowl",
        unit_price_cents: 1499,
        quantity: 2,
      },
    ].sort((left, right) =>
      Number(left.food_item_id) - Number(right.food_item_id)
    ));
    expect(await storedCart()).toEqual({ items: {} });
    expect(auditEvents).toEqual([
      {
        action: "order.created",
        actorUserId: customer.id,
        entityType: "order",
        entityId: orderId,
        result: "success",
      },
    ]);
    expect(JSON.stringify(auditEvents)).not.toMatch(
      /password|cookie|session|price|total|role/i,
    );
  });

  test("rejects a food disabled after it entered the cart without clearing it", async () => {
    const soup = foods["Cedar Lentil Soup"];
    await postForm(
      baseUrl,
      "/cart/items",
      { foodItemId: soup.id, quantity: "1" },
      cookie,
    );
    await pool.query(
      "UPDATE food_items SET is_available = false WHERE id = $1",
      [soup.id],
    );

    const response = await postForm(baseUrl, "/orders", {}, cookie);
    expect(response.status).toBe(409);
    expect(await response.text()).toContain(
      "one or more foods are unavailable",
    );
    expect(await customerOrderCounts()).toEqual({
      order_count: 1,
      item_count: 2,
    });
    expect(await storedCart()).toEqual({
      items: {
        [soup.id]: 1,
      },
    });

    await pool.query(
      "UPDATE food_items SET is_available = true WHERE id = $1",
      [soup.id],
    );
    await postForm(
      baseUrl,
      `/cart/items/${soup.id}/remove`,
      {},
      cookie,
    );
  });

  test("rolls back an order and every item after a forced mid-transaction failure", async () => {
    const drink = foods["Northern Berry Fizz"];
    await postForm(
      baseUrl,
      "/cart/items",
      { foodItemId: drink.id, quantity: "7" },
      cookie,
    );

    const response = await postForm(baseUrl, "/orders", {}, cookie);
    const html = await response.text();

    expect(response.status).toBe(500);
    expect(html).toContain("The order could not be placed.");
    expect(html).not.toContain("forced order item failure");
    expect(html).not.toContain("OrderPersistenceError");
    expect(await customerOrderCounts()).toEqual({
      order_count: 1,
      item_count: 2,
    });
    expect(await storedCart()).toEqual({
      items: {
        [drink.id]: 7,
      },
    });
    expect(auditEvents).toHaveLength(1);
  });
});
