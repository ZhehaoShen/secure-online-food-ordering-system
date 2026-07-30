# Secure Online Food Ordering System

A cross-platform, server-rendered food-ordering application built as a secure
software engineering project. The current Day 2 foundation provides an Express
server, a health endpoint, structured application logging, safe error responses,
and shared commands for macOS and native Windows.

## Selected stack

| Area | Technology |
| --- | --- |
| Runtime | Node.js `24.18.0` LTS and npm `11.16.0` |
| Server | Express `5.2.1` |
| Views | EJS `6.0.1`, semantic HTML, plain CSS, and minimal browser JavaScript |
| Database | PostgreSQL `18.4` with the pure-JavaScript `pg` `8.22.0` driver |
| Testing | Vitest `4.1.7` |
| Password hashing | Asynchronous Node.js `scrypt()` |
| Sessions | `express-session` with `connect-pg-simple` |

The complete rationale and platform compatibility record is in
[`docs/technology-stack.md`](docs/technology-stack.md).

## Project structure

| Path | Purpose |
| --- | --- |
| `src/` | Express application, server entry point, logging, and runtime state |
| `public/` | Browser-facing static assets |
| `views/` | Server-rendered EJS templates |
| `db/` | Database schema, migrations, and fictional seed data |
| `scripts/` | Cross-platform health, database, and shutdown commands |
| `tests/` | Unit and integration tests |
| `docs/` | Architecture, route, security-control, and stack documentation |
| `evidence/` | Reviewed project verification evidence |

Generated dependencies, `.env`, runtime PID files, logs, test output, and
database backups are ignored by Git.

## Prerequisites

- macOS 15 or newer, or Windows 11 24H2 or newer
- Node.js `24.18.0` and npm `11.16.0`
- PostgreSQL `18.4` and its `psql`, `pg_dump`, and `pg_restore` client tools
  on `PATH` before database commands are used
- Git

Use native Windows PowerShell. WSL, Bash, Docker, Unix permission commands, and
symbolic links are not required.

## macOS Terminal setup

From the project root:

```text
cp .env.example .env
npm ci --ignore-scripts
npm start
```

Replace every `replace_with_*` placeholder in `.env` with a local development
value before features that use those settings are enabled. Never commit `.env`.

In another Terminal window, check the running application:

```text
npm run healthcheck
```

Open `http://127.0.0.1:3000/health` to view the same health response. Stop the
foreground server with `Control-C`, or run this from another Terminal:

```text
npm run shutdown
```

## Windows PowerShell setup

From the project root:

```powershell
Copy-Item .env.example .env
npm ci --ignore-scripts
npm start
```

Replace every `replace_with_*` placeholder in `.env` with a local development
value before features that use those settings are enabled. Never commit `.env`.

In another PowerShell window, check the running application:

```powershell
npm run healthcheck
```

Open `http://127.0.0.1:3000/health` to view the same health response. Stop the
foreground server with `Ctrl+C`, or run this from another PowerShell window:

```powershell
npm run shutdown
```

## Shared package commands

These commands use Node.js or npm directly and do not contain shell-specific
operators or filesystem paths.

| Purpose | Command |
| --- | --- |
| Clean dependency install | `npm ci --ignore-scripts` or `npm run install:clean` |
| Start application | `npm start` |
| Check application health | `npm run healthcheck` |
| Run tests | `npm test` |
| Apply database schema/migrations | `npm run db:migrate` |
| Load fictional seed data | `npm run db:seed` |
| Create a custom-format backup | `npm run db:backup` |
| Restore a custom-format backup | `npm run db:restore -- <backup-file>` |
| Stop the recorded application process | `npm run shutdown` |

The database commands use the local `.env` values but never print database
passwords. `npm run db:migrate` applies the repeatable `db/schema.sql` file.
`npm run db:seed` loads repeatable fictional data from `db/seed.sql`. Seed
identities use reserved `.test` email addresses and store versioned scrypt hashes
only; no plaintext password or real personal information is included.

Backups are written beneath `BACKUP_DIRECTORY` (default: `backups/`) and are
ignored by Git. Restore uses `--clean`, so run it only against the intended local
development database.

## Current endpoints

| Method | Path | Result |
| --- | --- | --- |
| `GET` | `/health` | Safe JSON service-health response |
| `GET` | `/` | Database-driven menu with optional `category` filter |
| Any | Any unmatched path | Safe JSON `404` response with a request ID |

Browser requests receive the shared safe HTML error page; API-style requests
receive a generic JSON error. Request logs use an allowlist and do not include
headers, cookies, request bodies, query strings, passwords, tokens,
authorization values, error messages, or stack traces.
