import pg from "pg";

const { Pool } = pg;

export function createVulnerableDemoPool(config) {
  if (
    !config ||
    config.databaseMarker !== "isolated-vulnerable-demo" ||
    config.dataClassification !== "fictional-only" ||
    config.database?.host !== "127.0.0.1" ||
    config.database?.database !== "food_ordering_vulnerable_demo" ||
    config.database?.user !== "food_ordering_vulnerable_demo"
  ) {
    throw new TypeError("An isolated vulnerable demo configuration is required.");
  }

  return new Pool({
    ...config.database,
    application_name: "isolated-vulnerable-demo",
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 5_000,
    max: 2,
    allowExitOnIdle: true,
  });
}

export async function closeVulnerableDemoPool(pool) {
  await pool.end();
}
