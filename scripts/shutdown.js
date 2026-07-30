import { removeServerPid, readServerPid } from "../src/runtime-state.js";

const pid = readServerPid();

if (pid === null) {
  console.log("No recorded application process is running.");
  process.exit(0);
}

try {
  process.kill(pid, 0);
} catch (error) {
  if (error?.code === "ESRCH") {
    removeServerPid(pid);
    console.log("Removed a stale application PID file.");
    process.exit(0);
  }

  throw error;
}

process.kill(pid, "SIGTERM");
removeServerPid(pid);
console.log(`Requested shutdown for application process ${pid}.`);
