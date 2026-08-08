import {
  readServerPid,
  readVulnerablePid,
  removeServerPid,
  removeVulnerablePid,
} from "../src/runtime-state.js";

function stopProcess(pid, removePidFn, name) {
  if (pid === null) {
    return;
  }

  try {
    process.kill(pid, 0);
    process.kill(pid, "SIGTERM");
    removePidFn(pid);
    console.log(`Requested shutdown for ${name} process ${pid}.`);
  } catch (error) {
    if (error?.code === "ESRCH") {
      removePidFn(pid);
      console.log(`Removed stale ${name} PID file.`);
    } else {
      console.error(`Failed to shutdown ${name} process ${pid}:`, error.message);
    }
  }
}

const serverPid = readServerPid();
const vulnerablePid = readVulnerablePid();

if (serverPid === null && vulnerablePid === null) {
  console.log("No recorded application processes are running.");
  process.exit(0);
}

stopProcess(serverPid, removeServerPid, "Secure application");
stopProcess(vulnerablePid, removeVulnerablePid, "Vulnerable application");
