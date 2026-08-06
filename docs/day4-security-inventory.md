# Day 4 Security Traceability and Inventory

- Project: Secure Online Food Ordering System
- Inventory date: August 3, 2026
- Baseline commit: `c460a29fb12835e8bb72760ea65374bba70e20d4`
- Baseline branch: `develop`
- Source requirement: `ProjectPlan.md`, Day 4 — Vulnerable Baseline and Core Security
- Status: Steps 8–18 secure controls, consolidated automated verification, complete local verification, and reviewed evidence are complete; delivery remains pending

## 1. Status legend and scope

| Status | Meaning |
| --- | --- |
| Verified baseline | Present in the completed Day 3 implementation and statically confirmed in this inventory |
| Day 4 remediation | Required before Day 4 can be accepted |
| Day 4 demonstration | Required only in the isolated vulnerable baseline |
| Deferred Day 5 | XSS prevention testing, session rotation/expiry/logout-reuse hardening, adversarial RBAC, or cross-user access testing |
| Deferred Day 6 | Least-privilege application database role, persistent audit implementation, backup, restore, or recovery |

The secure runtime remains on `develop`. Intentionally vulnerable behavior must exist only on the isolated local `demo/vulnerable` branch, use fictional data and separate configuration/database state, display local-only warnings, and never be deployed publicly.

## 2. Day 4 requirement traceability

| Day 4 requirement | Current baseline | Required Day 4 action | Planned verification |
| --- | --- | --- | --- |
| Isolated vulnerable baseline | No vulnerable source exists on `develop` | Create the local `demo/vulnerable` branch with separate startup, configuration, database, dummy data, warnings, and interlocks | Demo refuses normal/production configuration; secure runtime has no demo import/route; six fictional scenarios repeat safely |
| SQL injection demonstration | No intentionally vulnerable SQL exists | Add one controlled login or search SQL-injection scenario only in the isolated demo | Approved non-destructive payload changes only the vulnerable fictional result |
| XSS, weak password, unsafe session, missing admin authorization, and excessive privilege demonstrations | Not present | Prepare five narrowly labeled fictional vulnerable scenarios in the isolated demo | Each scenario has repeatable steps and expected vulnerable/secure outcomes; secure Day 5/6 remediation is not claimed |
| Query inventory and parameterization | All 23 repository queries use fixed SQL; all value-bearing queries bind parameters | Reconcile every query below and add structural/matched SQL-injection tests; replace any discrepancy found | Every repository query is accounted for; secure payload remains a value and cannot change query structure |
| Registration, login, search, order, and administrator validation | Per-service type/length/range checks exist | Add exact allowed-field handling, duplicate/unexpected-field rejection, consistent scalar/type rules, and boundary tests | Invalid/missing/duplicate/unexpected/type/range inputs are controlled and do not reach writes |
| IDs, quantities, prices, and roles | Positive bigint, quantity, CAD price, status, and role controls mostly exist | Consolidate and apply them uniformly at every relevant route/body boundary | Invalid food/user/order IDs, quantities, prices, roles, owners, totals, and statuses are rejected or server-derived |
| Password hashing | Versioned asynchronous scrypt with random salt and constant-time verification exists | Completed in Step 13: enforce the bounded Unicode-safe registration policy while retaining broader login bounds for supported seed hashes | Weak/over-limit passwords fail; strong fictional passwords register/authenticate; equal passwords hash differently; plaintext is absent |
| Generic login errors | Unknown account and wrong password share one message | Preserve parity while adding failed-login protection | Same browser response for both failures; repeated failures trigger bounded delay/temporary lockout |
| Failed-login protection | Completed in Step 14: known-account failures use capped database state; unknown accounts use dummy scrypt without allocating state | Five failures trigger a five-minute lock; correct credentials remain generically denied during the lock; expiry/success resets safely | Deterministic threshold, active-lock, expiry/reset, unknown-account parity/no-growth, and output-leakage tests pass |
| Sensitive values in logs | Structured logger allowlists primitive diagnostic fields; errors are public-mapped | Completed in Step 15: reviewed controllers, services, repositories, sessions, audit placeholders, public errors, and logging; added direct and HTTP leakage regressions | No password/hash/connection string/session ID/secret/raw database detail in output or logs; 25 focused and 61 database-backed tests pass |
| Client control of trusted values | Price, total, owner, role, status, item snapshots, and audit actor are mostly server-derived | Reject unexpected trusted fields explicitly and verify all write paths | Tampered fields cannot affect stored price, total, owner, role, status, snapshots, or actor |
| Day 4 evidence and delivery | Step 18 completed both reviewed matched screenshots and the evidence entry | Commit the secure work/evidence, retain the local demo baseline unless source delivery is required, and verify both CI platforms | Exact screenshots and evidence entry are verified; required secure commit, remote SHA, and macOS/Windows CI success remain delivery work |

