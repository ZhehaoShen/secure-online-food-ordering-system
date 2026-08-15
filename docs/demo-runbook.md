# August 10 Demonstration Runbook (No-Slide Live Presentation)

## Overview

This runbook outlines the exact 10-step live demonstration sequence for August 10. No slides are required. The entire presentation is conducted live in browser windows and code inspection.

---

## Pre-Demo Setup

1. **Primary Environment**: macOS
2. **Terminal Window 1 (Secure App)**:
   ```bash
   npm start
   ```
   *(Running on [http://127.0.0.1:3000](http://127.0.0.1:3000))*

3. **Terminal Window 2 (Isolated Vulnerable Demo)**:
   ```bash
   npm run demo:vulnerable:setup
   npm run demo:vulnerable:start
   ```
   *(Running on [http://127.0.0.1:3100](http://127.0.0.1:3100))*

4. **Fictional Accounts for Demo**:
   - Customer Account: `customer1@example.com` / `CustomerPass123!`
   - Admin Account: `admin1@example.com` / `AdminPass123!`

---

## 10-Step Live Demonstration Sequence

### Step 1: Start Environments & Show Isolation Warning
- **Route**: `http://127.0.0.1:3000/` and `http://127.0.0.1:3100/`
- **Action**: Open both URLs side-by-side in browser. Point out the prominent banner on port 3100: *"EDUCATIONAL VULNERABLE DEMO — LOCAL LOOPBACK ONLY"*.
- **Source File**: [demo/vulnerable/server.js](file:///Users/eldonshen/Desktop/2026/2026spring/8265/groupWork/project/demo/vulnerable/server.js)
- **Speaking Note**: "We maintain strict isolation: the vulnerable demo runs only on loopback with fictional data and interlocks that prevent it from running in production."
- **Recovery**: If port 3100 is unresponsive, run `npm run demo:vulnerable:start`.

---

### Step 2: Insecure Login SQL Injection Demonstration
- **Route**: `http://127.0.0.1:3100/login`
- **Input**:
  - Email: `' OR '1'='1`
  - Password: `anything`
- **Expected Visible Result**: Bypasses authentication and signs in immediately as the first user without knowing the password.
- **Source File**: [demo/vulnerable/insecure-login-query.js](file:///Users/eldonshen/Desktop/2026/2026spring/8265/groupWork/project/demo/vulnerable/insecure-login-query.js)
- **Screenshot Ref**: `evidence/day-05/2026-08-07-login-sqli-insecure.png`
- **Speaking Note**: "Notice how string concatenation inside the raw SQL query allows the input `' OR '1'='1` to alter query logic and bypass authentication."
- **Recovery**: Run `npm run demo:vulnerable:reset` if database state needs resetting.

---

### Step 3: Secure Login SQL Injection Comparison
- **Route**: `http://127.0.0.1:3000/login`
- **Input**:
  - Email: `' OR '1'='1`
  - Password: `anything`
- **Expected Visible Result**: Login fails gracefully with generic message: `"Email or password is incorrect."`
- **Source File**: [src/repositories/user-repository.js](file:///Users/eldonshen/Desktop/2026/2026spring/8265/groupWork/project/src/repositories/user-repository.js#L40)
- **Screenshot Ref**: `evidence/day-05/2026-08-07-login-sqli-secure.png`
- **Speaking Note**: "In our secure application, parameterized queries pass input as raw parameter data (`$1`), rendering SQL injection impossible and returning a generic error."
- **Recovery**: Ensure secure app is running on port 3000.

---

### Step 4: Insecure XSS Demonstration
- **Route**: `http://127.0.0.1:3100/login`
- **Input**:
  - Email: `<script>alert('XSS-Vulnerable-Demo')</script>`
  - Password: `DemoPassword123!`
- **Expected Visible Result**: Browser executes the injected JavaScript from the unescaped attempted email notice (`<%- email %>`) and pops up an alert box upon login failure.
- **Source File**: [demo/vulnerable/views/login.ejs](file:///Users/eldonshen/Desktop/2026/2026spring/8265/groupWork/project/demo/vulnerable/views/login.ejs)
- **Screenshot Ref**: `evidence/day-05/2026-08-07-xss-insecure.png`
- **Speaking Note**: "Unescaped EJS rendering (`<%- email %>`) in the login failure feedback allows arbitrary script injection inside the user's browser."
- **Recovery**: Close alert box or refresh page.

---

### Step 5: Secure XSS Prevention Comparison
- **Route**: `http://127.0.0.1:3000/login`
- **Input**:
  - Email: `<script>alert('XSS-Vulnerable-Demo')</script>`
  - Password: `DemoPassword123!`
- **Expected Visible Result**: Payloads are escaped cleanly as plain text string without popping an alert box, input validation rejects invalid email format, and CSP headers block inline script execution.
- **Source File**: [views/login.ejs](file:///Users/eldonshen/Desktop/2026/2026spring/8265/groupWork/project/views/login.ejs), [src/app.js](file:///Users/eldonshen/Desktop/2026/2026spring/8265/groupWork/project/src/app.js)
- **Screenshot Ref**: `evidence/day-05/2026-08-07-xss-secure.png`
- **Speaking Note**: "Our secure app uses EJS HTML escaping (`<%= email %>`), input validation, and Content Security Policy (`default-src 'self'`) headers as defense-in-depth against XSS."
- **Recovery**: N/A.

---

### Step 6: Login STRIDE Threat Model Explanation
- **Document**: [docs/login-stride-threat-model.md](file:///Users/eldonshen/Desktop/2026/2026spring/8265/groupWork/project/docs/login-stride-threat-model.md)
- **Action**: Open document and explain the 6 threat categories:
  1. **Spoofing**: Defended via `scrypt` hashing & lockout.
  2. **Tampering**: Defended via parameterized SQL & CSRF tokens.
  3. **Repudiation**: Defended via sanitized audit logging.
  4. **Information Disclosure**: Defended via generic public errors & `HttpOnly` cookies.
  5. **Denial of Service**: Defended via body limits & failed-login delay.
  6. **Elevation of Privilege**: Defended via `requireAdministrator` middleware & ownership-scoped queries.
- **Speaking Note**: "Every threat category in our login system maps directly to specific code controls."
- **Recovery**: N/A.

---

### Step 7: Database & Information Security Controls
- **Document**: [docs/database-information-security.md](file:///Users/eldonshen/Desktop/2026/2026spring/8265/groupWork/project/docs/database-information-security.md)
- **Action**: Highlight Least-Privilege DB Roles ([db/roles.sql](file:///Users/eldonshen/Desktop/2026/2026spring/8265/groupWork/project/db/roles.sql)) and Admin Audit View ([http://127.0.0.1:3000/admin/audit-logs](http://127.0.0.1:3000/admin/audit-logs)).
- **Screenshot Ref**: `evidence/day-06/2026-08-08-audit-backup-restore.png`
- **Speaking Note**: "The application runtime user (`food_ordering_app`) has DML-only access with zero DDL or superuser rights, and audit logs mask sensitive details as `[REDACTED]`."
- **Recovery**: Sign in as `admin1@example.com` to access `/admin/audit-logs`.

---

### Step 8: Applied Cryptography Explanation
- **Document**: [docs/cryptography.md](file:///Users/eldonshen/Desktop/2026/2026spring/8265/groupWork/project/docs/cryptography.md)
- **Action**: Show `hashPassword()` and `verifyPassword()` in [src/security/passwords.js](file:///Users/eldonshen/Desktop/2026/2026spring/8265/groupWork/project/src/security/passwords.js).
- **Speaking Note**: "We use Node.js `scrypt` with unique 16-byte salts and `crypto.timingSafeEqual` to prevent timing side-channel attacks."
- **Recovery**: N/A.

---

### Step 9: Design-Decision Justifications
- **Action**: Explain why PostgreSQL stateful sessions were selected over stateless JWTs (easier instant revocation and logout cleanup) and why raw SQL with parameters was chosen over heavy ORMs (complete visibility and control over query performance).
- **Speaking Note**: "Stateful sessions give us instant server-side revocation on logout, while parameterized SQL ensures predictable performance and security without ORM overhead."
- **Recovery**: N/A.

---

### Step 10: Shutdown Both Environments
- **Action**: Stop both terminal processes.
- **Commands**:
  ```bash
  npm run shutdown
  ```
- **Speaking Note**: "Both the secure application and isolated demo environments are safely shut down."
- **Recovery**: Verify processes stopped via `lsof -i :3000` and `lsof -i :3100`.
