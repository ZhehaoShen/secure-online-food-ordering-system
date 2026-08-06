import { randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { createApplication } from "../../src/app.js";
import {
  closeDatabasePool,
  createDatabasePool,
} from "../../src/db/pool.js";
import { createFoodItemRepository } from "../../src/repositories/food-item-repository.js";
import { startServer } from "../../src/server.js";
import { createMenuService } from "../../src/services/menu-service.js";
import { startPostgresTestServer } from "../helpers/postgres-test-server.js";

const TEST_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(TEST_DIRECTORY, "../..");
const SCHEMA_FILE = resolve(PROJECT_ROOT, "db/schema.sql");
const SEED_FILE = resolve(PROJECT_ROOT, "db/seed.sql");
const APPROVED_SQL_INJECTION_PAYLOAD =
  "does-not-match%' OR '1'='1' -- ";

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

async function search(baseUrl, filters = {}) {
  const parameters = new URLSearchParams(filters);
  const response = await fetch(`${baseUrl}/search?${parameters}`, {
    headers: { accept: "text/html" },
  });

  return Object.freeze({
    response,
    html: await response.text(),
  });
}

describe.sequential("food search workflow", () => {
  let baseUrl;
  let databaseServer;
  let pool;
  let repository;
  let server;

  beforeAll(async () => {
    databaseServer = await startPostgresTestServer();
    databaseServer.applySqlFile(SCHEMA_FILE);
    databaseServer.applySqlFile(SEED_FILE);
    pool = createDatabasePool({
      environment: databaseServer.environment,
      logger: () => {},
    });
    repository = createFoodItemRepository(pool);
    const app = createApplication({
      menuService: createMenuService(repository),
    });
    const listening = await listen(app);
    baseUrl = listening.baseUrl;
    server = listening.server;
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

  test("searches available foods by case-insensitive name", async () => {
    const result = await search(baseUrl, { q: "WRAP" });

    expect(result.response.status).toBe(200);
    expect(result.html).toContain("Harbour Veggie Wrap");
    expect(result.html).toContain("1 result");
    expect(result.html).not.toContain("Maple Garden Bowl");
    expect(result.html).toContain("nav-link is-active");
  });

  test("searches by category and supports combined filters", async () => {
    const categoryResult = await search(baseUrl, {
      category: "drinks",
    });
    const combinedResult = await search(baseUrl, {
      q: "berry",
      category: "Drinks",
    });
    const noCombinedMatch = await search(baseUrl, {
      q: "berry",
      category: "Mains",
    });

    expect(categoryResult.html).toContain("Northern Berry Fizz");
    expect(categoryResult.html).not.toContain("Harbour Veggie Wrap");
    expect(combinedResult.html).toContain("Northern Berry Fizz");
    expect(combinedResult.html).toContain("1 result");
    expect(noCombinedMatch.html).toContain(
      "No available dishes match these filters.",
    );
  });

  test("excludes unavailable food and renders a clear no-result state", async () => {
    const unavailableResult = await search(baseUrl, { q: "apple" });
    const emptyResult = await search(baseUrl, {
      q: "fictional-no-match",
    });

    expect(unavailableResult.response.status).toBe(200);
    expect(unavailableResult.html).not.toContain(
      "Lakeside Apple Crumble",
    );
    expect(unavailableResult.html).toContain("0 results");
    expect(emptyResult.html).toContain(
      "No available dishes match these filters.",
    );
    expect(emptyResult.html).toContain("Clear search filters");
  });

  test("renders a controlled invalid-search state", async () => {
    const result = await search(baseUrl, { q: "x".repeat(121) });

    expect(result.response.status).toBe(422);
    expect(result.html).toContain("The search could not be completed.");
    expect(result.html).toContain("within the allowed lengths");
    expect(result.html).not.toContain("SearchQueryError");
    expect(result.html).not.toContain("DatabaseUnavailableError");
    expect(result.html).not.toContain(" at ");
  });

  test("treats the matched SQL-injection payload as a search value", async () => {
    const before = await pool.query(
      "SELECT count(*)::integer AS count FROM food_items",
    );
    const result = await search(baseUrl, {
      q: APPROVED_SQL_INJECTION_PAYLOAD,
    });
    const after = await pool.query(
      "SELECT count(*)::integer AS count FROM food_items",
    );

    expect(result.response.status).toBe(200);
    expect(result.html).toContain("0 results");
    expect(result.html).toContain(
      "No available dishes match these filters.",
    );
    expect(result.html).not.toContain("Harbour Veggie Wrap");
    expect(result.html).not.toContain("Northern Berry Fizz");
    expect(result.html).not.toMatch(
      /PostgreSQL|syntax error|food_items|DatabaseUnavailableError|stack trace/i,
    );
    expect(after.rows[0]).toEqual(before.rows[0]);
    expect(before.rows[0].count).toBe(6);
  });

  test("keeps search values in parameters and converts failures to a safe browser response", async () => {
    const capturedCalls = [];
    const marker = `search-${randomUUID()}`;
    const capturedRepository = createFoodItemRepository({
      async query(query) {
        capturedCalls.push(query);
        return { rows: [] };
      },
    });

    await capturedRepository.searchAvailable({
      query: marker,
      category: "Mains",
    });
    expect(capturedCalls[0].text).not.toContain(marker);
    expect(capturedCalls[0].values).toEqual([
      true,
      marker,
      "Mains",
    ]);

    const internalMessage =
      `password=${randomUUID()} host=private.example.test`;
    const failingRepository = createFoodItemRepository({
      async query() {
        throw new Error(internalMessage);
      },
    });
    const failingApp = createApplication({
      menuService: createMenuService(failingRepository),
    });
    const failingListening = await listen(failingApp);

    try {
      const result = await search(failingListening.baseUrl, {
        q: "soup",
      });

      expect(result.response.status).toBe(503);
      expect(result.html).toContain(
        "The data service is temporarily unavailable.",
      );
      expect(result.html).not.toContain(internalMessage);
      expect(result.html).not.toContain("password=");
      expect(result.html).not.toContain("DatabaseUnavailableError");
      expect(result.html).not.toContain(" at ");
    } finally {
      await closeServer(failingListening.server);
    }
  });
});
