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