## 3. SQL query inventory

### 3.1 Food repository — 11 fixed query definitions

Source: `src/repositories/food-item-repository.js`

| Query name | Operation and bindings | Current assessment | Day 4 planned test |
| --- | --- | --- | --- |
| `food-items-list-admin` | Fixed administrator list; no user values; hard limit 200 | Verified baseline | Inventory/static assertion; administrator regression |
| `food-items-find-by-id` | `WHERE id = $1`; value `[id]` | Verified baseline | Invalid/boundary ID plus binding assertion |
| `food-items-create` | Inserts `$1`–`$5`: name, category, description, price cents, availability | Verified parameter binding; input allowlist still pending | Tampered/unexpected field and invalid price/type tests |
| `food-items-update` | Uses `$1`–`$6` for ID and editable values | Verified parameter binding; input allowlist still pending | Invalid ID/price/availability and unexpected field tests |
| `food-items-disable` | `WHERE id = $1`; availability is fixed `false` in SQL | Verified baseline | Invalid ID, repeated disable, and trusted availability tests |
| `food-items-list-available` | `WHERE is_available = $1`; value `[true]` | Verified baseline | Public-menu regression |
| `food-items-list-available-by-category` | Availability `$1`, category `$2` | Verified baseline | Category injection remains bound; category boundary tests |
| `food-items-list-available-categories` | Availability `$1`; value `[true]` | Verified baseline | Category-list regression |
| `food-items-search-available` | Availability `$1`, search `$2`, category `$3`; fixed `strpos/lower` structure | Verified baseline | Matched SQL-injection payload, type/length, combined-filter tests |
| `food-items-list-available-by-ids` | Availability `$1`, bigint array `$2` | Verified baseline | Invalid/stored cart IDs and server reload tests |
| `food-items-find-available-by-id` | Availability `$1`, food ID `$2` | Verified baseline | Cart add invalid/unavailable ID tests |

The conditional selection in `listAvailable()` chooses between two predeclared fixed query objects. It does not concatenate a category into SQL.

### 3.2 Order repository — 8 fixed query definitions and 3 transaction controls

Source: `src/repositories/order-repository.js`

| Query name or statement | Operation and bindings | Current assessment | Day 4 planned test |
| --- | --- | --- | --- |
| `orders-list-admin` | Optional status `$1`; hard limit 100 | Verified baseline | Status allowlist/injection and administrator regression |
| `orders-find-admin-detail` | Administrator order ID `$1` | Verified baseline | Invalid/boundary order ID tests |
| `orders-update-admin-status` | Order ID `$1`, expected current status `$2`, next status `$3` | Verified parameter binding and concurrency guard | Invalid status/transition/unexpected field tests |
| `orders-list-customer-history` | Session-derived user ID `$1`; hard limit 100 | Verified server-owned user scope | Customer-history regression; adversarial cross-user suite deferred to Day 5 |
| `orders-find-customer-detail` | Order ID `$1` plus session-derived user ID `$2` | Verified ownership-scoped query | Ordinary owner/missing regression; adversarial ownership suite deferred to Day 5 |
| `orders-load-foods-for-checkout` | Bigint ID array `$1`; fixed `FOR UPDATE` | Verified baseline | Invalid cart IDs, unavailable items, and rollback tests |
| `orders-insert-confirmed` | Session user ID `$1`, server-calculated total `$2`; status fixed to `confirmed` | Verified trusted values | Submitted owner/role/status/total/price cannot affect row |
| `order-items-insert-snapshot` | Order ID, food ID, server food-name snapshot, server unit price, quantity in `$1`–`$5` | Verified trusted snapshot binding | Tampering plus transactional partial-write regression |
| `BEGIN` | Fixed transaction-control literal | Safe fixed control statement | Transaction boundary/static assertion |
| `COMMIT` | Fixed transaction-control literal | Safe fixed control statement | Successful checkout regression |
| `ROLLBACK` | Fixed transaction-control literal | Safe fixed control statement | Forced failure leaves no partial order/items |

The three transaction controls contain no user value and are the only direct SQL strings passed to the transaction client.

### 3.3 User repository — 4 fixed query definitions

Source: `src/repositories/user-repository.js`

