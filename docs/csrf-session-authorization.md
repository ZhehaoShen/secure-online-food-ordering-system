# CSRF Protection, Session Management, and Authorization Controls

## 1. Executive Summary

This document details the architectural controls for Cross-Site Request Forgery (CSRF) prevention, session lifecycle management, and server-side role-based authorization (RBAC) in the food ordering system.

---

## 2. CSRF Protection Architecture

### Token Generation & Session Binding
- **Algorithm:** Cryptographically secure pseudo-random number generator (`crypto.randomBytes(32)`), rendered as a 64-character hexadecimal string.
- **Session Scoping:** Stored in `request.session.csrfToken`. Generated automatically when session is established (`getOrCreateCsrfToken`).
- **Token Rotation:** Called (`rotateCsrfToken`) during authentication state changes (such as successful login).

### Form Integration
Every state-changing HTML form (`POST`) contains a hidden CSRF token field:
```html
<input type="hidden" name="_csrf" value="<%= csrfToken %>">
```

### Central Middleware Validation
- **Middleware:** `csrfProtectionMiddleware` in `src/middleware/csrf.js`.
- **Target Methods:** `POST`, `PUT`, `PATCH`, `DELETE`.
- **Validation Logic:** Extracts `_csrf` body param or `x-csrf-token` header and compares with `request.session.csrfToken` using constant-time comparison (`crypto.timingSafeEqual`).
- **Rejection Response:** Invalid or missing tokens trigger HTTP 403 `CSRF_TOKEN_INVALID` with controlled error message `"Security check failed. The CSRF token was missing or invalid."`

---

## 3. Session Lifecycle & Authentication Protection

1. **Session Regeneration on Authentication:**
   Upon successful login in `src/controllers/authentication-controller.js`, `regenerateSession(request)` issues a new session ID before assigning authenticated user state, neutralizing Session Fixation attacks.

2. **Session Destruction & Cookie Clearing on Logout:**
   `POST /logout` calls `destroySession(request)` to delete PostgreSQL session state and sends `Set-Cookie` with expired max-age to clear client-side cookies.

3. **Cookie Security Attributes:**
   - `HttpOnly`: Enforced (`httpOnly: true`), preventing JavaScript access to session cookies.
   - `SameSite`: Set to `lax` (`sameSite: "lax"`), defending against cross-site request forgery.
   - `Secure`: Controlled by `SESSION_SECURE_COOKIE` configuration (enforced when HTTPS is enabled).
   - `maxAge`: Configured to `SESSION_IDLE_TIMEOUT_MINUTES` (default 30 minutes) for idle session expiration.

4. **Session Structure Validation:**
   `exposeAuthenticatedUser` validates session user objects (`id` digit format, `name` length, `role` in `["customer", "admin"]`). Tampered or invalid session user objects are immediately deleted.

---

## 4. Authorization & Ownership Protections

1. **Server-Side Role Enforcement (RBAC):**
   - Customer routes (`/cart`, `/orders`) require `requireAuthentication`.
   - Administrator routes (`/admin/*`) require `requireAdministrator`. If a customer attempts to access `/admin/*`, `requireAdministrator` yields HTTP 403 `AdministratorAccessError`.

2. **Ownership Scoping (IDOR Protection):**
   Customer order detail queries in `src/repositories/order-repository.js` require BOTH `order_id` AND `user_id`:
   ```sql
   SELECT ... FROM orders WHERE id = $1 AND user_id = $2
   ```
   A logged-in customer cannot access or view another user's order by changing the order ID in the URL.

3. **Field Tampering Resistance:**
   - Registration hardcodes `role = 'customer'` server-side; client role submissions are ignored.
   - Checkout calculates prices and totals on the server from PostgreSQL `food_items` records within a SQL transaction; client-submitted prices or totals are rejected.
