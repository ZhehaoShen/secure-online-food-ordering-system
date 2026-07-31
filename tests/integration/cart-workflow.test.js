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
import { createUserRepository } from "../../src/repositories/user-repository.js";
import { startServer } from "../../src/server.js";
import { createCartService } from "../../src/services/cart-service.js";
import { createMenuService } from "../../src/services/menu-service.js";
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
const COOKIE_NAME = "food_ordering_cart_test_sid";

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

describe.sequential("session-backed cart workflow", () => {
  let baseUrl;
  let cookie;
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

    const foodItemRepository = createFoodItemRepository(pool);
    const userRepository = createUserRepository(pool);
    const userService = createUserService(userRepository);
    const customerEmail = `cart-${randomUUID()}@example.test`;
    const customerPassword = randomUUID();
    await userService.createCustomer({
      name: "Cart Fiction",
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
    const app = createApplication({
      cartService: createCartService(foodItemRepository),
      menuService: createMenuService(foodItemRepository),
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

  test("requires authentication and renders the authenticated empty cart", async () => {
    const anonymous = await getHtml(baseUrl, "/cart");
    expect(anonymous.response.status).toBe(303);
    expect(anonymous.response.headers.get("location")).toBe("/login");

    const cart = await getHtml(baseUrl, "/cart", cookie);
    expect(cart.response.status).toBe(200);
    expect(cart.html).toContain("Your cart has no available foods.");
    expect(cart.html).toMatch(/0\s+items/);
    expect(cart.html).toContain("nav-link is-active");

    const menu = await getHtml(baseUrl, "/", cookie);
    expect(menu.html).toContain('action="/cart/items"');
    expect(menu.html).toContain("Add to cart");
  });

  test("adds a server-priced item and ignores client-owned fields", async () => {
    const food = foods["Maple Garden Bowl"];
    const response = await postForm(
      baseUrl,
      "/cart/items",
      {
        foodItemId: food.id,
        quantity: "2",
        priceCents: "1",
        totalCents: "1",
        userId: "999",
        role: "admin",
        status: "completed",
      },
      cookie,
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/cart");

    const cart = await getHtml(baseUrl, "/cart", cookie);
    expect(cart.html).toContain("Maple Garden Bowl");
    expect(cart.html).toContain("quantity 2");
    expect(cart.html).toContain("$25.98");
    expect(cart.html).not.toContain("$0.01");

    const sessionResult = await pool.query(
      'SELECT sess FROM "session"',
    );
    expect(sessionResult.rows[0].sess.cart).toEqual({
      items: {
        [food.id]: 2,
      },
    });
    const serializedCart = JSON.stringify(
      sessionResult.rows[0].sess.cart,
    );
    expect(serializedCart).not.toContain("price");
    expect(serializedCart).not.toContain("total");
    expect(serializedCart).not.toContain("userId");
    expect(serializedCart).not.toContain("role");
    expect(serializedCart).not.toContain("status");
  });

  test("increments a duplicate item and calculates multiple line totals", async () => {
    const bowl = foods["Maple Garden Bowl"];
    const drink = foods["Northern Berry Fizz"];

    const repeatResponse = await postForm(
      baseUrl,
      "/cart/items",
      {
        foodItemId: bowl.id,
        quantity: "1",
      },
      cookie,
    );
    const secondItemResponse = await postForm(
      baseUrl,
      "/cart/items",
      {
        foodItemId: drink.id,
        quantity: "2",
      },
      cookie,
    );

    expect(repeatResponse.status).toBe(303);
    expect(secondItemResponse.status).toBe(303);

    const cart = await getHtml(baseUrl, "/cart", cookie);
    expect(cart.html).toContain("quantity 3");
    expect(cart.html).toContain("quantity 2");
    expect(cart.html).toMatch(/5\s+items/);
    expect(cart.html).toContain("$46.95");
    expect(
      cart.html.match(/Maple Garden Bowl/g),
    ).toHaveLength(1);
  });

  test("updates, removes, and idempotently re-removes cart items", async () => {
    const bowl = foods["Maple Garden Bowl"];
    const drink = foods["Northern Berry Fizz"];

    const updateResponse = await postForm(
      baseUrl,
      `/cart/items/${bowl.id}/update`,
      { quantity: "4" },
      cookie,
    );
    expect(updateResponse.status).toBe(303);

    const updatedCart = await getHtml(baseUrl, "/cart", cookie);
    expect(updatedCart.html).toContain("quantity 4");
    expect(updatedCart.html).toContain("$59.94");

    const removeResponse = await postForm(
      baseUrl,
      `/cart/items/${drink.id}/remove`,
      {},
      cookie,
    );
    const repeatedRemoveResponse = await postForm(
      baseUrl,
      `/cart/items/${drink.id}/remove`,
      {},
      cookie,
    );

    expect(removeResponse.status).toBe(303);
    expect(repeatedRemoveResponse.status).toBe(303);

    const cart = await getHtml(baseUrl, "/cart", cookie);
    expect(cart.html).not.toContain("Northern Berry Fizz");
    expect(cart.html).toContain("$51.96");
  });

  test("controls unavailable, missing, and invalid item or quantity input", async () => {
    const unavailable = foods["Lakeside Apple Crumble"];
    const unavailableResponse = await postForm(
      baseUrl,
      "/cart/items",
      {
        foodItemId: unavailable.id,
        quantity: "1",
      },
      cookie,
    );
    const missingResponse = await postForm(
      baseUrl,
      "/cart/items",
      {
        foodItemId: "999999",
        quantity: "1",
      },
      cookie,
    );
    const invalidIdResponse = await postForm(
      baseUrl,
      "/cart/items",
      {
        foodItemId: "0",
        quantity: "1",
      },
      cookie,
    );
    const invalidQuantityResponse = await postForm(
      baseUrl,
      "/cart/items",
      {
        foodItemId: foods["Maple Garden Bowl"].id,
        quantity: "100",
      },
      cookie,
    );
    const missingUpdateResponse = await postForm(
      baseUrl,
      `/cart/items/${foods["Northern Berry Fizz"].id}/update`,
      { quantity: "1" },
      cookie,
    );

    expect(unavailableResponse.status).toBe(404);
    expect(await unavailableResponse.text()).toContain(
      "The selected food is not available.",
    );
    expect(missingResponse.status).toBe(404);
    expect(await missingResponse.text()).toContain(
      "The selected food is not available.",
    );
    expect(invalidIdResponse.status).toBe(422);
    expect(await invalidIdResponse.text()).toContain(
      "The cart item or quantity is invalid.",
    );
    expect(invalidQuantityResponse.status).toBe(422);
    expect(await invalidQuantityResponse.text()).toContain(
      "The cart item or quantity is invalid.",
    );
    expect(missingUpdateResponse.status).toBe(404);
    expect(await missingUpdateResponse.text()).toContain(
      "The selected cart item was not found.",
    );

    const cart = await getHtml(baseUrl, "/cart", cookie);
    expect(cart.html).toContain("Maple Garden Bowl");
    expect(cart.html).toContain("quantity 4");
    expect(cart.html).toContain("$51.96");
  });

  test("removes the final item without creating an order", async () => {
    const bowl = foods["Maple Garden Bowl"];
    const response = await postForm(
      baseUrl,
      `/cart/items/${bowl.id}/remove`,
      {},
      cookie,
    );
    expect(response.status).toBe(303);

    const cart = await getHtml(baseUrl, "/cart", cookie);
    expect(cart.html).toContain("Your cart has no available foods.");
    expect(cart.html).toContain("$0.00");

    const orderCount = await pool.query(
      "SELECT count(*)::integer AS count FROM orders",
    );
    expect(orderCount.rows[0].count).toBe(2);
  });
});
