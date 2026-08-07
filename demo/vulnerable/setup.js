import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { readVulnerableDemoConfig } from "./config.js";
import {
  closeVulnerableDemoPool,
  createVulnerableDemoPool,
} from "./database.js";
import { verifyVulnerableDemoTarget } from "./target.js";

const DEMO_DIRECTORY = dirname(fileURLToPath(import.meta.url));

async function readSql(filename) {
  return readFile(resolve(DEMO_DIRECTORY, filename), "utf8");
}

export async function setupVulnerableDemo(environment = process.env) {
  const config = readVulnerableDemoConfig(environment);
  const pool = createVulnerableDemoPool(config);

  try {
    await pool.query(await readSql("schema.sql"));
    await pool.query(await readSql("seed.sql"));
    await verifyVulnerableDemoTarget(pool, config);
  } finally {
    await closeVulnerableDemoPool(pool);
  }
}

const invokedFile = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : null;

if (import.meta.url === invokedFile) {
  await setupVulnerableDemo();
}
