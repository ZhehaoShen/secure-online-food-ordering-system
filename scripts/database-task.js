import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { delimiter, dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(SCRIPT_DIRECTORY, "..");
const SCHEMA_FILE = resolve(PROJECT_ROOT, "db", "schema.sql");
const SESSION_SCHEMA_FILE = resolve(PROJECT_ROOT, "db", "session-schema.sql");
const SEED_FILE = resolve(PROJECT_ROOT, "db", "seed.sql");
const SUPPORTED_TASKS = new Set(["migrate", "seed", "backup", "restore"]);

function versionDirectories(rootDirectory) {
  if (!rootDirectory || !existsSync(rootDirectory)) {
    return [];
  }

  return readdirSync(rootDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((left, right) =>
      right.localeCompare(left, undefined, { numeric: true }),
    )
    .map((version) => join(rootDirectory, version, "bin"));
}

function postgresBinCandidates(environment) {
  const windowsDirectories = [
    ...versionDirectories(
      environment.ProgramFiles
        ? join(environment.ProgramFiles, "PostgreSQL")
        : null,
    ),
    ...versionDirectories(
      environment["ProgramFiles(x86)"]
        ? join(environment["ProgramFiles(x86)"], "PostgreSQL")
        : null,
    ),
  ];
  const pathDirectories = (environment.PATH ?? "")
    .split(delimiter)
    .filter(Boolean);

  return [
    environment.POSTGRES_BIN,
    environment.PGBIN,
    ...[18, 17, 16, 15, 14].flatMap((version) => [
      `/opt/homebrew/opt/postgresql@${version}/bin`,
      `/usr/local/opt/postgresql@${version}/bin`,
    ]),
    ...windowsDirectories,
    ...[18, 17, 16, 15, 14].map(
      (version) => `/usr/lib/postgresql/${version}/bin`,
    ),
    ...pathDirectories,
  ].filter(
    (directory, index, directories) =>
      directory && directories.indexOf(directory) === index,
  );
}

function resolvePostgresCommand(name, environment) {
  const filename = process.platform === "win32" ? `${name}.exe` : name;
  const directory = postgresBinCandidates(environment).find((candidate) =>
    existsSync(join(candidate, filename)),
  );

  return directory ? join(directory, filename) : name;
}

function requiredEnvironment(name) {
  const value = process.env[name];

  if (!value || value.startsWith("replace_with_")) {
    throw new Error(`Set ${name} in the local .env file before continuing.`);
  }

  return value;
}

function databaseEnvironment() {
  const sslMode = process.env.DATABASE_SSL === "true" ? "require" : "prefer";

  return {
    ...process.env,
    PGPASSWORD: requiredEnvironment("MIGRATION_DATABASE_PASSWORD"),
    PGSSLMODE: sslMode,
  };
}

function connectionArguments() {
  return [
    "--host",
    process.env.DATABASE_HOST || "127.0.0.1",
    "--port",
    process.env.DATABASE_PORT || "5432",
    "--username",
    requiredEnvironment("MIGRATION_DATABASE_USER"),
    "--dbname",
    process.env.DATABASE_NAME || "food_ordering_dev",
  ];
}

function requireFile(path, description) {
  if (!existsSync(path)) {
    throw new Error(`${description} is not available yet: ${path}`);
  }
}

function run(command, argumentsList) {
  const executable = resolvePostgresCommand(command, process.env);
  const result = spawnSync(executable, argumentsList, {
    cwd: PROJECT_ROOT,
    env: databaseEnvironment(),
    shell: false,
    stdio: "inherit",
  });

  if (result.error) {
    if (result.error.code === "ENOENT") {
      throw new Error(
        `${command} was not found. Install PostgreSQL client tools or set POSTGRES_BIN.`,
      );
    }

    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function runMigration() {
  requireFile(SCHEMA_FILE, "Database schema");
  requireFile(SESSION_SCHEMA_FILE, "Session schema");
  run("psql", [
    ...connectionArguments(),
    "--set",
    "ON_ERROR_STOP=1",
    "--file",
    SCHEMA_FILE,
  ]);
  run("psql", [
    ...connectionArguments(),
    "--set",
    "ON_ERROR_STOP=1",
    "--file",
    SESSION_SCHEMA_FILE,
  ]);
}

function runSeed() {
  requireFile(SEED_FILE, "Database seed");
  run("psql", [
    ...connectionArguments(),
    "--set",
    "ON_ERROR_STOP=1",
    "--file",
    SEED_FILE,
  ]);
}

function runBackup() {
  const configuredDirectory = process.env.BACKUP_DIRECTORY || "backups";
  const backupDirectory = isAbsolute(configuredDirectory)
    ? configuredDirectory
    : resolve(PROJECT_ROOT, configuredDirectory);
  const timestamp = new Date().toISOString().replaceAll(":", "-");
  const backupFile = resolve(
    backupDirectory,
    `food-ordering-${timestamp}.dump`,
  );

  mkdirSync(backupDirectory, { recursive: true });
  run("pg_dump", [
    ...connectionArguments(),
    "--format",
    "custom",
    "--file",
    backupFile,
  ]);
  console.log(`Database backup created: ${backupFile}`);
}

function runRestore() {
  const input = process.argv[3];

  if (!input) {
    throw new Error(
      "Provide a backup path: npm run db:restore -- <backup-file>",
    );
  }

  const backupFile = isAbsolute(input) ? input : resolve(PROJECT_ROOT, input);
  requireFile(backupFile, "Database backup");
  run("pg_restore", [
    ...connectionArguments(),
    "--clean",
    "--if-exists",
    "--no-owner",
    "--exit-on-error",
    backupFile,
  ]);
}

const task = process.argv[2];

if (!SUPPORTED_TASKS.has(task)) {
  throw new Error(
    "Choose one database task: migrate, seed, backup, or restore.",
  );
}

if (task === "migrate") {
  runMigration();
} else if (task === "seed") {
  runSeed();
} else if (task === "backup") {
  runBackup();
} else {
  runRestore();
}
