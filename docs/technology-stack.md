# Technology Stack Decision

- Decision date: July 30, 2026
- Status: Accepted for Day 2 implementation
- Primary development host: macOS 26.5.2 on Apple Silicon (`arm64`)

## Selected stack

| Area | Selection | Version baseline | Reason |
| --- | --- | --- | --- |
| Server runtime | Node.js with ECMAScript modules | Node.js `24.18.0` LTS; npm `11.16.0` | Current LTS line, official macOS and Windows binaries, mature HTTP and security ecosystem |
| Web framework | Express | `5.x` (initial package baseline `5.2.1`) | Small server-rendered application surface, clear middleware model, and ongoing Express 5 support |
| UI/template approach | EJS with semantic HTML, plain CSS, and minimal browser JavaScript | EJS `6.0.1` | Server-side output encoding by default with `<%= ... %>`, simple cross-platform build, and no client framework requirement |
| Database engine | PostgreSQL | PostgreSQL `18.4` | Supported current release with constraints, transactions, roles, auditing support, and native backup/restore tooling |
| Database driver | `pg` (node-postgres), pure JavaScript mode | `8.22.0` | Parameterized queries and portability without native compiler dependencies |
| Test framework | Vitest | `4.1.7` | Supports Node.js 24 and provides unit, integration, coverage, and CI-friendly test execution |
| Password hashing | Node.js `node:crypto` asynchronous `scrypt()` | Bundled with Node.js `24.18.0` | Memory-hard password derivation without a platform-specific native add-on; use a unique random salt of at least 16 bytes and constant-time comparison |
| Session library | `express-session` with `connect-pg-simple` | Current supported releases pinned by `package-lock.json` during setup | Server-side sessions persisted in PostgreSQL; avoids the development-only in-memory session store |

All npm dependencies will be installed as exact resolved versions in `package-lock.json`. Major-version selections above define the approved stack; dependency installation and lockfile creation belong to a later Day 2 step.

## Supported operating systems

### macOS

- Supported project baseline: macOS 15 or newer on Apple Silicon or Intel.
- Primary Day 2 development and screenshot environment: macOS 26.5.2 on Apple Silicon.
- Node.js 24 officially supports macOS 13.5 or newer, so the project baseline is within the supported range.
- PostgreSQL supports current macOS releases.

### Windows

- Supported project baseline: Windows 11 version 24H2 or newer on x64.
- Use native PowerShell; WSL is not required or supported by the project workflow.
- Node.js 24 officially supports 64-bit Windows 10 or newer. The project selects Windows 11 because it remains within Microsoft support during the project period.
- PostgreSQL provides a native 64-bit Windows installer and supports current Windows releases.

## Cross-platform implementation rules

- Provide native macOS Terminal and Windows PowerShell commands.
- Do not require Docker; it may be offered only as an optional workflow.
- Do not depend on Bash, Unix permissions, symbolic links, `/tmp`, or WSL.
- Resolve project, database, upload, log, and temporary paths with Node.js path and operating-system APIs.
- Use npm scripts for shared commands and avoid shell-specific syntax in `package.json`.
- Treat filename capitalization consistently and avoid Windows-reserved names.
- Keep application code, tests, migrations, and seed scripts identical on macOS and Windows.
- Run GitHub Actions on both `macos-latest` and `windows-latest`.

## Security implications

- Use `pg` parameter binding for all secure-version queries.
- Use PostgreSQL constraints and transactions for order integrity.
- Use separate migration/administration and least-privilege application database roles.
- Store sessions server-side in PostgreSQL; cookies contain only opaque session identifiers.
- Use asynchronous `scrypt()` with random salts for passwords and never log password material.
- Use EJS escaped interpolation for untrusted text; unescaped template output is prohibited unless reviewed and sanitized.
- Keep the intentionally vulnerable demonstration isolated from the secure application and from real data.

## Compatibility verification

| Component | macOS support | Windows support | Verification basis |
| --- | --- | --- | --- |
| Node.js `24.18.0` | Official Intel and Apple Silicon binaries; supported from macOS 13.5 | Official x64 and ARM64 installers; Windows 10 or newer supported | Node.js release and supported-platform documentation |
| Express `5.x` | Runs on supported Node.js versions | Runs on supported Node.js versions | Express 5 requires Node.js 18 or newer; Node.js 24 exceeds the requirement |
| EJS `6.x` | Node-hosted JavaScript package | Node-hosted JavaScript package | EJS supports ESM/CommonJS and has no operating-system-specific runtime requirement |
| PostgreSQL `18.4` | PostgreSQL supports current macOS releases | Native Windows installer; PostgreSQL supports current Windows releases | PostgreSQL supported-platform and download documentation |
| `pg` | Pure JavaScript driver under Node.js | Pure JavaScript driver under Node.js | node-postgres documents the JavaScript driver as the portable option without a compiler |
| Vitest `4.1.7` | Runs under Node.js 24 | Runs under Node.js 24 | Vitest requires Node.js 22.12 or newer; Node.js 24 exceeds the requirement |
| `node:crypto` `scrypt()` | Built into the official Node.js binary | Built into the official Node.js binary | Stable Node.js crypto API |
| `express-session` and `connect-pg-simple` | Node.js and PostgreSQL-backed | Node.js and PostgreSQL-backed | JavaScript session middleware and PostgreSQL storage; no OS-specific project code |

## Official references

- [Node.js release schedule and LTS status](https://nodejs.org/en/about/previous-releases)
- [Node.js 24.18.0 release and platform downloads](https://nodejs.org/en/blog/release/v24.18.0)
- [Node.js supported platforms](https://github.com/nodejs/node/blob/main/BUILDING.md)
- [Express version support](https://expressjs.com/en/support/)
- [EJS documentation](https://ejs.co/)
- [PostgreSQL versioning policy](https://www.postgresql.org/support/versioning/)
- [PostgreSQL supported platforms](https://www.postgresql.org/docs/current/supported-platforms.html)
- [PostgreSQL Windows installer](https://www.postgresql.org/download/windows/)
- [node-postgres portable JavaScript driver](https://node-postgres.com/features/native)
- [Vitest repository and runtime requirements](https://github.com/vitest-dev/vitest)
- [Node.js crypto documentation](https://nodejs.org/docs/latest-v24.x/api/crypto.html)
