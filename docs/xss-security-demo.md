# Cross-Site Scripting (XSS) Security Demonstration

> **Safety Notice:** The intentionally vulnerable XSS demonstration exists only locally in the isolated `demo/vulnerable` directory (`http://127.0.0.1:3100/scenarios/xss`), using a harmless SVG payload that performs no network requests, cookie reads, or data destruction. It must never be published or deployed in production.

---

## 1. Executive Summary

This document describes the XSS protections implemented across the food ordering application, comparing an isolated raw HTML template sink against the secure application's escaped output rendering and Content Security Policy (CSP).

---

## 2. Environment Setup & Routes

### Isolated Insecure Baseline
- **Command:** `npm run demo:vulnerable:start`
- **Route:** `http://127.0.0.1:3100/scenarios/xss`
- **Vulnerable Sink:** `<%- result.rawHtml %>` in `demo/vulnerable/views/baseline-scenario.ejs`

### Secure Main Application
- **Command:** `npm start`
- **Routes:** All views (`/`, `/menu`, `/cart`, `/orders`, `/admin/*`)
- **Secure Sink:** `<%= value %>` (EJS HTML-escaped output interpolation)

---

## 3. Approved Harmless XSS Payload

```html
<svg id="xss-demo-marker" onload="document.body.dataset.xssDemo='executed'"></svg>
```
* **Payload Scope:** Harmless, visible SVG marker element that sets `dataset.xssDemo = 'executed'` on the local page DOM only. Does not steal cookies, send network requests, or persist data.

---

## 4. Observed Comparison

| Dimension | Insecure Isolated Demo (`demo/vulnerable`) | Secure Main Application |
| :--- | :--- | :--- |
| **Rendering Sink** | `<%- result.rawHtml %>` (Raw unescaped HTML) | `<%= value %>` (HTML-escaped output) |
| **Observed Behavior** | SVG element is parsed by browser as executable markup, triggering `onload` handler | Payload is converted to escaped HTML entities (`&lt;svg id=&quot;...&quot;&gt;&lt;/svg&gt;`) and rendered as plain text |
| **Content Security Policy** | Basic local warning | `Content-Security-Policy: default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'` |

---

## 5. Security Controls Explanation

1. **Contextual Output Encoding:**
   All user-controlled data and dynamic variables in EJS templates use `<%= %>` tags, which encode characters into HTML entities:
   - `<` $\rightarrow$ `&lt;`
   - `>` $\rightarrow$ `&gt;`
   - `"` $\rightarrow$ `&quot;`
   - `'` $\rightarrow$ `&#39;`
   - `&` $\rightarrow$ `&amp;`

2. **Defense in Depth via Content Security Policy (CSP):**
   In `src/app.js`, HTTP response headers enforce CSP:
   ```text
   Content-Security-Policy: default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'
   ```
   This restricts resource loading to origin `'self'`, blocks inline scripts/objects, and prevents iframe embedding (`frame-ancestors 'none'`).

3. **HTTP Header Hardening:**
   - `X-Content-Type-Options: nosniff` (Prevents MIME sniffing)
   - `X-Frame-Options: DENY` (Blocks clickjacking)
   - `Referrer-Policy: no-referrer` (Prevents referrer leaks)

---

## 6. Shutdown Instructions

Press `Control-C` in the terminal to stop the local server.
