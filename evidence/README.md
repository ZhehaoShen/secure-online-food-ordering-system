# Verification Evidence

All evidence in this directory is captured from local development runs using
fictional project data.

## Day 2 — July 30, 2026

- **Screenshot:** [`day-02/2026-07-30-database-menu-foundation.png`](day-02/2026-07-30-database-menu-foundation.png)
- **Scenario performed:** Started the application on macOS with a clean,
  isolated PostgreSQL database, applied the repeatable schema and fictional seed,
  opened the public database-driven menu in the browser, and ran the health-check
  command.
- **Expected result:** The health check succeeds and the menu shows the five
  available fictional foods with their category, description, CAD price, and
  availability, without exposing unavailable food or sensitive information.
- **Actual result:** The health-check command passed. The browser rendered all
  five expected available foods across four categories with the expected
  descriptions, prices, and availability labels. The unavailable fictional food
  was not shown.
- **Related requirement or security control:** Day 2 database/menu foundation;
  database-driven design; safe public output; fictional-data isolation; safe
  logging and error handling.
- **Evidence review:** Confirmed the screenshot contains no credentials, tokens,
  session identifiers, personal data, unrelated desktop content, or irrelevant
  debug output.

## Day 3 — July 31, 2026

- **Screenshot:** [`day-03/2026-07-31-customer-admin-workflows.png`](day-03/2026-07-31-customer-admin-workflows.png)
- **Scenario performed:** Started the application on macOS with a clean,
  isolated PostgreSQL database; applied the repeatable business/session schemas
  and fictional seed; registered and signed in as a fictional customer; browsed
  and searched the menu; ordered two Harbour Veggie Wraps; reviewed order `3`
  in the confirmation and customer-history pages; signed out; signed in as the
  fictional administrator; opened the matching administrator order detail; and
  advanced the order from confirmed to preparing.
- **Expected result:** The customer can complete the Day 3 browse/search/cart,
  transactional checkout, confirmation, and history workflow. The administrator
  can review the same saved customer/order/item data and apply only an allowed
  status transition, with the UI showing the server-calculated total and a clear
  success notice.
- **Actual result:** The customer order was saved with quantity `2`, the
  Harbour Veggie Wrap name/price snapshot, and a server-calculated total of
  `$21.98`. The administrator page displayed the matching fictional customer,
  `.test` email, order, line item, total, status workflow, successful-update
  notice, and persisted `Preparing` state. The browser console remained clean.
- **Related requirement or security control:** Day 3 customer and administrator
  functional workflows; PostgreSQL-backed authentication/session state;
  server-owned pricing and totals; transactional order persistence; saved item
  snapshots; role-restricted administrator navigation and status transitions;
  escaped browser output; fictional-data isolation.
- **Evidence review:** Confirmed the `1265 × 1260` file is a real PNG and is
  readable. It contains only fictional names and the reserved `.test` email;
  no credentials, passwords, tokens, cookies, session identifiers, real personal
  data, stack traces, terminal/debug output, or unrelated desktop content are
  visible.

## Day 4 — August 3, 2026

- **Screenshots:**
  [`day-04/2026-08-03-vulnerable-baseline.png`](day-04/2026-08-03-vulnerable-baseline.png)
  and
  [`day-04/2026-08-03-sql-injection-blocked.png`](day-04/2026-08-03-sql-injection-blocked.png)
- **Matched scenario and payload:** Ran the isolated fictional-food search and
  the secure menu search with the same approved, non-destructive input:
  `does-not-match%' OR '1'='1' -- `. The vulnerable page retained its prominent
  local-only classroom warning in the captured view.
- **Expected result:** In the isolated vulnerable application, the dynamic SQL
  condition changes the query structure and expands the result from the one-item
  control to all three seeded fictional foods. In the secure application, the
  same input remains a bound search value, returns zero matches, and reveals no
  database or internal error detail.
- **Actual result:** The vulnerable screenshot shows `3 fictional items returned`
  and lists Classroom Veggie Wrap, Training Berry Bowl, and Sample Citrus Water.
  The secure screenshot shows `0 results`, `No matches`, and
  `No available dishes match these filters.` for the same visible input.
- **Related requirement or security control:** Day 4 isolated vulnerable
  baseline; dummy-data and localhost isolation; visible non-deployment warning;
  matched vulnerable-versus-secure SQL-injection evidence; fixed parameterized
  secure queries; controlled browser output; and no data-changing payload.
- **Environment:** Captured on macOS in a local evidence run on August 5, 2026.
  The vulnerable application used a temporary dedicated demo database/role with
  fictional-only seed data on loopback. It was shut down before the secure
  application was started with a separate clean seeded database on loopback.
  Both applications and the temporary PostgreSQL instance were stopped after
  capture, and the temporary vulnerable-source expansion was deleted.
- **Evidence review:** Confirmed both files are real, readable PNG images
  (`1265 × 1149` vulnerable and `1265 × 1370` secure). They contain only the
  approved payload, public interface text, fictional menu data, and local-only
  safety text where applicable. No credentials, passwords, tokens, cookies,
  session identifiers, real personal data, database connection details, stack
  traces, terminal/debug output, or unrelated desktop content are visible.
