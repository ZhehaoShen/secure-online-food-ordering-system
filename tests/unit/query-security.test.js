import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

import { createFoodItemRepository } from "../../src/repositories/food-item-repository.js";
import { createOrderRepository } from "../../src/repositories/order-repository.js";
import { createUserRepository } from "../../src/repositories/user-repository.js";

const APPROVED_SQL_INJECTION_PAYLOAD =
  "does-not-match%' OR '1'='1' -- ";
const EXPECTED_REPOSITORY_QUERY_NAMES = Object.freeze([
  "food-items-list-admin",
  "food-items-find-by-id",
  "food-items-create",
  "food-items-update",
  "food-items-disable",
  "food-items-list-available",
  "food-items-list-available-by-category",
  "food-items-list-available-categories",
  "food-items-search-available",
  "food-items-list-available-by-ids",
  "food-items-find-available-by-id",
  "orders-list-admin",
  "orders-find-admin-detail",
  "orders-update-admin-status",
  "orders-list-customer-history",
  "orders-find-customer-detail",
  "orders-load-foods-for-checkout",
  "orders-insert-confirmed",
  "order-items-insert-snapshot",
  "users-find-active-by-email",
  "users-create-customer",
  "users-record-authentication-failure",
  "users-reset-authentication-failures",
]);
const FIXED_TRANSACTION_CONTROLS = Object.freeze([
  "BEGIN",
  "COMMIT",
  "ROLLBACK",
]);

function definedQueryNames(source) {
  return [...source.matchAll(
    /const\s+[A-Z0-9_]+_QUERY\s*=\s*\{\s*name:\s*"([^"]+)"/g,
  )]
    .map((match) => match[1]);
}

function foodRow() {
  return {
    id: "1",
    name: "Fictional Bound Food",
    category: "Fictional",
    description: "A fictional row returned by the query recorder.",
    price_cents: 100,
    is_available: true,
  };
}

function orderRow() {
  return {
    id: "1",
    user_id: "1",
    status: "confirmed",
    total_cents: 100,
    created_at: new Date("2026-08-03T00:00:00Z"),
    updated_at: new Date("2026-08-03T00:00:00Z"),
  };
}

function resultFor(query) {
  switch (query?.name) {
    case "food-items-create":
      return { rows: [foodRow()] };
    case "users-create-customer":
      return {
        rows: [{
          id: "1",
          name: "Fictional Bound User",
          email: "bound-user@example.test",
          role: "customer",
          created_at: new Date("2026-08-03T00:00:00Z"),
        }],
      };
    case "orders-load-foods-for-checkout":
      return { rows: [foodRow()] };
    case "orders-insert-confirmed":
      return { rows: [orderRow()] };
    case "order-items-insert-snapshot":
      return {
        rows: [{
          order_id: "1",
          food_item_id: "1",
          food_name_snapshot: "Fictional Bound Food",
          unit_price_cents: 100,
          quantity: 1,
        }],
      };
    default:
      return { rows: [] };
  }
}

function recordingDatabase() {
  const calls = [];
  const client = {
    async query(query) {
      calls.push(query);
      return typeof query === "string" ? { rows: [] } : resultFor(query);
    },
    release() {},
  };
  const pool = {
    async query(query) {
      calls.push(query);
      return resultFor(query);
    },
    async connect() {
      return client;
    },
  };

  return { calls, pool };
}

async function exerciseEveryRepositoryQuery(pool) {
  const foodRepository = createFoodItemRepository(pool);
  await foodRepository.listAllForAdministration();
  await foodRepository.findById(APPROVED_SQL_INJECTION_PAYLOAD);
  await foodRepository.create({
    name: APPROVED_SQL_INJECTION_PAYLOAD,
    category: APPROVED_SQL_INJECTION_PAYLOAD,
    description: APPROVED_SQL_INJECTION_PAYLOAD,
    priceCents: APPROVED_SQL_INJECTION_PAYLOAD,
    isAvailable: APPROVED_SQL_INJECTION_PAYLOAD,
  });
  await foodRepository.update({
    id: APPROVED_SQL_INJECTION_PAYLOAD,
    name: APPROVED_SQL_INJECTION_PAYLOAD,
    category: APPROVED_SQL_INJECTION_PAYLOAD,
    description: APPROVED_SQL_INJECTION_PAYLOAD,
    priceCents: APPROVED_SQL_INJECTION_PAYLOAD,
    isAvailable: APPROVED_SQL_INJECTION_PAYLOAD,
  });
  await foodRepository.disable(APPROVED_SQL_INJECTION_PAYLOAD);
  await foodRepository.listAvailable();
  await foodRepository.listAvailable({
    category: APPROVED_SQL_INJECTION_PAYLOAD,
  });
  await foodRepository.listAvailableCategories();
  await foodRepository.searchAvailable({
    query: APPROVED_SQL_INJECTION_PAYLOAD,
    category: APPROVED_SQL_INJECTION_PAYLOAD,
  });
  await foodRepository.listAvailableByIds([
    APPROVED_SQL_INJECTION_PAYLOAD,
  ]);
  await foodRepository.findAvailableById(APPROVED_SQL_INJECTION_PAYLOAD);

  const orderRepository = createOrderRepository(pool);
  await orderRepository.listAllForAdministration({
    status: APPROVED_SQL_INJECTION_PAYLOAD,
  });
  await orderRepository.findByIdForAdministration(
    APPROVED_SQL_INJECTION_PAYLOAD,
  );
  await orderRepository.updateStatus({
    orderId: APPROVED_SQL_INJECTION_PAYLOAD,
    expectedStatus: APPROVED_SQL_INJECTION_PAYLOAD,
    nextStatus: APPROVED_SQL_INJECTION_PAYLOAD,
  });
  await orderRepository.listByUserId(APPROVED_SQL_INJECTION_PAYLOAD);
  await orderRepository.findByIdForUser({
    orderId: APPROVED_SQL_INJECTION_PAYLOAD,
    userId: APPROVED_SQL_INJECTION_PAYLOAD,
  });
  await orderRepository.runInTransaction(async (transaction) => {
    await transaction.loadFoodsForCheckout([
      APPROVED_SQL_INJECTION_PAYLOAD,
    ]);
    await transaction.insertOrder({
      userId: APPROVED_SQL_INJECTION_PAYLOAD,
      totalCents: APPROVED_SQL_INJECTION_PAYLOAD,
    });
    await transaction.insertOrderItems([{
      orderId: APPROVED_SQL_INJECTION_PAYLOAD,
      foodItemId: APPROVED_SQL_INJECTION_PAYLOAD,
      foodNameSnapshot: APPROVED_SQL_INJECTION_PAYLOAD,
      unitPriceCents: APPROVED_SQL_INJECTION_PAYLOAD,
      quantity: APPROVED_SQL_INJECTION_PAYLOAD,
    }]);
  });

  const userRepository = createUserRepository(pool);
  await userRepository.findActiveByEmail(APPROVED_SQL_INJECTION_PAYLOAD);
  await userRepository.createCustomer({
    name: APPROVED_SQL_INJECTION_PAYLOAD,
    email: APPROVED_SQL_INJECTION_PAYLOAD,
    passwordHash: APPROVED_SQL_INJECTION_PAYLOAD,
  });
  await userRepository.recordAuthenticationFailure({
    userId: APPROVED_SQL_INJECTION_PAYLOAD,
    attemptedAt: APPROVED_SQL_INJECTION_PAYLOAD,
    threshold: APPROVED_SQL_INJECTION_PAYLOAD,
    lockedUntil: APPROVED_SQL_INJECTION_PAYLOAD,
  });
  await userRepository.resetAuthenticationFailures({
    userId: APPROVED_SQL_INJECTION_PAYLOAD,
    authenticatedAt: APPROVED_SQL_INJECTION_PAYLOAD,
  });
}

