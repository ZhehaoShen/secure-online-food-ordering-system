import { randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { createApplication } from "../../src/app.js";
import {
  closeDatabasePool,
  createDatabasePool,
} from "../../src/db/pool.js";
import { createUserRepository } from "../../src/repositories/user-repository.js";
import { isSupportedPasswordHash } from "../../src/security/passwords.js";
import { startServer } from "../../src/server.js";
import { createUserService } from "../../src/services/user-service.js";
import { startPostgresTestServer } from "../helpers/postgres-test-server.js";

const TEST_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(TEST_DIRECTORY, "../..");
const SCHEMA_FILE = resolve(PROJECT_ROOT, "db/schema.sql");

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

function registrationBody({
  name,
  email,
  password,
  passwordConfirmation = password,
} = {}) {
  return new URLSearchParams({
    ...(name === undefined ? {} : { name }),
    ...(email === undefined ? {} : { email }),
    ...(password === undefined ? {} : { password }),
    ...(passwordConfirmation === undefined
      ? {}
      : { passwordConfirmation }),
  });
}

async function submitRegistration(baseUrl, values) {
  return fetch(`${baseUrl}/register`, {
    method: "POST",
    headers: {
      accept: "text/html",
      "content-type": "application/x-www-form-urlencoded",
    },
    body: registrationBody(values),
    redirect: "manual",
  });
}

describe.sequential("registration workflow", () => {
  let baseUrl;
  let databaseServer;
  let pool;
  let repository;
  let server;

  beforeAll(async () => {
    databaseServer = await startPostgresTestServer();
    databaseServer.applySqlFile(SCHEMA_FILE);
    pool = createDatabasePool({
      environment: databaseServer.environment,
      logger: () => {},
    });
    repository = createUserRepository(pool);
    const userService = createUserService(repository);
    const app = createApplication({ userService });

    server = startServer({
      app,
      host: "127.0.0.1",
      port: 0,
    });
    await new Promise((resolveListening) => {
      server.once("listening", resolveListening);
    });
    const address = server.address();
    baseUrl = `http://127.0.0.1:${address.port}`;
  }, 60_000);

  afterAll(async () => {
    if (server) {
      await closeServer(server);
    }

    if (pool) {
      await closeDatabasePool(pool);
    }

    if (databaseServer) {
      await databaseServer.stop();
    }
  }, 30_000);

  test("renders an accessible registration form and navigation entry", async () => {
    const response = await fetch(`${baseUrl}/register`, {
      headers: { accept: "text/html" },
    });
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("x-powered-by")).toBeNull();
    expect(html).toContain("<title>Create account · Northstar Kitchen</title>");
    expect(html).toContain('form method="post" action="/register"');
    expect(html).toContain('href="/register"');
    expect(html).toContain("nav-link is-active");
    expect(html).toContain('autocomplete="new-password"');
    expect(html).not.toContain('name="password" value=');
  });

  test("creates a fictional customer and redirects with 303", async () => {
    const password = randomUUID();
    const email = `registration-${randomUUID()}@example.test`;
    const response = await submitRegistration(baseUrl, {
      name: "  Rowan Fiction  ",
      email: ` ${email.toUpperCase()} `,
      password,
    });

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/login?registered=1");
    expect(await response.text()).not.toContain(password);

    const storedUser = await repository.findActiveByEmail(email);
    expect(storedUser).toEqual(
      expect.objectContaining({
        name: "Rowan Fiction",
        email,
        role: "customer",
      }),
    );
    expect(isSupportedPasswordHash(storedUser.passwordHash)).toBe(true);
    expect(storedUser.passwordHash).not.toContain(password);
  });

  test("renders a controlled duplicate-account message without sensitive values", async () => {
    const password = randomUUID();
    const email = `registration-duplicate-${randomUUID()}@example.test`;

    const firstResponse = await submitRegistration(baseUrl, {
      name: "First Fiction",
      email,
      password,
    });
    expect(firstResponse.status).toBe(303);

    const response = await submitRegistration(baseUrl, {
      name: "Second Fiction",
      email: email.toUpperCase(),
      password: randomUUID(),
    });
    const html = await response.text();

    expect(response.status).toBe(422);
    expect(html).toContain(
      "An account could not be created with this email.",
    );
    expect(html).toContain(email.toUpperCase());
    expect(html).not.toContain(password);
    expect(html).not.toContain("users_email_lower_unique");
    expect(html).not.toContain("password_hash");
    expect(html).not.toContain("DatabaseUnavailableError");
    expect(html).not.toContain(" at ");

    const countResult = await pool.query(
      "SELECT count(*)::integer AS count FROM users WHERE email = $1",
      [email],
    );
    expect(countResult.rows[0].count).toBe(1);
  });

  test.each([
    {
      description: "missing name",
      values: {
        email: "missing-name@example.test",
        password: randomUUID(),
      },
      expectedMessage: "Enter a valid name",
    },
    {
      description: "malformed email",
      values: {
        name: "Malformed Email",
        email: "not-an-email",
        password: randomUUID(),
      },
      expectedMessage: "Enter a valid name",
    },
    {
      description: "missing password",
      values: {
        name: "Missing Password",
        email: "missing-password@example.test",
      },
      expectedMessage: "Password and password confirmation must match.",
    },
    {
      description: "mismatched confirmation",
      values: {
        name: "Mismatch Fiction",
        email: "mismatch@example.test",
        password: randomUUID(),
        passwordConfirmation: randomUUID(),
      },
      expectedMessage: "Password and password confirmation must match.",
    },
  ])("rejects $description", async ({ values, expectedMessage }) => {
    const response = await submitRegistration(baseUrl, values);
    const html = await response.text();

    expect(response.status).toBe(422);
    expect(html).toContain(expectedMessage);
    expect(html).not.toContain("password_hash");
    expect(html).not.toContain("DatabaseUnavailableError");

    if (values.email?.endsWith("@example.test")) {
      const countResult = await pool.query(
        "SELECT count(*)::integer AS count FROM users WHERE email = $1",
        [values.email.toLowerCase()],
      );
      expect(countResult.rows[0].count).toBe(0);
    }
  });
});
