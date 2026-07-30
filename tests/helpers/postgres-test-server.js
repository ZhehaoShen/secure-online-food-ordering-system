import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";

const DATABASE_HOST = "127.0.0.1";
const DATABASE_NAME = "food_ordering_test";
const DATABASE_USER = "food_ordering_test_owner";
const EXECUTION_BUFFER_BYTES = 10 * 1024 * 1024;

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
  const configuredDirectories = [
    environment.POSTGRES_BIN,
    environment.PGBIN,
  ];
  const homebrewDirectories = [18, 17, 16, 15, 14].flatMap((version) => [
    `/opt/homebrew/opt/postgresql@${version}/bin`,
    `/usr/local/opt/postgresql@${version}/bin`,
  ]);
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
  const linuxDirectories = [18, 17, 16, 15, 14].map((version) =>
    `/usr/lib/postgresql/${version}/bin`,
  );
  const pathDirectories = (environment.PATH ?? "")
    .split(delimiter)
    .filter(Boolean);

  return [
    ...configuredDirectories,
    ...homebrewDirectories,
    ...windowsDirectories,
    ...linuxDirectories,
    ...pathDirectories,
  ].filter((directory, index, directories) =>
    directory && directories.indexOf(directory) === index,
  );
}

function executableFilename(name) {
  return process.platform === "win32" ? `${name}.exe` : name;
}

function findPostgresBinDirectory(environment) {
  const initdbFilename = executableFilename("initdb");
  const directory = postgresBinCandidates(environment).find((candidate) =>
    existsSync(join(candidate, initdbFilename)),
  );

  if (!directory) {
    throw new Error(
      "PostgreSQL test tools were not found. Install PostgreSQL or set POSTGRES_BIN.",
    );
  }

  return directory;
}

function commandFailureMessage(name, result) {
  const output = [result.stdout, result.stderr]
    .filter(Boolean)
    .join("\n")
    .trim()
    .slice(-4_000);

  return output
    ? `${name} failed while preparing the isolated test database:\n${output}`
    : `${name} failed while preparing the isolated test database.`;
}

function createCommandRunner(binDirectory, workingDirectory) {
  return (name, argumentsList, { allowFailure = false } = {}) => {
    const result = spawnSync(
      join(binDirectory, executableFilename(name)),
      argumentsList,
      {
        cwd: workingDirectory,
        encoding: "utf8",
        maxBuffer: EXECUTION_BUFFER_BYTES,
        shell: false,
        windowsHide: true,
      },
    );

    if (!allowFailure && (result.error || result.status !== 0)) {
      throw result.error ?? new Error(commandFailureMessage(name, result));
    }

    return result;
  };
}

function reservePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();

    server.unref();
    server.once("error", reject);
    server.listen(0, DATABASE_HOST, () => {
      const address = server.address();
      const port = typeof address === "object" ? address?.port : null;

      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        if (!port) {
          reject(new Error("Unable to reserve a PostgreSQL test port."));
          return;
        }

        resolve(port);
      });
    });
  });
}

export async function startPostgresTestServer({
  environment = process.env,
} = {}) {
  const rootDirectory = mkdtempSync(
    join(tmpdir(), "food-ordering-postgres-tests-"),
  );
  const dataDirectory = join(rootDirectory, "data");
  const logFile = join(rootDirectory, "postgres.log");
  const port = await reservePort();
  const binDirectory = findPostgresBinDirectory(environment);
  const run = createCommandRunner(binDirectory, rootDirectory);
  let started = false;

  const stop = async () => {
    if (started) {
      run(
        "pg_ctl",
        ["-D", dataDirectory, "-m", "fast", "-w", "stop"],
        { allowFailure: true },
      );
      started = false;
    }

    rmSync(rootDirectory, { recursive: true, force: true });
  };

  try {
    run("initdb", [
      "-D",
      dataDirectory,
      "--username",
      DATABASE_USER,
      "--auth-local",
      "trust",
      "--auth-host",
      "trust",
      "--no-locale",
      "--encoding",
      "UTF8",
    ]);
    run("pg_ctl", [
      "-D",
      dataDirectory,
      "-l",
      logFile,
      "-o",
      `-h ${DATABASE_HOST} -p ${port} -c fsync=off -c synchronous_commit=off -c full_page_writes=off`,
      "-w",
      "start",
    ]);
    started = true;
    run("createdb", [
      "--host",
      DATABASE_HOST,
      "--port",
      String(port),
      "--username",
      DATABASE_USER,
      DATABASE_NAME,
    ]);
  } catch (error) {
    await stop();
    throw error;
  }

  return Object.freeze({
    environment: Object.freeze({
      DATABASE_HOST,
      DATABASE_PORT: String(port),
      DATABASE_NAME,
      DATABASE_USER,
      DATABASE_PASSWORD: randomUUID(),
      DATABASE_SSL: "false",
    }),

    applySqlFile(file) {
      run("psql", [
        "--host",
        DATABASE_HOST,
        "--port",
        String(port),
        "--username",
        DATABASE_USER,
        "--dbname",
        DATABASE_NAME,
        "--set",
        "ON_ERROR_STOP=1",
        "--file",
        file,
      ]);
    },

    stop,
  });
}