| Query name | Operation and bindings | Current assessment | Day 4 planned test |
| --- | --- | --- | --- |
| `users-find-active-by-email` | Normalized email `$1`; requires `disabled_at IS NULL` | Verified parameter binding | Matched login SQL injection; unknown/wrong-password parity; lockout behavior after remediation |
| `users-create-customer` | Name `$1`, email `$2`, password hash `$3`; role fixed to SQL literal `customer` | Verified server-owned role and bound hash | Unexpected `role`, plaintext absence, duplicate email, strong-password tests |
| `users-record-authentication-failure` | User ID `$1`, server clock `$2`, fixed threshold `$3`, and lock expiry `$4`; row lock plus `LEAST` caps the counter | Step 14 verified bounded atomic state | Threshold/lockout, expired-counter restart, fixed SQL, and matched-payload binding tests |
| `users-reset-authentication-failures` | User ID `$1` and server authentication time `$2`; count fixed to `0`, lock fixed to `NULL` | Step 14 verified server-owned reset | Correct authentication after no/expired lock clears stored protection state |

### 3.4 Other database statements

| Source | Statement owner | Assessment and boundary |
| --- | --- | --- |
| `src/db/pool.js` | Named `application-database-health`: fixed `SELECT 1 AS connected` | Verified fixed health query; no inbound value |
| `connect-pg-simple` through `src/session/store.js` | Library-owned PostgreSQL session queries | Infrastructure SQL is owned by the pinned library and configured with a fixed table name `session`; it is not an application repository query |
| `db/schema.sql`, `db/session-schema.sql`, `db/seed.sql` | Migration/seed scripts | Fixed project scripts, not HTTP-generated SQL; repeatability remains covered by existing database tests |

Inventory result: 23 named application repository queries, one named health query, and three fixed transaction-control statements. No secure repository currently constructs SQL from request input.

### 3.5 Step 8 reconciliation result

- Reconciled all 11 food, 8 order, and 4 user repository query definitions against their call sites. Every definition has a fixed name and fixed SQL text; every request-derived value is supplied through a `values` array and a PostgreSQL placeholder.
- Confirmed the category branch chooses between the two predeclared `food-items-list-available` query objects and never builds SQL text from the category.
- Confirmed `BEGIN`, `COMMIT`, and `ROLLBACK` are the only direct SQL strings used by the application repositories. They are fixed transaction controls and contain no inbound value.
- Added a structural test that exercises all 23 repository queries with the exact approved payload `does-not-match%' OR '1'='1' -- `, verifies it never appears in SQL text, and confirms every payload-bearing call retains it in `values`.
- Added a matched real-PostgreSQL HTTP search test: the payload returns the controlled zero-result state instead of expanding the result, leaves all six fictional food rows unchanged, and exposes no PostgreSQL, table, syntax-error, stack, or internal exception detail.
- Reconfirmed the named `application-database-health` query is fixed and accounted for. Library-owned session SQL and fixed migration/seed scripts remain outside the inbound repository-query boundary described above.

## 4. Route and inbound-input inventory

### 4.1 Public, registration, and authentication routes

| Route | Current inbound values and controls | Trusted/server-derived values | Day 4 status |
| --- | --- | --- | --- |
| `GET /health` | No route/query/body input is used | Service name is fixed | Verified baseline |
| `GET /` | Exact optional `category`; NFC-normalized/trimmed, empty treated as absent, maximum 80 code points/320 bytes | Availability is fixed `true` in repository | Step 10 verified exact allowlist, duplicate/type/boundary rejection, and normal filtering |
| `GET /search` | Exact optional `q` and `category`; NFC-normalized/trimmed, empty treated as absent, bounded to 120/80 code points and 480/320 bytes | Availability is fixed `true` | Step 10 verified exact allowlist, duplicate/type/boundary rejection and normal/SQL-payload search |
| `GET /register` | Exact empty query shape | Authenticated state comes from server session | Step 10 verified unexpected query rejection and normal form rendering |
| `POST /register` | Exact `name`, normalized `email`, `password`, and `passwordConfirmation`; scalar-only Unicode/byte bounds, server-side confirmation match, and Step 13 strength policy | Role is fixed to `customer`; password hash is server-generated | Step 10 input-shape and Step 13 password-policy work complete |
| `GET /login` | Exact optional `registered=1` and `signedOut=1` fixed notice flags | Current user comes from server session | Step 10 verified allowlist, enum, duplicate, and normal notice behavior |
| `POST /login` | Exact normalized scalar `email` and bounded scalar `password`; every validation/authentication/lockout failure uses `Email or password is incorrect.` | User ID/name/role and bounded failure state come from the database; unknown users receive dummy scrypt without allocated state | Step 10 shape/enumeration safety and Step 14 bounded five-failure/five-minute lockout complete |
| `POST /logout` | Exact empty body shape | Session destruction and cookie name/options are server-configured | Step 10 rejects unexpected body fields; session reuse/expiry hardening remains Day 5 |

### 4.2 Cart and customer-order routes

