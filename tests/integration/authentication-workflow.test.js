import { randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";

import { createApplication } from "../../src/app.js";
import { readSessionConfig } from "../../src/config/session.js";
import {
  closeDatabasePool,
  createDatabasePool,
} from "../../src/db/pool.js";
import { createUserRepository } from "../../src/repositories/user-repository.js";
import { startServer } from "../../src/server.js";
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
const COOKIE_NAME = "food_ordering_test_sid";
const TEST_CLOCK_OFFSET_MILLISECONDS = 1_000;

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
  const setCookie = response.headers.get("set-cookie");
  return setCookie?.split(";", 1)[0] ?? null;
}

function loginBody(email, password) {
  return new URLSearchParams({ email, password });
}

async function submitLogin(baseUrl, email, password) {
  return fetch(`${baseUrl}/login`, {
    method: "POST",
    headers: {
      accept: "text/html",
      "content-type": "application/x-www-form-urlencoded",
    },
    body: loginBody(email, password),
    redirect: "manual",
  });
}

describe.sequential("authentication workflow", () => {
  let baseUrl;
  let authenticationNow;
  let customer;
  let customerEmail;
  let customerPassword;
  let databaseServer;
  let pool;
  let server;
  let sessionCookie;
  let sessionStore;
  let userService;

  beforeAll(async () => {
    databaseServer = await startPostgresTestServer();
    databaseServer.applySqlFile(SCHEMA_FILE);
    databaseServer.applySqlFile(SESSION_SCHEMA_FILE);
    pool = createDatabasePool({
      environment: databaseServer.environment,
      logger: () => {},
    });

    const userRepository = createUserRepository(pool);
    userService = createUserService(userRepository, {
      clock: () => new Date(authenticationNow),
    });
    customerEmail = `login-${randomUUID()}@example.test`;
    customerPassword = randomUUID();
    customer = await userService.createCustomer({
      name: "Login Fiction",
      email: customerEmail,
      password: customerPassword,
    });
    authenticationNow = new Date(
      customer.createdAt.getTime() + TEST_CLOCK_OFFSET_MILLISECONDS,
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
    const sessionMiddleware = createSessionMiddleware({
      store: sessionStore,
      config: sessionConfig,
    });
    sessionCookie = Object.freeze({
      name: sessionConfig.cookieName,
      secure: sessionConfig.secureCookie,
    });
    const menuService = {
      async getMenu() {
        return {
          foods: [],
          categories: [],
          selectedCategory: null,
        };
      },
    };
    const app = createApplication({
      menuService,
      sessionCookie,
      sessionMiddleware,
      userService,
    });
    const listening = await listen(app);
    baseUrl = listening.baseUrl;
    server = listening.server;
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

  test("renders the login form and safe registration notice", async () => {
    const response = await fetch(`${baseUrl}/login?registered=1`, {
      headers: { accept: "text/html" },
    });
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain("<title>Sign in · Northstar Kitchen</title>");
    expect(html).toContain("Account created. Sign in to continue.");
    expect(html).toContain('form method="post" action="/login"');
    expect(html).not.toContain('name="password" value=');
  });

  test("uses the same controlled response for unknown users and incorrect passwords", async () => {
    const wrongPassword = `wrong-${randomUUID()}`;
    const unknownEmail = `unknown-${randomUUID()}@example.test`;
    const unknownPassword = `unknown-${randomUUID()}`;
    const capturedLogs = [];
    const logSpy = vi.spyOn(console, "log").mockImplementation((value) => {
      capturedLogs.push(value);
    });
    let wrongPasswordResponse;
    let unknownUserResponse;

    try {
      wrongPasswordResponse = await submitLogin(
        baseUrl,
        customerEmail,
        wrongPassword,
      );
      unknownUserResponse = await submitLogin(
        baseUrl,
        unknownEmail,
        unknownPassword,
      );
    } finally {
      logSpy.mockRestore();
    }

    const wrongPasswordHtml = await wrongPasswordResponse.text();
    const unknownUserHtml = await unknownUserResponse.text();

    expect(wrongPasswordResponse.status).toBe(401);
    expect(unknownUserResponse.status).toBe(401);
    expect(wrongPasswordHtml).toContain(
      "Email or password is incorrect.",
    );
    expect(unknownUserHtml).toContain(
      "Email or password is incorrect.",
    );
    expect(wrongPasswordHtml).not.toContain("password_hash");
    expect(unknownUserHtml).not.toContain("DatabaseUnavailableError");
    const serializedLogs = JSON.stringify(capturedLogs);
    expect(serializedLogs).not.toContain(customerEmail);
    expect(serializedLogs).not.toContain(wrongPassword);
    expect(serializedLogs).not.toContain(unknownEmail);
    expect(serializedLogs).not.toContain(unknownPassword);
    expect(serializedLogs).not.toContain("password_hash");
  });

  test("applies a bounded temporary lock and resets safely after expiry", async () => {
    const lockoutEmail = `lockout-${randomUUID()}@example.test`;
    const lockoutPassword = `Lockout-Fictional-${randomUUID()}!`;
    const lockoutUser = await userService.createCustomer({
      name: "Lockout Workflow Fiction",
      email: lockoutEmail,
      password: lockoutPassword,
    });
    authenticationNow = new Date(
      lockoutUser.createdAt.getTime() + TEST_CLOCK_OFFSET_MILLISECONDS,
    );

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await submitLogin(
        baseUrl,
        lockoutEmail,
        `Wrong-Lockout-${attempt}!`,
      );
      expect(response.status).toBe(401);
      expect(await response.text()).toContain(
        "Email or password is incorrect.",
      );
    }

    const lockedResult = await pool.query(
      `
        SELECT failed_login_count, locked_until
        FROM users
        WHERE id = $1
      `,
      [lockoutUser.id],
    );
    expect(lockedResult.rows[0].failed_login_count).toBe(5);
    expect(lockedResult.rows[0].locked_until).toEqual(
      new Date(authenticationNow.getTime() + 5 * 60 * 1_000),
    );

    const protectedResponse = await submitLogin(
      baseUrl,
      lockoutEmail,
      lockoutPassword,
    );
    const protectedHtml = await protectedResponse.text();
    expect(protectedResponse.status).toBe(401);
    expect(protectedHtml).toContain("Email or password is incorrect.");
    expect(protectedHtml).not.toContain("locked");
    expect(protectedHtml).not.toContain(lockoutPassword);

    authenticationNow = new Date(
      authenticationNow.getTime() + 5 * 60 * 1_000,
    );
    await expect(userService.authenticate({
      email: lockoutEmail,
      password: lockoutPassword,
    })).resolves.toEqual(
      expect.objectContaining({ id: lockoutUser.id }),
    );

    const resetResult = await pool.query(
      `
        SELECT failed_login_count, locked_until
        FROM users
        WHERE id = $1
      `,
      [lockoutUser.id],
    );
    expect(resetResult.rows[0]).toEqual({
      failed_login_count: 0,
      locked_until: null,
    });
  });

  test("persists only the minimum authenticated identity in PostgreSQL", async () => {
    const response = await submitLogin(
      baseUrl,
      customerEmail.toUpperCase(),
      customerPassword,
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/");
    sessionCookie = cookiePair(response);
    expect(sessionCookie).toMatch(
      new RegExp(`^${COOKIE_NAME}=s%3A[A-Za-z0-9._%-]+$`),
    );
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("set-cookie")).toContain("SameSite=Lax");
    expect(response.headers.get("set-cookie")).not.toContain(customerEmail);
    expect(response.headers.get("set-cookie")).not.toContain(customerPassword);

    const result = await pool.query(
      'SELECT sess FROM "session" ORDER BY expire DESC',
    );
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].sess.user).toEqual({
      id: customer.id,
      name: customer.name,
      role: "customer",
    });
    const serializedSession = JSON.stringify(result.rows[0].sess);
    expect(serializedSession).not.toContain(customerEmail);
    expect(serializedSession).not.toContain(customerPassword);
    expect(serializedSession).not.toContain("passwordHash");
  });

  test("restores authenticated navigation and redirects anonymous-only pages", async () => {
    const menuResponse = await fetch(`${baseUrl}/`, {
      headers: {
        accept: "text/html",
        cookie: sessionCookie,
      },
    });
    const menuHtml = await menuResponse.text();

    expect(menuResponse.status).toBe(200);
    expect(menuHtml).toContain("Signed in as");
    expect(menuHtml).toContain(customer.name);
    expect(menuHtml).toContain('form class="nav-logout"');
    expect(menuHtml).not.toContain('href="/register"');
    expect(menuHtml).not.toContain('href="/login"');

    const loginResponse = await fetch(`${baseUrl}/login`, {
      headers: {
        accept: "text/html",
        cookie: sessionCookie,
      },
      redirect: "manual",
    });
    const registrationResponse = await fetch(`${baseUrl}/register`, {
      headers: {
        accept: "text/html",
        cookie: sessionCookie,
      },
      redirect: "manual",
    });

    expect(loginResponse.status).toBe(303);
    expect(loginResponse.headers.get("location")).toBe("/");
    expect(registrationResponse.status).toBe(303);
    expect(registrationResponse.headers.get("location")).toBe("/");
  });

  test("destroys the PostgreSQL session and clears authenticated navigation", async () => {
    const response = await fetch(`${baseUrl}/logout`, {
      method: "POST",
      headers: {
        accept: "text/html",
        cookie: sessionCookie,
      },
      redirect: "manual",
    });

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/login?signedOut=1");
    expect(response.headers.get("set-cookie")).toContain(`${COOKIE_NAME}=;`);

    const countResult = await pool.query(
      'SELECT count(*)::integer AS count FROM "session"',
    );
    expect(countResult.rows[0].count).toBe(0);

    const menuResponse = await fetch(`${baseUrl}/`, {
      headers: {
        accept: "text/html",
        cookie: sessionCookie,
      },
    });
    const menuHtml = await menuResponse.text();

    expect(menuHtml).toContain('href="/register"');
    expect(menuHtml).toContain('href="/login"');
    expect(menuHtml).not.toContain("Signed in as");
  });
});
