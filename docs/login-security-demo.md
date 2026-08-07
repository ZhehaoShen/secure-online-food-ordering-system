# Login Security Demonstration: Insecure vs. Secure Comparison

> **Safety Notice:** The intentionally vulnerable demonstration exists only locally in the isolated `demo/vulnerable` directory, runs exclusively on loopback (`127.0.0.1`), connects only to a dedicated fictional database (`food_ordering_vulnerable_demo`), and contains prominent educational warning banners. It must never be published or deployed in production.

---

## 1. Executive Summary

This document explains the security controls implemented in the main food ordering application to prevent SQL injection during authentication, contrasting them against an isolated, local-only vulnerable baseline.

---

## 2. Environment Prerequisites & Setup

### Insecure Vulnerable Demo Setup
- **Startup Command:** `npm run demo:vulnerable:start`
- **Route:** `http://127.0.0.1:3100/scenarios/login-sql-injection` (or `http://127.0.0.1:3100/scenarios/sql-injection`)
- **Dedicated Database:** `food_ordering_vulnerable_demo`
- **Fictional Accounts Seeded:**
  - Customer: `customer@vulnerable-demo.test`
  - Administrator: `admin@vulnerable-demo.test`
- **Safety Interlocks:** The application checks that `NODE_ENV !== "production"`, `VULNERABLE_DEMO_MODE === "local-classroom-only"`, host is `127.0.0.1`, and database name matches `food_ordering_vulnerable_demo`.

### Secure Application Setup
- **Startup Command:** `npm start`
- **Route:** `http://127.0.0.1:3000/login`
- **Database:** Local PostgreSQL `food_ordering` with parameterized queries.

---

## 3. Matched Demonstration Scenario

### Test Payload (Non-Destructive Harmless Input)
- **Input Email:** `does-not-match%' OR '1'='1' -- `
- **Input Password:** `AnyPassword123!`

---

## 4. Observed Results Comparison

| Dimension | Isolated Insecure Baseline (`demo/vulnerable`) | Secure Application (`/login`) |
| :--- | :--- | :--- |
| **SQL Construction** | Unescaped string concatenation / interpolation | Prepared statement with bound parameters |
| **Observed Result** | Input modifies SQL logic, bypassing password verification and logging in as the first fictional account | Input treated strictly as literal data string `does-not-match%' OR '1'='1' -- ` |
| **HTTP Status Code** | 200 OK (Successful authenticated session) | 401 Unauthorized (Controlled generic failure) |
| **Error Message** | None (Authentication bypassed) | `"Email or password is incorrect."` |
| **Account Discovery Risk** | High | None (Generic response prevents account enumeration) |

---

## 5. Security Controls Explanation

1. **Fixed SQL Structure & Bound Parameters:**
   The secure repository in `src/repositories/user-repository.js` defines static SQL text with `$1` placeholders:
   ```sql
   SELECT id, name, email, password_hash, role, failed_login_count, locked_until
   FROM users
   WHERE lower(email) = lower($1) AND disabled_at IS NULL
   LIMIT 1
   ```
   PostgreSQL parses and compiles the query structure *before* substituting `$1`. The string `does-not-match%' OR '1'='1' -- ` is matched literally against the `email` column, which evaluates to zero matching rows.

2. **Normalized Input:**
   Emails are trimmed, lowercased, and truncated to a safe maximum length (254 characters) before lookup.

3. **Password-Hash Verification (`scrypt`):**
   Passwords are not compared as plaintext. Stored hashes use `scrypt` key derivation (`scrypt$v1$N=16384,r=8,p=1$...`). Password verification is executed only after retrieving a valid user record.

4. **Generic Failure Responses:**
   Whether an email is missing, incorrect, or password mismatch occurs, the application returns `401 Unauthorized` with the generic error `"Email or password is incorrect."`, preventing attackers from determining whether an email exists in the system.

---

## 6. Shutdown & Teardown Instructions

To stop the isolated vulnerable demo server:
1. Press `Control-C` in the terminal running `demo:vulnerable:start`.
2. Optionally run `npm run demo:vulnerable:reset` to reset fictional demo database state.