describe("secure query structure", () => {
  test("the inventory accounts for every named application query", async () => {
    const repositoryFiles = [
      "food-item-repository.js",
      "order-repository.js",
      "user-repository.js",
    ];
    const repositorySources = await Promise.all(repositoryFiles.map((file) =>
      readFile(resolve("src", "repositories", file), "utf8"),
    ));
    const repositoryQueryNames = repositorySources
      .flatMap(definedQueryNames)
      .sort();
    const poolSource = await readFile(resolve("src", "db", "pool.js"), "utf8");
    const inventory = await readFile(
      resolve("docs", "day4-security-inventory.md"),
      "utf8",
    );

    expect(repositoryQueryNames).toEqual(
      [...EXPECTED_REPOSITORY_QUERY_NAMES].sort(),
    );
    expect(repositoryQueryNames).toHaveLength(23);
    expect(poolSource.match(/name:\s*"application-database-health"/g))
      .toHaveLength(1);
    for (const name of [
      ...EXPECTED_REPOSITORY_QUERY_NAMES,
      "application-database-health",
    ]) {
      expect(inventory).toContain(`\`${name}\``);
    }
  });

  test("all 23 repository queries keep the matched payload in values", async () => {
    const database = recordingDatabase();
    await exerciseEveryRepositoryQuery(database.pool);
    const queryObjects = database.calls.filter((call) =>
      typeof call === "object",
    );
    const observedNames = [...new Set(queryObjects.map((query) => query.name))]
      .sort();

    expect(observedNames).toEqual(
      [...EXPECTED_REPOSITORY_QUERY_NAMES].sort(),
    );
    for (const query of queryObjects) {
      expect(query.name).toEqual(expect.any(String));
      expect(query.text).toEqual(expect.any(String));
      expect(query.text).not.toContain(APPROVED_SQL_INJECTION_PAYLOAD);
      expect(query.text).not.toContain("${");
    }
    const payloadCalls = queryObjects.filter((query) =>
      JSON.stringify(query.values ?? [])
        .includes(APPROVED_SQL_INJECTION_PAYLOAD),
    );
    expect(payloadCalls.length).toBeGreaterThan(0);
    expect(payloadCalls.every((query) => Array.isArray(query.values)))
      .toBe(true);
  });

  test("only fixed transaction controls are sent as SQL strings", async () => {
    const database = recordingDatabase();
    const orderRepository = createOrderRepository(database.pool);

    await orderRepository.runInTransaction(async () => "committed");
    await expect(orderRepository.runInTransaction(async () => {
      throw new Error("fictional rollback trigger");
    })).rejects.toMatchObject({ publicCode: "ORDER_NOT_CREATED" });

    const directStrings = database.calls.filter((call) =>
      typeof call === "string",
    );
    expect([...new Set(directStrings)].sort()).toEqual(
      [...FIXED_TRANSACTION_CONTROLS].sort(),
    );
    expect(directStrings.join(" ")).not.toContain(
      APPROVED_SQL_INJECTION_PAYLOAD,
    );
  });

  test("repository source contains no dynamic SQL interpolation", async () => {
    const repositorySource = (await Promise.all([
      "food-item-repository.js",
      "order-repository.js",
      "user-repository.js",
    ].map((file) => readFile(
      resolve("src", "repositories", file),
      "utf8",
    )))).join("\n");

    expect(repositorySource).not.toContain("${");
    expect(repositorySource).not.toMatch(/\.query\(\s*`/);
    expect(repositorySource.match(/client\.query\("(?:BEGIN|COMMIT|ROLLBACK)"\)/g))
      .toHaveLength(3);
  });
});
