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