| Route | Current inbound values and controls | Trusted/server-derived values | Day 4 status |
| --- | --- | --- | --- |
| `GET /cart` | Exact empty query shape; session cart is normalized to at most 100 distinct positive bigint keys with integer quantities 1–99 | Food rows, prices, availability, line totals, and total come from database/service | Step 11 exact shape and existing stored-cart trust model verified |
| `POST /cart/items` | Exact scalar body `foodItemId` positive bigint and `quantity` integer 1–99 | Food availability and price loaded by ID | Step 11 missing/type/range/duplicate/unexpected and trusted-field rejection verified |
| `POST /cart/items/:foodItemId/update` | Exact positive-bigint route `foodItemId`; exact integer body `quantity` 1–99 | Price/food state loaded by ID | Step 11 route/body validation and normal update verified |
| `POST /cart/items/:foodItemId/remove` | Exact positive-bigint route `foodItemId`; exact empty body | Removal acts only on server session cart | Step 11 invalid ID/unexpected body rejection and idempotent removal verified |
| `GET /orders` | Exact empty query shape | User ID comes from authenticated session; repository scopes history by it | Step 11 exact shape and normal/empty history verified |
| `GET /orders/:orderId` | Exact positive-bigint route `orderId` and empty query | User ID comes from authenticated session and is bound with order ID | Step 11 invalid/absent/non-owned missing state verified; broader adversarial access remains Day 5 |
| `POST /orders` | Exact empty body; order draft comes from server session cart | User ID, price, total, owner, status, name/price snapshots, availability, and transaction are server-derived | Step 11 trusted-field rejection, database snapshots, rollback, and cart preservation verified |

### 4.3 Administrator food routes

All routes use `requireAdministrator`. The actor ID is read from `request.authenticatedUser.id`, not the body.

| Route | Current inbound values and controls | Trusted/server-derived values | Day 4 status |
| --- | --- | --- | --- |
| `GET /admin/food-items` | Exact optional `notice` enum: `created`, `updated`, or `disabled` | Food list comes from database | Step 12 exact allowlist/enum/duplicate behavior verified |
| `GET /admin/food-items/new` | Exact empty query | Empty form defaults are server-generated | Step 12 exact shape verified |
| `POST /admin/food-items` | Exact normalized/bounded `name`, `category`, `description`, CAD `price`, and fixed optional `isAvailable` representation | Actor ID and created food ID are server-derived | Step 12 type/range/format/allowlist/duplicate/client-role rejection verified |
| `GET /admin/food-items/:foodItemId/edit` | Exact positive-bigint route ID and empty query | Food record loaded from database | Step 12 valid/invalid/missing ID behavior verified |
| `POST /admin/food-items/:foodItemId` | Exact route ID and same bounded editable body as create | Actor ID and existing record identity are server-derived | Step 12 exact shape, invalid price, no-write rejection, and valid update verified |
| `POST /admin/food-items/:foodItemId/disable` | Exact positive-bigint route ID and empty body | Availability is fixed `false`; actor ID is session-derived | Step 12 unexpected-field/ID behavior and repeated disable verified |

### 4.4 Administrator order routes

All routes use `requireAdministrator`. The actor ID is read from the authenticated server session.

| Route | Current inbound values and controls | Trusted/server-derived values | Day 4 status |
| --- | --- | --- | --- |
| `GET /admin/orders` | Exact optional four-value status enum | Customer/order data comes from database | Step 12 exact allowlist/enum/type/duplicate and normal filtering verified |
| `GET /admin/orders/:orderId` | Exact positive-bigint route ID and optional fixed `notice=updated` | Detail/customer/items come from database | Step 12 ID/notice shape and missing behavior verified |
| `POST /admin/orders/:orderId/status` | Exact positive-bigint route ID and exact four-value status body | Actor ID, current status, allowed transition, owner, and totals come from server/database | Step 12 rejects client actor/role/current-state fields and verifies valid/invalid/409 transitions |

### 4.5 Global request bounds

- URL-encoded bodies use `extended: false`, a `16kb` limit, and `parameterLimit: 12` in `src/app.js`.
- Step 9 added `src/validation/request.js` as the reusable server-side foundation for exact field allowlists; distinct missing, malformed, duplicate, unexpected, and boundary errors; scalar-only input; bounded Unicode code points and UTF-8 bytes; integers; booleans; enums; and positive PostgreSQL-bigint identifiers.
- Body-size, parameter-count, and parser failures now map to controlled public errors before route validation. Focused tests prove oversized, over-parameterized, malformed, duplicate, unexpected, and out-of-bound input cannot reach repository writes.
- Step 10 applies the foundation to registration, login/logout, menu, and search. Their controllers now consume only frozen normalized input; invalid public inputs cannot call user/menu services, and invalid login shapes retain the generic `401` response.
- Step 11 applies the foundation to cart and customer-order routes. Invalid shapes cannot call mutation/retrieval methods; checkout accepts no client fields and receives only the authenticated user ID plus server session cart.
- Step 12 completes route-level adoption for administrator food and order workflows; all current application routes now use the shared exact-shape validation foundation.
- Route/query/body values are never trusted merely because browser controls restrict them; Day 4 tests must submit requests directly.

