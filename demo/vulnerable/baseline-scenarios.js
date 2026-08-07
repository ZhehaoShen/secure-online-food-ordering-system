import { verifyVulnerableDemoTarget } from "./target.js";

export const XSS_CONTROL_MESSAGE = "Safe fictional classroom message";
export const APPROVED_XSS_PAYLOAD =
  '<svg id="xss-demo-marker" onload="document.body.dataset.xssDemo=\'executed\'"></svg>';
export const APPROVED_WEAK_PASSWORD = "1234";
export const UNSAFE_SESSION_COOKIE_NAME = "vulnerable_demo_session";
export const UNSAFE_SESSION_COOKIE_VALUE = "shared-fictional-session";
export const FICTIONAL_CUSTOMER_EMAIL = "customer@vulnerable-demo.test";

const UNAUTHORIZED_ADMIN_QUERY = Object.freeze({
  name: "vulnerable-demo-missing-admin-authorization",
  text: `
    SELECT
      actor.name AS actor_name,
      actor.email AS actor_email,
      actor.role AS actor_role,
      demo_order.id AS order_id,
      demo_order.status,
      demo_order.total_cents
    FROM vulnerable_demo_users AS actor
    CROSS JOIN vulnerable_demo_orders AS demo_order
    WHERE actor.email = $1
    ORDER BY demo_order.id ASC
  `,
});

const EXCESSIVE_PRIVILEGES_QUERY = Object.freeze({
  name: "vulnerable-demo-excessive-database-privileges",
  text: `
    SELECT
      current_user = (
        SELECT pg_get_userbyid(database_owner.datdba)
        FROM pg_database AS database_owner
        WHERE database_owner.datname = current_database()
      ) AS owns_current_database,
      has_database_privilege(
        current_user,
        current_database(),
        'CREATE'
      ) AS can_create_database_objects,
      has_schema_privilege(
        current_user,
        'public',
        'CREATE'
      ) AS can_create_schema_objects,
      has_table_privilege(
        current_user,
        'public.vulnerable_demo_users',
        'TRUNCATE'
      ) AS can_truncate_fictional_users
  `,
});

export async function loadUnauthorizedAdminView(pool, config) {
  await verifyVulnerableDemoTarget(pool, config);
  const result = await pool.query({
    ...UNAUTHORIZED_ADMIN_QUERY,
    values: [FICTIONAL_CUSTOMER_EMAIL],
  });
  const firstRow = result.rows[0];

  return Object.freeze({
    actor: firstRow
      ? Object.freeze({
          name: firstRow.actor_name,
          email: firstRow.actor_email,
          role: firstRow.actor_role,
        })
      : null,
    orders: Object.freeze(result.rows.map((row) => Object.freeze({
      id: row.order_id,
      status: row.status,
      totalCents: row.total_cents,
    }))),
  });
}

export async function inspectExcessiveDatabasePrivileges(pool, config) {
  await verifyVulnerableDemoTarget(pool, config);
  const result = await pool.query({ ...EXCESSIVE_PRIVILEGES_QUERY });

  return Object.freeze({ ...result.rows[0] });
}

export function unsafeSessionCookieHeader() {
  // Intentionally missing HttpOnly, SameSite, Secure, rotation, and entropy.
  return `${UNSAFE_SESSION_COOKIE_NAME}=${UNSAFE_SESSION_COOKIE_VALUE}; Path=/scenarios/unsafe-session`;
}

export function hasReusableUnsafeSession(cookieHeader) {
  if (typeof cookieHeader !== "string") {
    return false;
  }

  const expected = `${UNSAFE_SESSION_COOKIE_NAME}=${UNSAFE_SESSION_COOKIE_VALUE}`;

  return cookieHeader
    .split(";")
    .map((value) => value.trim())
    .includes(expected);
}
