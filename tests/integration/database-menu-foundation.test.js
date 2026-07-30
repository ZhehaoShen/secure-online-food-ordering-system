import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, test } from "vitest";

import {
  checkDatabaseConnection,
  closeDatabasePool,
  createDatabasePool,
} from "../../src/db/pool.js";
import { createFoodItemRepository } from "../../src/repositories/food-item-repository.js";
import { createMenuService } from "../../src/services/menu-service.js";
import { startPostgresTestServer } from "../helpers/postgres-test-server.js";

const TEST_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(TEST_DIRECTORY, "../..");
const SCHEMA_FILE = resolve(PROJECT_ROOT, "db/schema.sql");
const SEED_FILE = resolve(PROJECT_ROOT, "db/seed.sql");

const EXPECTED_TABLES = [
  "audit_logs",
  "food_items",
  "order_items",
  "orders",
  "users",
];
const EXPECTED_APPLICATION_INDEXES = [
  "audit_logs_action_history_index",
  "audit_logs_actor_history_index",
  "audit_logs_entity_history_index",
  "food_items_category_lower_index",
  "food_items_menu_browse_index",
  "food_items_name_lower_index",
  "order_items_food_item_index",
  "orders_status_review_index",
  "orders_user_history_index",
  "users_email_lower_unique",
];
const EXPECTED_SEED_COUNTS = Object.freeze({
  users: 3,
  foodItems: 6,
  orders: 2,
  orderItems: 4,
  auditLogs: 2,
});

async function readSeedCounts(pool) {
  const result = await pool.query(`
    SELECT
      (SELECT count(*)::integer FROM users) AS users,
      (SELECT count(*)::integer FROM food_items) AS "foodItems",
      (SELECT count(*)::integer FROM orders) AS orders,
      (SELECT count(*)::integer FROM order_items) AS "orderItems",
      (SELECT count(*)::integer FROM audit_logs) AS "auditLogs"
  `);

  return result.rows[0];
}

describe.sequential("database and menu foundation", () => {
  let databaseServer;
  let pool;

  beforeAll(async () => {
    databaseServer = await startPostgresTestServer();
    databaseServer.applySqlFile(SCHEMA_FILE);
    databaseServer.applySqlFile(SEED_FILE);
    pool = createDatabasePool({
      environment: databaseServer.environment,
      logger: () => {},
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

  test("creates the complete schema and can apply it repeatedly", async () => {
    databaseServer.applySqlFile(SCHEMA_FILE);

    const [tablesResult, constraintsResult, indexesResult] = await Promise.all([
      pool.query(`
        SELECT tablename
        FROM pg_tables
        WHERE schemaname = 'public'
        ORDER BY tablename
      `),
      pool.query(`
        SELECT constraint_type, count(*)::integer AS count
        FROM (
          SELECT
            CASE application_constraint.contype
              WHEN 'p' THEN 'primary_key'
              WHEN 'f' THEN 'foreign_key'
              WHEN 'c' THEN 'check'
            END AS constraint_type
          FROM pg_constraint AS application_constraint
          JOIN pg_class AS relation
            ON relation.oid = application_constraint.conrelid
          JOIN pg_namespace AS namespace
            ON namespace.oid = relation.relnamespace
          WHERE namespace.nspname = 'public'
            AND relation.relname = ANY($1::text[])
            AND application_constraint.contype IN ('p', 'f', 'c')
        ) AS application_constraints
        GROUP BY constraint_type
      `, [EXPECTED_TABLES]),
      pool.query(`
        SELECT indexname
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND indexname = ANY($1::text[])
        ORDER BY indexname
      `, [EXPECTED_APPLICATION_INDEXES]),
    ]);

    const constraintCounts = Object.fromEntries(
      constraintsResult.rows.map((row) => [
        row.constraint_type,
        row.count,
      ]),
    );

    expect(tablesResult.rows.map((row) => row.tablename)).toEqual(
      EXPECTED_TABLES,
    );
    expect(constraintCounts).toEqual({
      check: 30,
      foreign_key: 4,
      primary_key: 5,
    });
    expect(indexesResult.rows.map((row) => row.indexname)).toEqual(
      EXPECTED_APPLICATION_INDEXES,
    );
  });

  test("loads the fictional seed repeatedly without duplicating rows", async () => {
    const beforeSecondLoad = await readSeedCounts(pool);

    databaseServer.applySqlFile(SEED_FILE);

    const afterSecondLoad = await readSeedCounts(pool);
    const seedSafety = await pool.query(`
      SELECT
        bool_and(email LIKE '%@example.test') AS fictional_emails,
        bool_and(password_hash LIKE 'scrypt$v1$%') AS versioned_hashes,
        bool_and(NOT details::text ~* '(password|token|secret|session)') AS safe_audits
      FROM users
      CROSS JOIN audit_logs
    `);

    expect(beforeSecondLoad).toEqual(EXPECTED_SEED_COUNTS);
    expect(afterSecondLoad).toEqual(EXPECTED_SEED_COUNTS);
    expect(seedSafety.rows[0]).toEqual({
      fictional_emails: true,
      versioned_hashes: true,
      safe_audits: true,
    });
  });

  test("connects to a real PostgreSQL database", async () => {
    await expect(checkDatabaseConnection(pool)).resolves.toBe(true);
  });

  test("retrieves available menu items and supports category filtering", async () => {
    const repository = createFoodItemRepository(pool);
    const service = createMenuService(repository);

    const menu = await service.getMenu();
    const drinks = await service.getMenu({ category: " drinks " });

    expect(menu.categories).toEqual([
      "Desserts",
      "Drinks",
      "Mains",
      "Sides",
    ]);
    expect(menu.foods).toHaveLength(5);
    expect(menu.foods.every((food) => food.isAvailable)).toBe(true);
    expect(menu.foods.map((food) => food.name)).not.toContain(
      "Lakeside Apple Crumble",
    );
    expect(menu.foods[0]).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        name: expect.any(String),
        category: expect.any(String),
        description: expect.any(String),
        priceCents: expect.any(Number),
        isAvailable: true,
      }),
    );
    expect(drinks.selectedCategory).toBe("drinks");
    expect(drinks.foods).toEqual([
      expect.objectContaining({
        name: "Northern Berry Fizz",
        category: "Drinks",
        priceCents: 399,
        isAvailable: true,
      }),
    ]);
  });

  test("returns a safe empty menu when no food is available", async () => {
    const client = await pool.connect();

    try {
      await client.query("BEGIN");
      await client.query("UPDATE food_items SET is_available = false");

      const repository = createFoodItemRepository(client);
      const service = createMenuService(repository);

      await expect(service.getMenu()).resolves.toEqual({
        foods: [],
        categories: [],
        selectedCategory: null,
      });
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });
});