## 5. Identifier, type, length, and range inventory

| Value | Current rule | Source | Gap or Day 4 action |
| --- | --- | --- | --- |
| Food/user/order/actor database ID | String matching `[1-9][0-9]{0,18}`, not above `9223372036854775807` | Request validation, cart/order/food/admin services | Cart and customer-order scalar/zero/decimal/overflow/array/object cases pass in Step 11; administrator route adoption remains Step 12 |
| Session user ID | Non-empty decimal string | Authentication middleware | Stored server-side, but max bigint consistency should be reviewed in Day 4 trusted-value checks |
| Cart quantity | Submitted scalar integer 1–99; stored safe integer 1–99 | Request validation, cart and order services | Step 11 exact field/duplicate/type/boundary tests pass |
| Distinct cart items | Maximum 100 | Cart and order services | Verified baseline; test over-limit stored draft |
| Order total | Server-calculated safe integer 0–`2147483647` cents | Order service | Step 11 rejects client total/price and verifies database-derived stored total |
| Food name | Trimmed scalar 1–120 | Food-management service/schema | Exact field/duplicate and Unicode/byte-boundary review |
| Category | Food edit 1–80; public filter/search optional 1–80 | Food-management/menu services | Public exact query allowlists/duplicates verified in Step 10; administrator body boundaries verified in Step 12 |
| Description | Trimmed scalar 0–2000 | Food-management service/schema | Exact field/type/boundary tests |
| CAD price | Exact scalar decimal string with at most two fractional digits; converted to integer cents and capped at `2147483647` | Administrator request validation, food-management service | Step 12 sign/exponent/precision/type/format and no-write invalid-price tests pass |
| Availability | Fixed scalar representations: `on`/`true`/`1`, absent/empty/`false`/`0` | Administrator request validation, food-management service | Step 12 arrays/objects/other strings/unexpected fields rejected |
| Order status | Exact four-value enum; transitions `confirmed -> preparing|cancelled`, `preparing -> completed|cancelled`; terminal otherwise | Administrator request validation, service/schema | Step 12 exact body/duplicate/invalid enum and 409 transition tests pass |
| Role | Database allows only `customer`/`admin`; registration insert fixes `customer`; middleware allows only two roles | Schema, user repository, authentication middleware | Explicitly reject submitted role/actor/owner fields on write routes; do not rely on ignoring them |
| User name | Trimmed scalar 1–100 | User service/schema | Exact body allowlist and boundary tests |
| Email | NFC-normalized, trimmed/lowercased scalar 3–254 code points and bytes matching basic email pattern; case-insensitive unique index | Public request validation, user service, schema | Step 10 duplicate/unexpected/type/boundary tests pass; keep enumeration-safe failures through later login protection |
| Registration password | Scalar well-formed Unicode, 12–128 code points, at most 512 UTF-8 bytes, with at least three of lowercase/uppercase/number/symbol; login retains 1–1024/4096 bounds for existing supported hashes | Password policy, public request validation, user/password services | Step 13 weak/short/over-limit rejection, strong registration/authentication, unique-salt/hash, seed-format compatibility, database-hash, audit/session/browser plaintext-exclusion tests pass |
| Search text | Optional NFC-normalized/trimmed scalar up to 120 code points/480 bytes | Public request validation, menu service | Step 10 exact field/type/length tests and bound SQL-payload regression pass |
| Request body | URL-encoded only, 16 KiB and 12 parameters | Application middleware | Step 9–10 controlled parser-limit and public-route no-service-call tests pass |

## 6. Server-trusted values and ownership inventory

