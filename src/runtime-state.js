import {
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(SOURCE_DIRECTORY, "..");
const RUNTIME_DIRECTORY = resolve(PROJECT_ROOT, ".runtime");
const SERVER_PID_FILE = resolve(RUNTIME_DIRECTORY, "server.pid");

function isMissingFile(error) {
  return error?.code === "ENOENT";
}

export function writeServerPid(pid = process.pid) {
  mkdirSync(RUNTIME_DIRECTORY, { recursive: true });
  writeFileSync(SERVER_PID_FILE, `${pid}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
}

export function readServerPid() {
  let contents;

  try {
    contents = readFileSync(SERVER_PID_FILE, "utf8").trim();
  } catch (error) {
    if (isMissingFile(error)) {
      return null;
    }

    throw error;
  }

  const pid = Number.parseInt(contents, 10);

  if (!Number.isInteger(pid) || pid < 1 || String(pid) !== contents) {
    throw new Error("The server PID file is invalid.");
  }

  return pid;
}

export function removeServerPid(expectedPid) {
  if (expectedPid !== undefined) {
    const currentPid = readServerPid();

    if (currentPid === null || currentPid !== expectedPid) {
      return;
    }
  }

  try {
    unlinkSync(SERVER_PID_FILE);
  } catch (error) {
    if (!isMissingFile(error)) {
      throw error;
    }
  }
}
