# Isolated Vulnerable Classroom Demo

> **LOCAL-ONLY INTENTIONALLY VULNERABLE CLASSROOM DEMO**
>
> Use only fictional data on this computer. Never deploy this application publicly or connect it to a real or production database.

This directory is isolated from the secure application on `develop`. It exists only to support controlled classroom comparisons using dummy data.

## Approved Day 4 baseline

The approved baseline marker is **`day4-isolated-vulnerable-baseline-2026-08-03`**.

This marker identifies the six prepared, fictional, local-only scenarios described below. It is a documentation marker, not a Git tag, public release, deployment, or claim that the corresponding secure milestones are complete.

- Day 4 later compares the SQL-injection payload with the secure application and implements the secure weak-password policy.
- Day 5 is the planned secure XSS, session, and authorization comparison milestone.
- Day 6 is the planned least-privilege database remediation milestone.

## Non-negotiable safety rules

1. Run only on `127.0.0.1` in a local classroom environment.
2. Never deploy, expose through a tunnel, bind to `0.0.0.0`, or place behind a public proxy.
3. Use only the dedicated `food_ordering_vulnerable_demo` PostgreSQL database and user.
4. Never reuse the secure application's database, session configuration, `.env`, account, password, or data.
5. Use only the seeded `.test` identities and fictional menu/order records.
6. Keep `demo/vulnerable/.env` local and ignored. Never commit its database password.
7. Every HTML page must include `views/partials/local-only-warning.ejs` so the warning remains visible during demonstrations and screenshots.
8. Stop the demo after the classroom scenario and reset the fictional fixtures before the next exercise.

## Dedicated fictional identities

These credentials are classroom-only and have no access outside the isolated demo database:

- Customer: `customer@vulnerable-demo.test` / `ClassroomCustomer!42`
- Administrator: `admin@vulnerable-demo.test` / `ClassroomAdmin!42`

The browser fixture preview displays names, reserved `.test` emails, roles, menu items, and one fictional order. It intentionally does not display passwords, password hashes, database credentials, session identifiers, or connection strings.

## Local setup boundary

1. Create only the dedicated local PostgreSQL database and user named in `.env.example`.
2. Copy `.env.example` to the ignored `demo/vulnerable/.env` and replace only the local demo database password placeholder.
3. Run `npm run demo:vulnerable:setup` to apply the project-relative schema and repeatable fictional seed.
4. Run `npm run demo:vulnerable:start` to bind the demo to `127.0.0.1`.
5. Stop the process with `Control-C` after the local exercise.

The startup interlock rejects production mode, normal application environment variables, public/external hosts, non-demo database names/users, missing markers, and placeholder passwords before opening a listener or database connection.

## Repeatable run, reset, and cleanup

Use the same sequence for every scenario:

1. Confirm the database and user are exactly `food_ordering_vulnerable_demo`, the hosts are exactly `127.0.0.1`, and the ignored `demo/vulnerable/.env` contains only `VULNERABLE_DEMO_*` configuration.
2. For first-time setup, run `npm run demo:vulnerable:setup`.
3. With the demo stopped, run `npm run demo:vulnerable:reset` before each comparison. Reset revalidates the exact database/user/marker, deletes only fixed fictional fixture rows, and reloads the same seed.
4. Run `npm run demo:vulnerable:start`, confirm the local-only warning is visible, and use only one documented action from the table below.
5. Stop the demo with `Control-C` immediately after the exercise.
6. Run `npm run demo:vulnerable:reset` once more so no scenario state carries into the next exercise.
7. Run `npm run test:demo` to verify interlocks, warning coverage, fictional data, target refusal, and repeatability for all six scenarios.

For complete local teardown, first stop the demo. Using local PostgreSQL administration tooling, confirm and remove only the exact `food_ordering_vulnerable_demo` database, then its exact same-named role; afterward remove only the ignored `demo/vulnerable/.env`. Never point cleanup at the secure database, another role, a broad directory, or an unresolved variable.

## Six controlled scenarios

“Secure expected result” records the intended comparison target. A future result is not claimed as implemented or verified here.

| Scenario | Fixed repeatable action | Expected vulnerable result | Secure expected result and schedule |
| --- | --- | --- | --- |
| SQL injection | Open `/scenarios/sql-injection`; run control `Classroom Veggie Wrap` for one item, then approved read-only payload `does-not-match%' OR '1'='1' -- ` for three items. | The injected condition changes the intentionally dynamic `SELECT` and returns all three fictional foods without writing data. | Day 4: the value remains a bound parameter or is rejected, query structure is unchanged, no database detail leaks, and the payload returns no expanded result. |
| Reflected XSS | Open `/scenarios/xss`; run the text control, then the approved SVG marker button. | Only the fixed raw sink creates `#xss-demo-marker` and changes the current page's `xssDemo` data marker; it performs no network or data action. | Day 5: output is escaped or sanitized, no marker element is created, and no event handler executes. |
| Weak password handling | Open `/scenarios/weak-password`; submit the fixed four-character classroom example. | The value is accepted without length, complexity, breached-password, hashing, or account policy and is not stored or tied to an account. | Day 4: registration rejects the value under the bounded strong-password policy while retaining scrypt hashing for approved passwords. |
| Unsafe session behavior | Open `/scenarios/unsafe-session`; start the fixed session, then reuse it in the same browser. | The same predictable demo-only cookie is issued without rotation/protective attributes and is trusted as the fictional customer when replayed. | Day 5: a random server-side session identifier is rotated, protected by the required cookie flags/expiry, and replay cannot reuse an invalidated session. |
| Missing administrator authorization | Open `/scenarios/missing-admin-authorization`; use the fictional-customer button. | The route observes role `customer` but still returns fictional administrator order `#1001`. | Day 5: centralized role authorization returns controlled `403` and no administrator order data. |
| Excessive database privileges | Open `/scenarios/excessive-database-privileges`; run the approved read-only catalog inspection. | The dedicated dummy user is database owner and reports database `CREATE`, schema `CREATE`, and fictional-users `TRUNCATE`; none is exercised. | Day 6: the application account is not owner and lacks create/truncate privileges while retaining only required runtime access. |

## Scenario safety boundaries

- Do not alter payloads, use semicolons/write statements, inspect a non-demo target, or add any real identity or record.
- The SQL, missing-authorization, and privilege routes verify the current database name, user, fictional-data classification, and isolation marker before querying.
- XSS is limited to a fixed page-only DOM marker; weak-password handling creates no account; the fixed unsafe cookie represents no secure or real session.
- Runtime scenario routes do not insert, update, delete, truncate, create, alter, or drop data/schema. Only setup/reset changes the dedicated fictional fixtures.
- Every HTML page includes the shared local-only warning and every scenario rejects undocumented input.
- The secure `src/` runtime neither imports nor mounts `demo/vulnerable` code.
