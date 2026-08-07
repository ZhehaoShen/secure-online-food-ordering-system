# STRIDE Threat Model — Login System

## 1. Executive Summary & Scope

This threat model analyzes the authentication and session lifecycle of the **Northstar Kitchen** application, specifically focusing on the login system, credential handling, session management, and access control.

### In-Scope System Boundaries
- **Client Browser**: Submits credentials over HTTPS/HTTP, manages session cookies and CSRF tokens.
- **Express Application Web Tier**: Enforces rate limits, input validation, CSRF verification, and authentication middleware.
- **Session Store**: Server-side PostgreSQL session store (`connect-pg-simple`).
- **Database Tier**: PostgreSQL database running under least-privilege runtime role (`food_ordering_app`).
- **Administrator Boundary**: Protected routes restricted to users with `admin` role.

---

## 2. Trust Boundaries & Data-Flow Diagram (DFD)

```
[ Unstrusted Browser ] 
        │
        │ HTTP(S) POST /login (Email, Password, _csrf)
        ▼  (Trust Boundary 1: External to Application Server)
[ Express Web Server & Middleware ] 
  ├── Input Validation (Email normalization, length checks)
  ├── CSRF Token Verification (constant-time token check)
  ├── Password Verification (Node.js scrypt + constant-time comparison)
  └── Session Manager (Regenerates session ID, sets HttpOnly cookie)
        │
        │ Parameterized SQL Queries (PG Protocol)
        ▼  (Trust Boundary 2: Web Server to PostgreSQL Database)
[ PostgreSQL Database ] 
  ├── users table (hashed passwords, failed_login_count, locked_until)
  ├── session table (server-side session store)
  └── audit_logs table (sanitized audit events)
```

---

## 3. STRIDE Threat Analysis Matrix

| STRIDE Category | Affected Component | Specific Threat | Example Attack Vector | Implemented Defense Control | Residual Limitation |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Spoofing** | Authentication Controller / Session Store | Stolen credentials, credential guessing, or forged session identity | Brute-force email/password dictionary attack; stolen cookie replay | - Node.js `scrypt` password hashing<br>- Bounded failed-login lockout (5 attempts, 5-min delay)<br>- Generic error messages ("Email or password is incorrect")<br>- Server-side session regeneration on login | Stolen physical device with an active session remain vulnerable until idle timeout. |
| **Tampering** | Web Router / SQL Query Layer | Modified login form data, SQL injection, forged POST request | Submitting `' OR 1=1 --` into login email field; cross-site form submission | - Fixed parameterized SQL queries (`$1`, `$2`)<br>- Cryptographically generated session-bound CSRF tokens<br>- Server-side input validation and email normalization | Client-side DOM manipulation cannot bypass server validation, but proxy tampering requires HTTPS. |
| **Repudiation** | Audit Subsystem | User or admin denies performing authentication/security actions | Denying a login attempt, password change, or food item modification | - Persistent `audit_logs` table recording actor ID, action, entity, result, and timestamp<br>- Admin-only audit view for security review | Audit logs require write-only DB privileges to prevent tampered deletions. |
| **Information Disclosure** | Application Output & Session Cookies | Password, session ID, or sensitive database leak | Error page dumping stack traces; inspecting network cookies; log leakage | - Generic public error pages<br>- Password hashes with random salt (scrypt)<br>- Sensitive data redaction in logs (`[REDACTED]`)<br>- `HttpOnly`, `SameSite=Lax` cookie flags | Local HTTP traffic without TLS can be sniffed if not deployed behind HTTPS reverse proxy. |
| **Denial of Service (DoS)** | Express Middleware / Login Handler | Repeated login attempts or oversized payload exhaustion | Sending 100MB body payload to `/login` to crash server memory | - Strict body size limit (`MAXIMUM_URLENCODED_BODY_BYTES`)<br>- Parameter length bounds<br>- Failed-login delay and lockout per account | Single IP flooding can trigger account lockout for target user; requires IP rate-limiting. |
| **Elevation of Privilege** | Authorization Middleware | Customer accesses administrator routes or another user's order | Manually navigating to `/admin/orders` or changing `role` field in POST body | - Server-side role check (`requireAdministrator` middleware)<br>- Ownership-scoped DB queries (`WHERE user_id = $1`)<br>- Ignoring body-supplied role attributes | Compromised administrator credentials grant full admin access. |

