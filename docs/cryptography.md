# Applied Cryptography Architecture

## Overview

This document specifies the precise cryptographic algorithms, random number generation standards, session secret handling, and transport security controls utilized in the **Northstar Kitchen** application.

---

## 1. Password Hashing vs. Encryption

- **Why Passwords Are Hashed (One-Way Transformation)**: Encryption is a two-way mathematical process requiring a key to decrypt data back into plaintext. Storing encrypted passwords creates a single point of failure: if the decryption key is compromised, every user password is lost. Password hashing is a irreversible one-way cryptographic hash function. The application computes `Hash(password)` and compares the result; the original plaintext password can never be recovered from the database.
- **Node.js `scrypt` Implementation**:
  - **Algorithm**: `crypto.scrypt` (memory-hard, key-derivation function resistant to GPU/ASIC hardware brute-forcing).
  - **Parameters**: Cost parameter $N=16384$, block size $r=8$, parallelization $p=1$, key length 64 bytes.
  - **Salt**: Every user password receives a cryptographically random 16-byte salt generated via `crypto.randomBytes(16)`.
  - **Storage Format**: `scrypt$v1$N=16384,r=8,p=1$<salt_base64url>$<hash_base64url>`.
  - **Implementation File**: [src/security/passwords.js](file:///Users/eldonshen/Desktop/2026/2026spring/8265/groupWork/project/src/security/passwords.js)

---

## 2. Constant-Time Comparison

- **Timing Attack Vulnerability**: Standard string equality comparison (`a === b`) short-circuits and returns `false` on the first non-matching character. Attackers can measure response times down to nanoseconds to deduce password hashes or tokens byte-by-byte.
- **Defense Mechanism**:
  - `crypto.timingSafeEqual(bufferA, bufferB)` is used for password hash verification and CSRF token comparison.
  - Constant-time comparison executes in identical time regardless of where or whether characters differ.
  - **Implementation File**: [src/security/passwords.js](file:///Users/eldonshen/Desktop/2026/2026spring/8265/groupWork/project/src/security/passwords.js), [src/security/csrf.js](file:///Users/eldonshen/Desktop/2026/2026spring/8265/groupWork/project/src/security/csrf.js)

---

## 3. Cryptographically Secure Random Number Generation

- **PRNG Standard**: Standard `Math.random()` is deterministic and cryptographically weak. All security tokens and salts use Node.js `crypto.randomBytes()`, which interfaces with system-level cryptographically secure pseudorandom number generators (CSPRNG, such as `/dev/urandom` or Windows `BCryptGenRandom`).
- **CSRF Tokens**: Generated using 32 bytes of CSPRNG randomness encoded as URL-safe base64 strings (`crypto.randomBytes(32).toString('base64url')`).
- **Implementation File**: [src/security/csrf.js](file:///Users/eldonshen/Desktop/2026/2026spring/8265/groupWork/project/src/security/csrf.js)

---

## 4. Server-Side Sessions & Signed Cookies

- **Session Architecture**:
  - The application uses server-side session management (`express-session` with `connect-pg-simple`).
  - Sensitive session payload data resides securely in the PostgreSQL `session` table on the server.
  - The client receives only an encrypted/signed session identifier stored in a browser cookie (`food_ordering_sid`).
- **Cookie Security Attributes**:
  - `HttpOnly`: Prevents client-side JavaScript (`document.cookie`) from reading the session cookie (mitigating XSS session theft).
  - `SameSite=Lax`: Restricts cross-site cookie transmission to mitigate CSRF attacks.
  - `Secure`: Ensures cookies are only transmitted over encrypted HTTPS connections in production deployments (`SESSION_SECURE_COOKIE=true`).
- **Implementation File**: [src/session/middleware.js](file:///Users/eldonshen/Desktop/2026/2026spring/8265/groupWork/project/src/session/middleware.js), [src/config/session.js](file:///Users/eldonshen/Desktop/2026/2026spring/8265/groupWork/project/src/config/session.js)

---

## 5. Transport Layer Security (TLS/HTTPS) Deployment Boundary

- **Requirement**: While local classroom demonstrations operate over loopback HTTP (`http://127.0.0.1:3000`), production and staging deployments strictly require TLS 1.3/HTTPS.
- **Deployment Boundary**: TLS terminates at the reverse proxy (e.g. Nginx, Cloudflare, or AWS ALB) or application entry point. TLS encrypts all HTTP headers, request paths, query parameters, POST body data, and cookie headers in transit against network eavesdropping and man-in-the-middle (MitM) inspection.

---

## 6. Cryptographic Boundary & Disclaimers (What Is NOT Implemented)

To maintain complete documentation integrity and avoid false security claims, the following cryptographic mechanisms are explicitly **NOT** implemented in this project and must not be claimed in presentation materials:

1. **Application-Level Data Encryption at Rest**: Database columns (e.g. food names, order totals) are not encrypted with symmetric keys (e.g. AES-256-GCM); protection relies on PostgreSQL database access control and least-privilege roles.
2. **Asymmetric Key Signatures & Public Key Infrastructure (PKI)**: No RSA/ECDSA private key signing or X.509 certificate validation is performed at the application layer.
3. **JSON Web Tokens (JWT)**: Authentication uses server-side PostgreSQL stateful sessions, not stateless JWT tokens.
4. **End-to-End Encryption (E2EE)**: Data is decrypted at the Express application tier for processing.
