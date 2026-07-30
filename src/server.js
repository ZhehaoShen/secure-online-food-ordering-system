import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { createApplication } from "./app.js";
import {
  closeDatabasePool,
  createDatabasePool,
} from "./db/pool.js";
import { logEvent } from "./logger.js";
import { createFoodItemRepository } from "./repositories/food-item-repository.js";
import { removeServerPid, writeServerPid } from "./runtime-state.js";
import { createMenuService } from "./services/menu-service.js";

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 3000;
const SHUTDOWN_TIMEOUT_MS = 10_000;

function readPort(value) {
  if (value === undefined || value === "") {
    return DEFAULT_PORT;
  }

  const port = Number.parseInt(value, 10);

  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("PORT must be an integer between 1 and 65535.");
  }

  return port;
}

export function startServer({
  app = createApplication(),
  host = process.env.HOST || DEFAULT_HOST,
  port = readPort(process.env.PORT),
  recordPid = false,
} = {}) {
  const server = app.listen(port, host, () => {
    if (recordPid) {
      writeServerPid();
    }

    const address = server.address();
    const activePort =
      typeof address === "object" && address !== null ? address.port : port;

    logEvent("info", "server_listening", { host, port: activePort });
  });

  if (recordPid) {
    server.on("close", () => removeServerPid(process.pid));
  }

  return server;
}

function createRuntimeApplication(environment = process.env) {
  const pool = createDatabasePool({ environment });
  const foodItemRepository = createFoodItemRepository(pool);
  const menuService = createMenuService(foodItemRepository);

  return Object.freeze({
    app: createApplication({ menuService }),
    pool,
  });
}

function installShutdownHandlers(server, cleanup) {
  let shutdownStarted = false;

  function shutdown(signal) {
    if (shutdownStarted) {
      return;
    }

    shutdownStarted = true;
    logEvent("info", "server_shutdown_requested", { signal });

    const forcedExit = setTimeout(() => {
      removeServerPid(process.pid);
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    forcedExit.unref();

    server.close(async (error) => {
      clearTimeout(forcedExit);

      try {
        await cleanup();
      } catch (cleanupError) {
        logEvent("error", "server_cleanup_failed", {
          errorName: "DatabaseCleanupError",
          errorCode: "DATABASE_CLEANUP_ERROR",
        });
      }

      removeServerPid(process.pid);
      process.exit(error ? 1 : 0);
    });
  }

  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));
}

const invokedFile = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : null;

if (import.meta.url === invokedFile) {
  const runtime = createRuntimeApplication();
  const server = startServer({ app: runtime.app, recordPid: true });
  installShutdownHandlers(server, () => closeDatabasePool(runtime.pool));
}