| Trusted value | Current source of truth | Current assessment | Day 4 verification |
| --- | --- | --- | --- |
| New-user role | Fixed SQL literal `customer` | Verified baseline | Submitted `role=admin` must be rejected and never stored |
| Authenticated actor ID/name/role | PostgreSQL-loaded user copied to server-side session after password verification | Step 11 customer write boundary verified | Submitted actor/role/owner fields are rejected; broader session hardening is Day 5 |
| Food availability and price | Current food rows loaded and locked by repository | Step 11 verified | Cart/order submitted price/availability is rejected; database changes before checkout determine snapshots |
| Cart line totals and total | Service calculation from database price and normalized quantity | Step 11 verified | Tampered totals are rejected before mutation and cannot affect display/storage |
| Order owner | Authenticated session user ID | Step 11 verified | Submitted owner/user ID is rejected; cross-user adversarial suite is Day 5 |
| Order status at checkout | Fixed SQL literal `confirmed` | Step 11 verified | Submitted status is rejected |
| Order status transition | Current database status plus fixed transition map | Verified baseline | Invalid, stale, duplicate, or unexpected next status rejected |
| Order item name/price snapshots | Current locked food rows | Step 11 verified | Client snapshot/name/price fields are rejected and stored values match current database rows |
| Audit actor placeholder | Authenticated user ID or server-derived created user ID | Verified bounded placeholder only | Submitted audit actor/details rejected; persistent audit remains Day 6 |
| Public error details | Fixed `PublicApplicationError` code/message/status or generic 500 | Verified baseline | Raw database message/stack/cause never reaches browser/log |

## 7. Password and login inventory

### Verified baseline

- `src/security/passwords.js` uses asynchronous Node.js `scrypt()` with version marker `scrypt$v1`, parameters `N=16384,r=8,p=1`, a random 16-byte salt, and a 64-byte derived key.
- Stored values are strictly parsed, canonical base64url is checked, and verification uses `timingSafeEqual()`.
- `users.password_hash` stores the versioned hash; user responses and sessions exclude it.
- Registration creates only a customer and maps duplicate database errors to a controlled response.
- Login returns the same browser message and status for an unknown email and an incorrect password.
- The session stores only user `id`, `name`, and `role`; passwords/hashes are not stored there.

### Completed Day 4 password remediation

- New registration requires well-formed Unicode with 12–128 code points, a 512-byte UTF-8 ceiling, and at least three of lowercase letters, uppercase letters, numbers, and symbols.
- The registration request boundary and service both enforce bounded input before asynchronous scrypt; the login path retains the prior 1–1024-code-point/4096-byte functional bound so supported existing seed hashes remain verifiable.
- The browser states the policy and supplies matching length attributes while never returning a password value. User results, sessions, audit placeholders, and stored database rows exclude plaintext; stored passwords remain supported versioned hashes.
- Focused tests reject weak, short, and over-limit inputs without a write; authenticate a strong fictional registration; verify unique salts/hashes for equal passwords, supported seed format, constant-time-compatible verification, and plaintext exclusion.

### Completed Day 4 login remediation

- A known active account stores at most five failures. The fifth failure sets a five-minute lock, and attempts during an active lock—including the correct password—receive the same generic `401` response without extending the state.
- A correct password after lock expiry succeeds and atomically clears the count/lock; a wrong password after expiry restarts at one. The service clock is injectable for deterministic boundary tests while production uses the current server time.
- Unknown accounts run the same supported scrypt verification path against a fixed fictional dummy hash but create no database or in-memory entry, so arbitrary identifiers cannot grow protection state.
- Browser responses remain identical for unknown, incorrect, and locked credentials. Focused tests confirm threshold, lock duration, expiry/reset, normal success, unknown-account parity/no-growth, fixed query binding, and absence of email/password/hash values from browser output, request logs, sessions, and audit placeholders.

Session ID rotation, full cookie/idle-expiry review, and logout/expired-session reuse testing are explicitly deferred to Day 5.

## 8. Logging, errors, sessions, and audit placeholders

### Structured log inventory

`src/logger.js` permits only these primitive field names:

- `requestId`
- `method`
- `path`
- `statusCode`
- `durationMs`
- `host`
- `port`
- `signal`
- `errorName`
- `errorCode`

The timestamp, level, and event name are generated by internal call sites. Objects, arrays, and unallowlisted fields are discarded. Current events are request completion/failure, server listen/shutdown/cleanup, database pool error, and session-store error.

### Current protections

- Database pool error codes pass a strict uppercase/number/underscore allowlist or become `DATABASE_ERROR`.
- Browser errors expose only a controlled status, public code/message, and request ID.
- Unexpected errors become generic `INTERNAL_ERROR`; causes/stacks are not rendered or logged.
- Session-store errors log fixed names/codes rather than raw library errors.
- Configuration values, passwords, hashes, cookies, session IDs, authorization headers, request bodies, query values, and raw SQL payloads are not log fields.
- The deferred audit recorder intentionally persists nothing and carries only bounded action/result/actor/entity metadata at current call sites.

### Completed Day 4 sensitive-output review

