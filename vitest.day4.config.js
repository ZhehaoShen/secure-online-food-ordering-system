import { defineConfig } from "vitest/config";

const DAY_4_SECURITY_TESTS = Object.freeze([
  "tests/unit/administrator-input-validation.test.js",
  "tests/unit/customer-input-validation.test.js",
  "tests/unit/login-protection.test.js",
  "tests/unit/password-policy.test.js",
  "tests/unit/public-input-validation.test.js",
  "tests/unit/query-security.test.js",
  "tests/unit/request-validation.test.js",
  "tests/unit/sensitive-boundaries.test.js",
  "tests/integration/customer-input-validation.test.js",
  "tests/integration/public-input-validation.test.js",
  "tests/integration/request-validation-foundation.test.js",
  "tests/integration/sensitive-output-boundaries.test.js",
]);

const CUSTOMER_AND_ADMINISTRATOR_REGRESSIONS = Object.freeze([
  "tests/integration/admin-food-management.test.js",
  "tests/integration/admin-order-review.test.js",
  "tests/integration/authentication-workflow.test.js",
  "tests/integration/cart-workflow.test.js",
  "tests/integration/checkout-transaction.test.js",
  "tests/integration/customer-order-history.test.js",
  "tests/integration/registration-workflow.test.js",
  "tests/integration/search-workflow.test.js",
  "tests/integration/user-data-layer.test.js",
]);

const DAY_2_AND_DAY_3_FOUNDATION_REGRESSIONS = Object.freeze([
  "tests/unit/authentication-middleware.test.js",
  "tests/unit/passwords.test.js",
  "tests/unit/session-config.test.js",
  "tests/integration/database-commands.test.js",
  "tests/integration/database-menu-foundation.test.js",
  "tests/integration/presentation-states.test.js",
  "tests/integration/session-foundation.test.js",
]);

// The intentionally vulnerable tests remain isolated on demo/vulnerable and run
// there through `npm run test:demo`. Importing them into develop would violate
// the branch boundary that the Day 4 comparison is designed to verify.
const include = [...new Set([
  ...DAY_4_SECURITY_TESTS,
  ...CUSTOMER_AND_ADMINISTRATOR_REGRESSIONS,
  ...DAY_2_AND_DAY_3_FOUNDATION_REGRESSIONS,
])];

export default defineConfig({
  test: {
    fileParallelism: false,
    hookTimeout: 60_000,
    include,
    testTimeout: 30_000,
  },
});
