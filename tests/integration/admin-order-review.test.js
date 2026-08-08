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
import { createOrderRepository } from "../../src/repositories/order-repository.js";
import { createUserRepository } from "../../src/repositories/user-repository.js";
import { hashPassword } from "../../src/security/passwords.js";
import { startServer } from "../../src/server.js";
import { createAdminOrderService } from "../../src/services/admin-order-service.js";
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
const COOKIE_NAME = "food_ordering_admin_order_test_sid";

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

describe.sequential("administrator order review", () => {
  const auditEvents = [];
  let admin;
  let adminCookie;
  let averyOrder;
  let baseUrl;
  let customerCookie;
  let databaseServer;
  let morganOrder;
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

    const adminEmail = `admin-order-${randomUUID()}@example.test`;
    const adminPassword = randomUUID();
    const adminHash = await hashPassword(adminPassword);
    const adminResult = await pool.query(
      `
        INSERT INTO users (name, email, password_hash, role)
        VALUES ($1, $2, $3, 'admin')
        RETURNING id::text, name, email, role
      `,
      ["Order Admin Fiction", adminEmail, adminHash],
    );
    admin = adminResult.rows[0];

    const userService = createUserService(createUserRepository(pool));
    const customerEmail = `order-review-customer-${randomUUID()}@example.test`;
    const customerPassword = randomUUID();
    await userService.createCustomer({
      name: "Order Review Customer Fiction",
      email: customerEmail,
      password: customerPassword,
    });

    const seededOrders = await pool.query(`
      SELECT
        customer_order.id::text,
        customer.email,
        customer_order.status,
        customer_order.total_cents
      FROM orders AS customer_order
      JOIN users AS customer
        ON customer.id = customer_order.user_id
      WHERE customer.email IN (
        'avery.customer@example.test',
        'morgan.customer@example.test'
      )
    `);
    averyOrder = seededOrders.rows.find(
      (order) => order.email === "avery.customer@example.test",
    );
    morganOrder = seededOrders.rows.find(
      (order) => order.email === "morgan.customer@example.test",
    );

    const adminOrderService = createAdminOrderService(
      createOrderRepository(pool),
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
      adminOrderService,
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

  test("requires an administrator for list, detail, and updates", async () => {
    const anonymous = await getHtml(baseUrl, "/admin/orders");
    const customerList = await getHtml(
      baseUrl,
      "/admin/orders",
      customerCookie,
    );
    const customerDetail = await getHtml(
      baseUrl,
      `/admin/orders/${morganOrder.id}`,
      customerCookie,
    );
    const customerUpdate = await postForm(
      baseUrl,
      `/admin/orders/${morganOrder.id}/status`,
      { status: "preparing" },
      customerCookie,
    );

    expect(anonymous.response.status).toBe(303);
    expect(anonymous.response.headers.get("location")).toBe("/login");
    expect(customerList.response.status).toBe(403);
    expect(customerDetail.response.status).toBe(403);
    expect(customerUpdate.status).toBe(403);
  });

  test("lists customer orders and applies an allowed status filter", async () => {
    const all = await getHtml(baseUrl, "/admin/orders", adminCookie);
    expect(all.response.status).toBe(200);
    expect(all.html).toContain("Avery Sample");
    expect(all.html).toContain("avery.customer@example.test");
    expect(all.html).toContain("Morgan Example");
    expect(all.html).toContain("morgan.customer@example.test");
    expect(all.html).toContain("$20.97");
    expect(all.html).toContain("$18.98");
    expect(all.html).toContain("Manage orders");

    const confirmed = await getHtml(
      baseUrl,
      "/admin/orders?status=confirmed",
      adminCookie,
    );
    expect(confirmed.response.status).toBe(200);
    expect(confirmed.html).toContain("Morgan Example");
    expect(confirmed.html).not.toContain("Avery Sample");
    expect(confirmed.html).toMatch(/value="confirmed"\s+selected/);

    const empty = await getHtml(
      baseUrl,
      "/admin/orders?status=cancelled",
      adminCookie,
    );
    expect(empty.response.status).toBe(200);
    expect(empty.html).toContain("No customer orders match this view.");

    const invalid = await getHtml(
      baseUrl,
      "/admin/orders?status=not-real",
      adminCookie,
    );
    expect(invalid.response.status).toBe(422);
    expect(invalid.html).toContain("The order status is invalid.");
    expect(invalid.html).not.toMatch(/PostgreSQL|constraint|stack trace/i);
  });

  test("renders customer and line-item detail for an order", async () => {
    const detail = await getHtml(
      baseUrl,
      `/admin/orders/${morganOrder.id}`,
      adminCookie,
    );

    expect(detail.response.status).toBe(200);
    expect(detail.html).toContain(`#${morganOrder.id}`);
    expect(detail.html).toContain("Morgan Example");
    expect(detail.html).toContain("morgan.customer@example.test");
    expect(detail.html).toContain("Harbour Veggie Wrap");
    expect(detail.html).toContain("Cedar Lentil Soup");
    expect(detail.html).toContain("$10.99 each");
    expect(detail.html).toContain("$7.99 each");
    expect(detail.html).toContain("$18.98");
    expect(detail.html).toContain('value="preparing"');
    expect(detail.html).toContain('value="cancelled"');
  });

  test("applies valid status transitions with server-owned actor and state", async () => {
    const tampered = await postForm(
      baseUrl,
      `/admin/orders/${morganOrder.id}/status`,
      {
        status: "preparing",
        actorUserId: "1",
        role: "customer",
        currentStatus: "cancelled",
      },
      adminCookie,
    );
    expect(tampered.status).toBe(422);
    expect(auditEvents).toHaveLength(0);
    const unchanged = await pool.query(
      "SELECT status FROM orders WHERE id = $1",
      [morganOrder.id],
    );
    expect(unchanged.rows[0].status).toBe("confirmed");

    const preparing = await postForm(
      baseUrl,
      `/admin/orders/${morganOrder.id}/status`,
      { status: "preparing" },
      adminCookie,
    );
    expect(preparing.status).toBe(303);
    expect(preparing.headers.get("location")).toBe(
      `/admin/orders/${morganOrder.id}?notice=updated`,
    );

    const preparingDetail = await getHtml(
      baseUrl,
      preparing.headers.get("location"),
      adminCookie,
    );
    expect(preparingDetail.html).toContain(
      "The order status was updated.",
    );
    expect(preparingDetail.html).toContain("Current: Preparing");
    expect(preparingDetail.html).toContain('value="completed"');
    expect(preparingDetail.html).toContain('value="cancelled"');

    const completed = await postForm(
      baseUrl,
      `/admin/orders/${morganOrder.id}/status`,
      { status: "completed" },
      adminCookie,
    );
    expect(completed.status).toBe(303);

    const stored = await pool.query(
      "SELECT status FROM orders WHERE id = $1",
      [morganOrder.id],
    );
    expect(stored.rows[0].status).toBe("completed");
    expect(auditEvents).toEqual([
      {
        action: "order.status_updated",
        actorUserId: admin.id,
        entityType: "order",
        entityId: morganOrder.id,
        result: "success",
      },
      {
        action: "order.status_updated",
        actorUserId: admin.id,
        entityType: "order",
        entityId: morganOrder.id,
        result: "success",
      },
    ]);
  });

  test("rejects invalid statuses and disallowed terminal-state transitions", async () => {
    const invalidStatus = await postForm(
      baseUrl,
      `/admin/orders/${morganOrder.id}/status`,
      { status: "refunded" },
      adminCookie,
    );
    expect(invalidStatus.status).toBe(422);
    expect(await invalidStatus.text()).toContain(
      "The order status is invalid.",
    );

    const backwards = await postForm(
      baseUrl,
      `/admin/orders/${morganOrder.id}/status`,
      { status: "preparing" },
      adminCookie,
    );
    const backwardsHtml = await backwards.text();
    expect(backwards.status).toBe(409);
    expect(backwardsHtml).toContain(
      "That order status change is not allowed.",
    );
    expect(backwardsHtml).toContain(
      "No further status changes are allowed.",
    );

    const stored = await pool.query(
      "SELECT status FROM orders WHERE id = $1",
      [morganOrder.id],
    );
    expect(stored.rows[0].status).toBe("completed");
    expect(auditEvents).toHaveLength(2);
  });

  test("controls invalid and missing order identifiers", async () => {
    const invalid = await getHtml(
      baseUrl,
      "/admin/orders/not-an-id",
      adminCookie,
    );
    const missing = await getHtml(
      baseUrl,
      "/admin/orders/999999999",
      adminCookie,
    );
    const missingUpdate = await postForm(
      baseUrl,
      "/admin/orders/999999999/status",
      { status: "preparing" },
      adminCookie,
    );

    for (const response of [invalid.response, missing.response]) {
      expect(response.status).toBe(404);
    }
    expect(invalid.html).toContain("The order could not be found.");
    expect(missing.html).toContain("The order could not be found.");
    expect(missingUpdate.status).toBe(404);
    expect(await missingUpdate.text()).toContain(
      "The order could not be found.",
    );
    expect(auditEvents).toHaveLength(2);
  });
});