- Reviewed controller, service, repository, server-side session, deferred audit-placeholder, public-error, and structured-log boundaries. No password, password hash, connection string, session ID/secret, authorization value, raw database error, stack, cause, or unallowlisted nested object is returned or logged.
- Added a direct logger regression proving only the documented primitive diagnostics survive when password, hash, connection, session, authorization, and nested sentinel values are supplied.
- Added raw-error mapping regressions proving unexpected messages, stacks, and causes become the generic public `500` details while fixed application errors expose only their controlled fields.
- Added loopback HTTP regressions proving raw query/body sentinels are absent from browser output and captured stdout/stderr. Request completion logging uses `request.path`, so query strings and submitted values are excluded.
- Re-ran representative registration, login, search, customer order, and administrator workflows and failure paths against temporary PostgreSQL. Exact request schemas reject unexpected/nested and client-owned price, total, role, owner, status, snapshot, and actor values before writes, while sessions retain only user ID, name, and role.
- Verification passed: 5 focused files with 25 tests, 8 database-backed workflow files with 61 tests, and syntax checks for 76 JavaScript files.
- The deferred audit recorder still persists nothing and carries only bounded action/result/actor/entity metadata. Persistent authentication, order, and administrator audit completion remains explicitly deferred to Day 6.

## 9. Completed Day 4 automated verification matrix

The secure `develop` branch provides the cross-platform `npm run test:day4` command through an explicit 28-file manifest in `vitest.day4.config.js`. The same command is configured in the existing `macos-latest` and `windows-latest` CI matrix; remote CI execution remains part of the later delivery step. The intentionally vulnerable files are not imported into this suite: the isolated `demo/vulnerable` branch retains its separate `npm run test:demo` command and three-file safety/scenario suite.

| Test group | Requirements covered | Expected secure result |
| --- | --- | --- |
| `day4-query-inventory` | Every query listed; fixed structure; parameter binding | Inventory and source query-name sets match; no request interpolation |
| `day4-sql-injection` | Matching vulnerable/secure login or search payload | Vulnerable fictional result changes only in demo; secure result is normal failure/no match with no extra rows or SQL error |
| `day4-request-shape` | Missing, duplicate, unexpected, array/object, oversized, malformed values | Controlled `400`/`401`/`404`/`409`/`422`; no write on rejection |
| `day4-registration-login-search` | Name/email/password/search/category validation; enumeration safety | Valid flows pass; invalid inputs controlled; unknown/wrong login responses match |
| `day4-cart-order-trust` | Food/order IDs, quantities, price/total/owner/role/status/snapshots | Only database/session values are stored; rollback prevents partial data |
| `day4-admin-input` | Food fields, CAD price, availability, order IDs/status/transitions, actor/role | Invalid/tampered fields cannot affect trusted administrator state |
| `day4-password` | Strength policy, scrypt, random salt, constant-time-compatible verification, plaintext absence | Weak passwords rejected; strong and seed passwords work; hashes differ; plaintext absent |
| `day4-login-protection` | Generic failure, failed count, delay/lockout, reset/expiry | Repeated failures trigger bounded protection without account disclosure |
| `day4-sensitive-output` | Password/hash/connection/session/raw DB/log exclusion | Sentinel secrets absent from browser, session, deferred audit payload, stdout, and stderr |
| `day4-regression` | Normal registration/login/search/order/admin workflows | Completed Day 3 customer and administrator behavior still passes |
| `day4-cross-platform` | Shared secure suite on macOS and Windows | Same package command passes in both CI matrix jobs |

### Step 16 local results

- `npm run test:day4`: 28/28 files and 208/208 tests passed against runtime-provided temporary PostgreSQL directories and random loopback ports.
- `npm run test:day3`: 28/28 current unit/integration files and 208/208 tests passed, including every pre-existing Day 2–3 test file and all normal customer/administrator regressions.
- Isolated saved `demo/vulnerable` suite: 3/3 files and 25/25 tests passed from a temporary read-only expansion of the existing stash, covering interlocks, warnings, fictional fixture repeatability, all six prepared scenarios, and the approved vulnerable SQL-injection result. The temporary expansion was deleted without restoring the stash or adding demo source to `develop`.
- The matched secure search test retained `does-not-match%' OR '1'='1' -- ` as a bound value, returned zero expanded results, exposed no database detail, and left six fictional secure foods unchanged; the isolated vulnerable test returned all three fictional demo foods from the same approved payload without writing data.
- A deterministic authentication fixture now derives its test clock from each database-returned user `createdAt` plus a fixed one-second offset, preventing platform/clock skew from violating the `updated_at >= created_at` test constraint while retaining exact five-minute lockout assertions.
- JavaScript syntax passed for 77 files and whitespace checks passed. No remote CI result, screenshot, application run, commit, push, or later-day control is claimed here.

### Step 17 complete local verification results

