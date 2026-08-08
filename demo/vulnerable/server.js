import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  removeVulnerablePid,
  writeVulnerablePid,
} from "../../src/runtime-state.js";
import { createVulnerableDemoApplication } from "./app.js";
import { readVulnerableDemoConfig } from "./config.js";
import {
  closeVulnerableDemoPool,
  createVulnerableDemoPool,
} from "./database.js";
import { emitLocalOnlyWarning } from "./safety.js";

export function startVulnerableDemo(
  environment = process.env,
  { warningWriter = console.warn } = {},
) {
  const config = readVulnerableDemoConfig(environment);
  const pool = createVulnerableDemoPool(config);
  const app = createVulnerableDemoApplication({ pool, config });
  emitLocalOnlyWarning(warningWriter);
  const server = app.listen(config.port, config.host);
  writeVulnerablePid(process.pid);

  return Object.freeze({
    server,
    async close() {
      await new Promise((resolveClose, rejectClose) => {
        server.close((error) => {
          if (error) {
            rejectClose(error);
            return;
          }

          resolveClose();
        });
      });
      await closeVulnerableDemoPool(pool);
      removeVulnerablePid(process.pid);
    },
  });
}

const invokedFile = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : null;

if (import.meta.url === invokedFile) {
  startVulnerableDemo();
}
