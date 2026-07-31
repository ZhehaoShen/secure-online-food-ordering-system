import { readdirSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(SCRIPT_DIRECTORY, "..");
const SOURCE_DIRECTORIES = ["scripts", "src", "tests"];

function javascriptFiles(directory) {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const path = resolve(directory, entry.name);

      if (entry.isDirectory()) {
        return javascriptFiles(path);
      }

      return entry.isFile() && extname(entry.name) === ".js" ? [path] : [];
    });
}

const files = [
  resolve(PROJECT_ROOT, "vitest.config.js"),
  ...SOURCE_DIRECTORIES.flatMap((directory) =>
    javascriptFiles(resolve(PROJECT_ROOT, directory)),
  ),
].sort();

for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], {
    cwd: PROJECT_ROOT,
    encoding: "utf8",
    shell: false,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout);
    process.exit(result.status ?? 1);
  }
}

console.log(`JavaScript syntax check passed for ${files.length} files.`);