- Expanded the saved `demo/vulnerable` stash into an isolated temporary directory, started it only on loopback with a dedicated temporary PostgreSQL database, and confirmed the local-only warning plus fictional customer, administrator, food, and order identities were visible.
- Repeated all six prepared vulnerable scenarios: the approved SQL-injection search changed from one control result to all three fictional foods; the XSS marker executed once; the fixed weak password was accepted; the fixed session identifier was reused; the fictional customer reached administrator order `#1001`; and all four excessive-privilege indicators were true.
- Confirmed demo isolation from trusted database state: the dedicated database/user and fictional-only marker were present with exactly two users, three foods, one order, and one order item. After shutdown, reset, and restart, the same approved SQL-injection search again returned all three fictional foods, proving repeatability.
- Shut down the vulnerable runtime, applied the clean secure schema/session schema/seed, and started the secure application on a separate loopback port. The same approved SQL payload returned the controlled zero-result state with no expanded foods or database detail.
- Completed the normal secure customer flow: strong-password registration, login, search, cart, two-item checkout, confirmed order detail, and order history. Completed the normal administrator flow: login, food creation at CAD `$8.75`, order list/detail, and the allowed update of the new customer order to `preparing`.
- Read-only database verification confirmed the customer role, a supported stored password hash, order total `2598` cents, two `Maple Garden Bowl` snapshots at `1299` cents each, `preparing` status, and the new available administrator food at `875` cents. Runtime logs contained only allowlisted diagnostic fields and excluded submitted credentials, payload values, hashes, session values, and raw database details.
- The final `npm run test:day4` run passed 28/28 files and 208/208 tests. JavaScript syntax passed for 77 files, whitespace checks passed, staging remained empty, planning files remained ignored, the vulnerable stash remained intact, temporary directories were deleted, and both applications and the temporary database were stopped with their loopback ports closed.
- No screenshot, evidence entry, dependency installation, Git staging/commit/push, remote CI execution, GitHub mutation, or Day 5–8 work was performed or claimed in this verification run.

### Step 18 reviewed evidence results

- Captured `evidence/day-04/2026-08-03-vulnerable-baseline.png` from the loopback-only isolated demo with its prominent non-deployment warning, the approved read-only payload, `3 fictional items returned`, and all three seeded fictional foods visible.
- After shutting down the demo, captured `evidence/day-04/2026-08-03-sql-injection-blocked.png` from the separately seeded secure application with the identical payload, `0 results`, `No matches`, and the controlled empty state visible.
- Verified both files are real readable PNG images: vulnerable `1265 × 1149`, SHA-256 `f0bcb61ec49f776d85e65896e9e98710acc1bf3a3edd8c9025f88b769d678f6b`; secure `1265 × 1370`, SHA-256 `29d054d00645433ae37c54cd3dc87c1cf7db1fb97f2d893871c2af492e676197`.
- Visual review found no credentials, passwords, tokens, cookies, session identifiers, real personal data, connection details, stack traces, terminal/debug output, or unrelated desktop content. `evidence/README.md` records the Day/date, filenames, matched payload, expected/actual results, control relationship, macOS loopback environment, cleanup, and review outcome.
- Both applications and temporary PostgreSQL were stopped, the temporary demo expansion was deleted, staging remained empty, planning files remained ignored, and the vulnerable stash remained intact. No Git/GitHub delivery or Day 5–8 work was performed in the evidence step.

## 10. Explicit deferred boundaries

The following design controls may already exist partially, but Day 4 will not claim or execute their later milestone acceptance:

- Day 5: matched secure reflected/stored XSS attack tests; session-ID regeneration; cookie/idle-expiry/logout-reuse attack suite; anonymous/customer/admin adversarial RBAC suite; cross-user order-access attack suite.
- Day 6: least-privilege application database role and prohibited-action tests; completed persistent audit events; backup/restore and recovery evidence.
- Day 7: clean-clone full regression and Windows clone-run evidence.
- Day 8: final documentation/report/presentation, release merge, `v1.0.0`, submission archive, and final acceptance evidence.

## 11. Inventory verification result

- All 23 named queries in `src/repositories/` are listed: 11 food, 8 order, and 4 user queries.
- The named database health query and all three fixed transaction-control statements are documented separately.
- Every current route is listed, including all 11 data-changing `POST` routes.
- Registration, login, menu/search, cart, checkout, customer history/detail, administrator food, and administrator order input surfaces are mapped.
- Food/user/order/actor IDs, quantities, prices, totals, roles, owners, statuses, snapshots, allowed fields, request bounds, and logging fields are mapped.
- Existing controls are separated from Day 4 remediation and Day 5–6 deferred work.
- No vulnerable implementation, secure remediation, test execution, branch change, screenshot, commit, push, or later-day work was performed while creating this inventory.
