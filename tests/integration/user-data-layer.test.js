import { randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, test } from "vitest";

import {
  closeDatabasePool,
  createDatabasePool,
  DatabaseUnavailableError,
} from "../../src/db/pool.js";
import { publicErrorDetails } from "../../src/errors.js";
import { createUserRepository } from "../../src/repositories/user-repository.js";
import { isSupportedPasswordHash } from "../../src/security/passwords.js";
import {
  createUserService,
  DuplicateAccountError,
} from "../../src/services/user-service.js";
import { startPostgresTestServer } from "../helpers/postgres-test-server.js";

const TEST_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(TEST_DIRECTORY, "../..");
const SCHEMA_FILE = resolve(PROJECT_ROOT, "db/schema.sql");
const SEED_FILE = resolve(PROJECT_ROOT, "db/seed.sql");

describe.sequential("user and authentication data layer", () => {
  let auditEvents;
  let databaseServer;
  let pool;
  let repository;
  let service;

  beforeAll(async () => {
    databaseServer = await startPostgresTestServer();
    databaseServer.applySqlFile(SCHEMA_FILE);
    databaseServer.applySqlFile(SEED_FILE);
    pool = createDatabasePool({
      environment: databaseServer.environment,
      logger: () => {},
    });
    repository = createUserRepository(pool);
    auditEvents = [];
    service = createUserService(repository, {
      auditRecorder: {
        async record(event) {
          auditEvents.push(event);
        },
      },
    });
  }, 60_000);

  afterAll(async () => {
    if (pool) {
      await closeDatabasePool(pool);
    }

    if (databaseServer) {
      await databaseServer.stop();
    }
  }, 30_000);

  test("normalizes and retrieves an existing fictional seed user", async () => {
    const user = await repository.findActiveByEmail(
      "avery.customer@example.test",
    );

    expect(user).toEqual(
      expect.objectContaining({
        name: "Avery Sample",
        email: "avery.customer@example.test",
        role: "customer",
      }),
    );
    expect(isSupportedPasswordHash(user.passwordHash)).toBe(true);
  });

  test("creates and authenticates a fictional customer without returning plaintext or hashes", async () => {
    const password = randomUUID();
    const email = `customer-${randomUUID()}@example.test`;
    const createdUser = await service.createCustomer({
      name: "  River Fiction  ",
      email: `  ${email.toUpperCase()}  `,
      password,
    });

    expect(createdUser).toEqual(
      expect.objectContaining({
        name: "River Fiction",
        email,
        role: "customer",
      }),
    );
    expect(createdUser).not.toHaveProperty("password");
    expect(createdUser).not.toHaveProperty("passwordHash");

    const storedUser = await repository.findActiveByEmail(email);
    expect(storedUser.passwordHash).not.toBe(password);
    expect(storedUser.passwordHash).not.toContain(password);
    expect(isSupportedPasswordHash(storedUser.passwordHash)).toBe(true);

    await expect(
      service.authenticate({ email: email.toUpperCase(), password }),
    ).resolves.toEqual(
      expect.objectContaining({
        id: createdUser.id,
        name: createdUser.name,
        email: createdUser.email,
        role: createdUser.role,
      }),
    );
    await expect(
      service.authenticate({ email, password: randomUUID() }),
    ).resolves.toBeNull();

    const serializedAudits = JSON.stringify(auditEvents);
    expect(serializedAudits).not.toContain(password);
    expect(serializedAudits).not.toContain(email);
    expect(auditEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "user.registered",
          result: "success",
        }),
        expect.objectContaining({
          action: "authentication.login",
          result: "success",
        }),
        expect.objectContaining({
          action: "authentication.login",
          result: "failure",
        }),
      ]),
    );
  });

  test("handles normalized duplicate email without exposing database details", async () => {
    const password = randomUUID();
    const email = `duplicate-${randomUUID()}@example.test`;

    await service.createCustomer({
      name: "First Fiction",
      email,
      password,
    });

    let duplicateError;

    try {
      await service.createCustomer({
        name: "Second Fiction",
        email: ` ${email.toUpperCase()} `,
        password: randomUUID(),
      });
    } catch (error) {
      duplicateError = error;
    }

    expect(duplicateError).toBeInstanceOf(DuplicateAccountError);
    const duplicateDetails = publicErrorDetails(duplicateError);
    expect(JSON.stringify(duplicateDetails)).not.toContain(email);
    expect(JSON.stringify(duplicateDetails)).not.toContain(
      "users_email_lower_unique",
    );

    const countResult = await pool.query(
      "SELECT count(*)::integer AS count FROM users WHERE email = $1",
      [email],
    );
    expect(countResult.rows[0].count).toBe(1);
  });

  test("uses parameter values rather than placing user input in SQL text", async () => {
    const calls = [];
    const capturedRepository = createUserRepository({
      async query(query) {
        calls.push(query);
        return { rows: [] };
      },
    });
    const input = `captured-${randomUUID()}@example.test`;

    await capturedRepository.findActiveByEmail(input);

    expect(calls[0].text).toContain("$1");
    expect(calls[0].text).not.toContain(input);
    expect(calls[0].values).toEqual([input]);
  });

  test("converts raw database failures to safe public details", async () => {
    const internalMessage =
      `password=${randomUUID()} host=private.example.test`;
    const failingRepository = createUserRepository({
      async query() {
        throw new Error(internalMessage);
      },
    });

    let observedError;

    try {
      await failingRepository.findActiveByEmail(
        "fictional.failure@example.test",
      );
    } catch (error) {
      observedError = error;
    }

    expect(observedError).toBeInstanceOf(DatabaseUnavailableError);
    const publicDetails = publicErrorDetails(observedError);
    expect(JSON.stringify(publicDetails)).not.toContain(internalMessage);
    expect(publicDetails).not.toHaveProperty("stack");
    expect(publicDetails).toEqual({
      statusCode: 503,
      code: "DATABASE_UNAVAILABLE",
      message: "The data service is temporarily unavailable.",
      errorName: "DatabaseUnavailableError",
    });
  });
});