---

## 4. Source File Mapping

The implemented security controls are mapped to specific source code files:

| Security Control | Implementation File | Primary Function / Class |
| :--- | :--- | :--- |
| **Password Hashing & Verification** | [src/security/passwords.js](file:///Users/eldonshen/Desktop/2026/2026spring/8265/groupWork/project/src/security/passwords.js) | `hashPassword()`, `verifyPassword()` |
| **Failed Login & Lockout** | [src/services/user-service.js](file:///Users/eldonshen/Desktop/2026/2026spring/8265/groupWork/project/src/services/user-service.js) | `createUserService().authenticate()` |
| **Parameterized SQL** | [src/repositories/user-repository.js](file:///Users/eldonshen/Desktop/2026/2026spring/8265/groupWork/project/src/repositories/user-repository.js) | `findActiveByEmail()`, `recordAuthenticationFailure()` |
| **CSRF Protection** | [src/security/csrf.js](file:///Users/eldonshen/Desktop/2026/2026spring/8265/groupWork/project/src/security/csrf.js), [src/middleware/csrf.js](file:///Users/eldonshen/Desktop/2026/2026spring/8265/groupWork/project/src/middleware/csrf.js) | `verifyCsrfToken()`, `csrfProtectionMiddleware` |
| **Session Lifecycle & Regeneration** | [src/session/persistence.js](file:///Users/eldonshen/Desktop/2026/2026spring/8265/groupWork/project/src/session/persistence.js), [src/controllers/authentication-controller.js](file:///Users/eldonshen/Desktop/2026/2026spring/8265/groupWork/project/src/controllers/authentication-controller.js) | `regenerateSession()`, `destroySession()` |
| **Administrator RBAC** | [src/middleware/authentication.js](file:///Users/eldonshen/Desktop/2026/2026spring/8265/groupWork/project/src/middleware/authentication.js) | `requireAdministrator` |
| **Sanitized Audit Logging** | [src/audit/persistent-audit-recorder.js](file:///Users/eldonshen/Desktop/2026/2026spring/8265/groupWork/project/src/audit/persistent-audit-recorder.js), [src/repositories/audit-repository.js](file:///Users/eldonshen/Desktop/2026/2026spring/8265/groupWork/project/src/repositories/audit-repository.js) | `createPersistentAuditRecorder()`, `createAuditRepository()` |
| **Least-Privilege Database Roles** | [db/roles.sql](file:///Users/eldonshen/Desktop/2026/2026spring/8265/groupWork/project/db/roles.sql) | PostgreSQL role grants and revocations |

---

## 5. Live Demonstration Speaking Order (No-Slide Guide)

When presenting the STRIDE model during the demonstration:

1. **Spoofing**: Show the login form. Explain how `scrypt` hashing with individual random salts protects credentials, and how bounded lockout prevents credential guessing.
2. **Tampering**: Enter `' OR '1'='1` in the login email field. Demonstrate that parameterized SQL treats input strictly as literal data, preventing query modification.
3. **Repudiation**: Open `/admin/audit-logs`. Show that every authentication success, failure, and security rejection is immutably recorded with actor, action, and timestamp.
4. **Information Disclosure**: Highlight generic failure messages ("Email or password is incorrect") and show that audit logs mask sensitive fields as `[REDACTED]`.
5. **Denial of Service**: Explain request payload size limits (`MAXIMUM_URLENCODED_BODY_BYTES`) and account lockouts after 5 consecutive failures.
6. **Elevation of Privilege**: Attempt to access `/admin/audit-logs` as a normal customer account. Show that `requireAdministrator` middleware blocks access and records a `security.access_denied` audit event.
