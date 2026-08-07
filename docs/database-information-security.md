# Database and Information Security Specification

## Overview

This document specifies the technical architecture and implementation details for all database and application-layer security controls in the **Northstar Kitchen** food ordering system.

---

## 1. Parameterized SQL Queries

- **Implementation File**: [src/repositories/user-repository.js](file:///Users/eldonshen/Desktop/2026/2026spring/8265/groupWork/project/src/repositories/user-repository.js), [src/repositories/food-item-repository.js](file:///Users/eldonshen/Desktop/2026/2026spring/8265/groupWork/project/src/repositories/food-item-repository.js), [src/repositories/order-repository.js](file:///Users/eldonshen/Desktop/2026/2026spring/8265/groupWork/project/src/repositories/order-repository.js)
- **Design Rationale**: SQL injection occurs when untrusted user input is concatenated into raw SQL strings. Using PostgreSQL parameterized placeholders (`$1`, `$2`) passes input parameters separately from SQL command structure through the PostgreSQL wire protocol.
- **Verification**: The application contains no raw string concatenation for SQL queries. Input values are bound as parameters.

---

## 2. Server-Side Input Validation & Normalization

- **Implementation File**: [src/validation/request.js](file:///Users/eldonshen/Desktop/2026/2026spring/8265/groupWork/project/src/validation/request.js), [src/validation/public-input.js](file:///Users/eldonshen/Desktop/2026/2026spring/8265/groupWork/project/src/validation/public-input.js)
- **Design Rationale**: Client-side validation can be bypassed by attacker HTTP clients. Centralized server-side validation enforces data type, length limits, allowlists, and string normalization before processing requests.
- **Verification**: Input validation middleware parses request bodies and queries, rejecting invalid types (e.g. non-string parameters, oversized body payloads, malformed emails) with controlled 400 or 422 HTTP responses.

---

## 3. XSS Output Encoding & Content Security Policy (CSP)

- **Implementation File**: [src/app.js](file:///Users/eldonshen/Desktop/2026/2026spring/8265/groupWork/project/src/app.js), EJS views (`views/*.ejs`)
- **Design Rationale**: Cross-Site Scripting (XSS) allows attackers to inject malicious HTML/JS. EJS uses HTML escaping (`<%= %>`) by default rather than raw unescaped output (`<%- %>`). In addition, CSP HTTP response headers restrict execution of inline scripts and unauthorized external assets.
- **Verification**: All dynamic values in views are rendered using HTML-escaped EJS interpolation (`<%= %>`). The `Content-Security-Policy` header is set to `default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'`.

---

## 4. CSRF Protection & SameSite Cookies

- **Implementation File**: [src/security/csrf.js](file:///Users/eldonshen/Desktop/2026/2026spring/8265/groupWork/project/src/security/csrf.js), [src/middleware/csrf.js](file:///Users/eldonshen/Desktop/2026/2026spring/8265/groupWork/project/src/middleware/csrf.js)
- **Design Rationale**: Cross-Site Request Forgery (CSRF) tricks an authenticated browser into submitting unauthorized requests. Cryptographically secure random CSRF tokens (`crypto.randomBytes`) are bound to the user session, rendered in hidden form fields, and verified via constant-time comparison on state-changing POST requests.
- **Verification**: Every POST form includes a hidden `_csrf` input field. State-changing requests missing or matching incorrect CSRF tokens are rejected with a controlled HTTP 403 error. Session cookies use `SameSite=Lax`.

---

## 5. Password Hashing & Login Protection

- **Implementation File**: [src/security/passwords.js](file:///Users/eldonshen/Desktop/2026/2026spring/8265/groupWork/project/src/security/passwords.js), [src/security/password-policy.js](file:///Users/eldonshen/Desktop/2026/2026spring/8265/groupWork/project/src/security/password-policy.js), [src/services/user-service.js](file:///Users/eldonshen/Desktop/2026/2026spring/8265/groupWork/project/src/services/user-service.js)
- **Design Rationale**: Passwords must never be stored in plaintext or reversible encryption. Node.js `crypto.scrypt` with random 16-byte salts and cost parameters ($N=16384, r=8, p=1$) is used for hashing. To mitigate brute-force and timing attacks, password verification uses constant-time comparison (`crypto.timingSafeEqual`) and login failures trigger exponential account delay and lockouts (5 failures = 5-minute lockout).
- **Verification**: Passwords are hashed before storage. Failed login attempts increment `failed_login_count` and set `locked_until`.

---

## 6. Session Lifecycle, Regeneration & Cleanup

- **Implementation File**: [src/session/persistence.js](file:///Users/eldonshen/Desktop/2026/2026spring/8265/groupWork/project/src/session/persistence.js), [src/session/store.js](file:///Users/eldonshen/Desktop/2026/2026spring/8265/groupWork/project/src/session/store.js), [src/controllers/authentication-controller.js](file:///Users/eldonshen/Desktop/2026/2026spring/8265/groupWork/project/src/controllers/authentication-controller.js)
- **Design Rationale**: Preventing session fixation and session hijack attacks requires renewing session IDs upon login and completely destroying server-side session records during logout or expiration.
- **Verification**: Calling `regenerateSession()` on login generates a fresh session identifier while preserving essential user identity. Logout explicitly invokes `destroySession()` and clears the browser session cookie (`HttpOnly`, `SameSite=Lax`). Session idle timeout automatically expires stale sessions in PostgreSQL.

---

## 7. Administrator Role-Based Access Control (RBAC)

- **Implementation File**: [src/middleware/authentication.js](file:///Users/eldonshen/Desktop/2026/2026spring/8265/groupWork/project/src/middleware/authentication.js), [src/routes/admin-food-routes.js](file:///Users/eldonshen/Desktop/2026/2026spring/8265/groupWork/project/src/routes/admin-food-routes.js), [src/routes/admin-order-routes.js](file:///Users/eldonshen/Desktop/2026/2026spring/8265/groupWork/project/src/routes/admin-order-routes.js)
- **Design Rationale**: Authorization checks must be strictly enforced on the server rather than relying on client UI visibility.
- **Verification**: Routes prefixed with `/admin` apply `requireAuthentication` and `requireAdministrator` middleware, checking `request.authenticatedUser.role === 'admin'`. Non-admin users receive HTTP 403 access denial.

---

## 8. Customer Order Ownership Isolation

- **Implementation File**: [src/services/order-service.js](file:///Users/eldonshen/Desktop/2026/2026spring/8265/groupWork/project/src/services/order-service.js), [src/repositories/order-repository.js](file:///Users/eldonshen/Desktop/2026/2026spring/8265/groupWork/project/src/repositories/order-repository.js)
- **Design Rationale**: Insecure Direct Object Reference (IDOR) allows malicious users to access other customers' orders by changing the order ID URL parameter.
- **Verification**: Customer order lookup queries scope every database lookup to both `order_id` AND `user_id` (`WHERE id = $1 AND user_id = $2`), preventing cross-tenant data access.

---

## 9. Least-Privilege PostgreSQL Database Roles

- **Implementation File**: [db/roles.sql](file:///Users/eldonshen/Desktop/2026/2026spring/8265/groupWork/project/db/roles.sql), [scripts/database-task.js](file:///Users/eldonshen/Desktop/2026/2026spring/8265/groupWork/project/scripts/database-task.js)
- **Design Rationale**: If application credentials are ever compromised, database privilege isolation limits the blast radius.
- **Verification**: Three distinct PostgreSQL roles are created:
  1. `food_ordering_migrator`: Schema owner with DDL privileges for migration.
  2. `food_ordering_app`: Restricted runtime application user with DML privileges (`SELECT`, `INSERT`, `UPDATE`, `DELETE`) on tables and sequences only, with NO `CREATE`, `DROP`, `ALTER`, or superuser rights.
  3. `food_ordering_backup`: Read-only user for automated pg_dump exports.

---

## 10. Persistent & Sanitized Audit Logging

- **Implementation File**: [src/repositories/audit-repository.js](file:///Users/eldonshen/Desktop/2026/2026spring/8265/groupWork/project/src/repositories/audit-repository.js), [src/audit/persistent-audit-recorder.js](file:///Users/eldonshen/Desktop/2026/2026spring/8265/groupWork/project/src/audit/persistent-audit-recorder.js)
- **Design Rationale**: Security auditing requires persistent records of security events (login, logout, CSRF rejection, access denial, food/order modifications) without leaking secrets into log tables.
- **Verification**: Events are persisted to `audit_logs`. The `sanitizeObject()` filter scans event payload keys, replacing passwords, hashes, CSRF tokens, session IDs, and cookies with `[REDACTED]`.

---

## 11. Database Backup, Restore & Recovery

- **Implementation File**: [scripts/database-task.js](file:///Users/eldonshen/Desktop/2026/2026spring/8265/groupWork/project/scripts/database-task.js), [package.json](file:///Users/eldonshen/Desktop/2026/2026spring/8265/groupWork/project/package.json)
- **Design Rationale**: Database disaster recovery requires fast, cross-platform backup and non-destructive restoration procedures.
- **Verification**: `npm run db:backup` generates custom-format PostgreSQL dumps (`pg_dump`). `npm run db:restore -- <backup-file> [target-db]` restores dumps using `pg_restore` with options to allow targeted restore into separate test databases without destroying production data. Backup dumps are ignored by `.gitignore`.

---

## 12. Secret Protection & Public Error Boundaries

- **Implementation File**: [src/errors.js](file:///Users/eldonshen/Desktop/2026/2026spring/8265/groupWork/project/src/errors.js), [src/app.js](file:///Users/eldonshen/Desktop/2026/2026spring/8265/groupWork/project/src/app.js), [.env.example](file:///Users/eldonshen/Desktop/2026/2026spring/8265/groupWork/project/.env.example)
- **Design Rationale**: Leaking stack traces or internal server state helps attackers build targeted exploits.
- **Verification**: Real credentials remain in local `.env` files (excluded from Git). Public error handling returns friendly error messages and standardized status codes while logging full technical stack traces only to internal server logs.
