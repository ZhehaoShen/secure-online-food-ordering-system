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
import { hashPassword } from "../../src/security/passwords.js";
import { startServer } from "../../src/server.js";
import { createFoodManagementService } from "../../src/services/food-management-service.js";
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
const COOKIE_NAME = "food_ordering_admin_food_test_sid";

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
  let sessionCookie = cookie;
  let csrfToken = values._csrf;

  if (!csrfToken) {
    const fetchPath = sessionCookie ? "/" : "/login";
    const pageRes = await fetch(`${baseUrl}${fetchPath}`, {
      headers: { accept: "text/html", ...(sessionCookie ? { cookie: sessionCookie } : {}) },
    });
    const html = await pageRes.text();
    if (!sessionCookie) {
      sessionCookie = cookiePair(pageRes);
    }
    const match = html.match(/name="_csrf"\s+value="([a-f0-9]{64})"/);
    csrfToken = match ? match[1] : "";
  }

  const payload = { ...values, _csrf: csrfToken };

  return fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      accept: "text/html",
      "content-type": "application/x-www-form-urlencoded",
      ...(sessionCookie ? { cookie: sessionCookie } : {}),
    },
    body: new URLSearchParams(payload),
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

describe.sequential("administrator food management", () => {
  const auditEvents = [];
  let admin;
  let adminCookie;
  let baseUrl;
  let createdFoodId;
  let customerCookie;
  let databaseServer;
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

    const adminEmail = `admin-food-${randomUUID()}@example.test`;
    const adminPassword = randomUUID();
    const adminHash = await hashPassword(adminPassword);
    const adminResult = await pool.query(
      `
        INSERT INTO users (name, email, password_hash, role)
        VALUES ($1, $2, $3, 'admin')
        RETURNING id::text, name, email, role
      `,
      ["Food Admin Fiction", adminEmail, adminHash],
    );
    admin = adminResult.rows[0];

    const foodItemRepository = createFoodItemRepository(pool);
    const userService = createUserService(createUserRepository(pool));
    const customerEmail = `admin-food-customer-${randomUUID()}@example.test`;
    const customerPassword = randomUUID();
    await userService.createCustomer({
      name: "Food Customer Fiction",
      email: customerEmail,
      password: customerPassword,
    });

    const foodManagementService = createFoodManagementService(
      foodItemRepository,
      {
        auditRecorder: {
          async record(event) {
            auditEvents.push(event);
          },
        },
      },
    );
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
      foodManagementService,
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

    const adminLogin = await postForm(baseUrl, "/login", {
      email: adminEmail,
      password: adminPassword,
    });
    const customerLogin = await postForm(baseUrl, "/login", {
      email: customerEmail,
      password: customerPassword,
    });
    expect(adminLogin.status).toBe(303);
    expect(customerLogin.status).toBe(303);
    adminCookie = cookiePair(adminLogin);
    customerCookie = cookiePair(customerLogin);
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

  test("requires an administrator and renders the management list", async () => {
    const anonymous = await getHtml(baseUrl, "/admin/food-items");
    const customer = await getHtml(
      baseUrl,
      "/admin/food-items",
      customerCookie,
    );
    const deniedCreate = await postForm(
      baseUrl,
      "/admin/food-items",
      {
        name: "Denied Fiction",
        category: "Tests",
        description: "Must not be created.",
        price: "1.00",
        isAvailable: "on",
      },
      customerCookie,
    );
    const adminList = await getHtml(
      baseUrl,
      "/admin/food-items",
      adminCookie,
    );

    expect(anonymous.response.status).toBe(303);
    expect(anonymous.response.headers.get("location")).toBe("/login");
    expect(customer.response.status).toBe(403);
    expect(customer.html).toContain("Administrator access is required.");
    expect(deniedCreate.status).toBe(403);
    expect(adminList.response.status).toBe(200);
    expect(adminList.html).toContain("Administrator workspace");
    expect(adminList.html).toContain("Maple Garden Bowl");
    expect(adminList.html).toContain("Lakeside Apple Crumble");
    expect(adminList.html).toContain("Already disabled");
    expect(adminList.html).toContain("Add food item");
    expect(adminList.html).toContain("Manage food");

    const deniedCount = await pool.query(
      "SELECT count(*)::integer AS count FROM food_items WHERE name = $1",
      ["Denied Fiction"],
    );
    expect(deniedCount.rows[0].count).toBe(0);
  });

  test("creates an available food and exposes it on the public menu", async () => {
    const newForm = await getHtml(
      baseUrl,
      "/admin/food-items/new",
      adminCookie,
    );
    expect(newForm.response.status).toBe(200);
    expect(newForm.html).toContain("Create food item");

    const tampered = await postForm(
      baseUrl,
      "/admin/food-items",
      {
        name: "Aurora Test Tart",
        category: "Desserts",
        description: "A fictional berry tart for administrator testing.",
        price: "8.75",
        isAvailable: "on",
        id: "999999",
        role: "customer",
      },
      adminCookie,
    );
    expect(tampered.status).toBe(422);
    expect(auditEvents).toHaveLength(0);

    const response = await postForm(
      baseUrl,
      "/admin/food-items",
      {
        name: "Aurora Test Tart",
        category: "Desserts",
        description: "A fictional berry tart for administrator testing.",
        price: "8.75",
        isAvailable: "on",
      },
      adminCookie,
    );
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "/admin/food-items?notice=created",
    );

    const created = await pool.query(
      `
        SELECT
          id::text,
          name,
          category,
          description,
          price_cents,
          is_available
        FROM food_items
        WHERE name = $1
      `,
      ["Aurora Test Tart"],
    );
    expect(created.rows).toHaveLength(1);
    createdFoodId = created.rows[0].id;
    expect(created.rows[0]).toEqual({
      id: createdFoodId,
      name: "Aurora Test Tart",
      category: "Desserts",
      description: "A fictional berry tart for administrator testing.",
      price_cents: 875,
      is_available: true,
    });

    const publicMenu = await getHtml(baseUrl, "/");
    expect(publicMenu.response.status).toBe(200);
    expect(publicMenu.html).toContain("Aurora Test Tart");
    expect(publicMenu.html).toContain("$8.75");
    expect(auditEvents[0]).toEqual({
      action: "food.created",
      actorUserId: admin.id,
      entityType: "food_item",
      entityId: createdFoodId,
      result: "success",
    });
  });

  test("returns escaped controlled validation errors without database writes", async () => {
    const response = await postForm(
      baseUrl,
      "/admin/food-items",
      {
        name: "",
        category: "<script>alert(1)</script>",
        description: "invalid-food-sentinel",
        price: "-1",
        isAvailable: "unexpected",
      },
      adminCookie,
    );
    const html = await response.text();

    expect(response.status).toBe(422);
    expect(html).toContain("A request field is outside the allowed range.");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).not.toMatch(
      /PostgreSQL|constraint|food_items_|DatabaseUnavailableError|stack/i,
    );

    const invalidCount = await pool.query(
      `
        SELECT count(*)::integer AS count
        FROM food_items
        WHERE description = $1
      `,
      ["invalid-food-sentinel"],
    );
    expect(invalidCount.rows[0].count).toBe(0);

    const invalidUpdate = await postForm(
      baseUrl,
      `/admin/food-items/${createdFoodId}`,
      {
        name: "Should Not Persist",
        category: "Tests",
        description: "Invalid decimal precision.",
        price: "9.999",
        isAvailable: "on",
      },
      adminCookie,
    );
    expect(invalidUpdate.status).toBe(422);

    const unchanged = await pool.query(
      "SELECT name, price_cents FROM food_items WHERE id = $1",
      [createdFoodId],
    );
    expect(unchanged.rows[0]).toEqual({
      name: "Aurora Test Tart",
      price_cents: 875,
    });
    expect(auditEvents).toHaveLength(1);
  });

  test("edits the food and updates the public menu through PRG", async () => {
    const editForm = await getHtml(
      baseUrl,
      `/admin/food-items/${createdFoodId}/edit`,
      adminCookie,
    );
    expect(editForm.response.status).toBe(200);
    expect(editForm.html).toContain('value="Aurora Test Tart"');
    expect(editForm.html).toContain('value="8.75"');

    const response = await postForm(
      baseUrl,
      `/admin/food-items/${createdFoodId}`,
      {
        name: "Aurora Cloud Tart",
        category: "Seasonal",
        description: "An updated fictional tart.",
        price: "9.25",
        isAvailable: "on",
      },
      adminCookie,
    );
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "/admin/food-items?notice=updated",
    );

    const updated = await pool.query(
      `
        SELECT name, category, description, price_cents, is_available
        FROM food_items
        WHERE id = $1
      `,
      [createdFoodId],
    );
    expect(updated.rows[0]).toEqual({
      name: "Aurora Cloud Tart",
      category: "Seasonal",
      description: "An updated fictional tart.",
      price_cents: 925,
      is_available: true,
    });

    const publicMenu = await getHtml(baseUrl, "/");
    expect(publicMenu.html).toContain("Aurora Cloud Tart");
    expect(publicMenu.html).toContain("$9.25");
    expect(publicMenu.html).not.toContain("Aurora Test Tart");
    expect(auditEvents[1]).toEqual({
      action: "food.updated",
      actorUserId: admin.id,
      entityType: "food_item",
      entityId: createdFoodId,
      result: "success",
    });
  });

  test("disables idempotently and removes the food from the public menu", async () => {
    const first = await postForm(
      baseUrl,
      `/admin/food-items/${createdFoodId}/disable`,
      {},
      adminCookie,
    );
    const repeated = await postForm(
      baseUrl,
      `/admin/food-items/${createdFoodId}/disable`,
      {},
      adminCookie,
    );

    expect(first.status).toBe(303);
    expect(repeated.status).toBe(303);
    expect(first.headers.get("location")).toBe(
      "/admin/food-items?notice=disabled",
    );

    const disabled = await pool.query(
      "SELECT is_available FROM food_items WHERE id = $1",
      [createdFoodId],
    );
    expect(disabled.rows[0].is_available).toBe(false);

    const publicMenu = await getHtml(baseUrl, "/");
    expect(publicMenu.html).not.toContain("Aurora Cloud Tart");

    const adminList = await getHtml(
      baseUrl,
      "/admin/food-items?notice=disabled",
      adminCookie,
    );
    expect(adminList.html).toContain("Aurora Cloud Tart");
    expect(adminList.html).toContain("The food item was disabled.");
    expect(adminList.html).toContain("Already disabled");
    expect(auditEvents.slice(2)).toEqual([
      {
        action: "food.disabled",
        actorUserId: admin.id,
        entityType: "food_item",
        entityId: createdFoodId,
        result: "success",
      },
      {
        action: "food.disabled",
        actorUserId: admin.id,
        entityType: "food_item",
        entityId: createdFoodId,
        result: "success",
      },
    ]);
  });

  test("controls invalid and missing food identifiers", async () => {
    const invalidEdit = await getHtml(
      baseUrl,
      "/admin/food-items/not-an-id/edit",
      adminCookie,
    );
    const missingEdit = await getHtml(
      baseUrl,
      "/admin/food-items/999999999/edit",
      adminCookie,
    );
    const missingUpdate = await postForm(
      baseUrl,
      "/admin/food-items/999999999",
      {
        name: "Missing Fiction",
        category: "Tests",
        description: "",
        price: "1.00",
        isAvailable: "on",
      },
      adminCookie,
    );
    const missingDisable = await postForm(
      baseUrl,
      "/admin/food-items/999999999/disable",
      {},
      adminCookie,
    );

    for (const response of [
      invalidEdit.response,
      missingEdit.response,
      missingUpdate,
      missingDisable,
    ]) {
      expect(response.status).toBe(404);
      const html = response === invalidEdit.response
        ? invalidEdit.html
        : response === missingEdit.response
          ? missingEdit.html
          : await response.text();
      expect(html).toContain("The food item could not be found.");
      expect(html).not.toMatch(/PostgreSQL|constraint|stack trace/i);
    }
  });
});
