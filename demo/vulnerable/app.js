import express from "express";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  LOCAL_ONLY_WARNING_TEXT,
  LOCAL_ONLY_WARNING_TITLE,
} from "./safety.js";
import {
  APPROVED_WEAK_PASSWORD,
  APPROVED_XSS_PAYLOAD,
  hasReusableUnsafeSession,
  inspectExcessiveDatabasePrivileges,
  loadUnauthorizedAdminView,
  unsafeSessionCookieHeader,
  XSS_CONTROL_MESSAGE,
} from "./baseline-scenarios.js";
import {
  VulnerableDemoTargetError,
  verifyVulnerableDemoTarget,
} from "./target.js";

const DEMO_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(DEMO_DIRECTORY, "..", "..");
const VIEW_DIRECTORY = resolve(DEMO_DIRECTORY, "views");
const PUBLIC_DIRECTORY = resolve(PROJECT_ROOT, "public");

export const SQL_INJECTION_CONTROL_TERM = "Classroom Veggie Wrap";
export const APPROVED_SQL_INJECTION_PAYLOAD =
  "does-not-match%' OR '1'='1' -- ";

const FICTIONAL_USERS_QUERY = Object.freeze({
  name: "vulnerable-demo-list-fictional-users",
  text: `
    SELECT id, name, email, role
    FROM vulnerable_demo_users
    ORDER BY id ASC
  `,
});

const FICTIONAL_FOODS_QUERY = Object.freeze({
  name: "vulnerable-demo-list-fictional-foods",
  text: `
    SELECT id, name, category, description, price_cents
    FROM vulnerable_demo_foods
    ORDER BY id ASC
  `,
});

const FICTIONAL_ORDERS_QUERY = Object.freeze({
  name: "vulnerable-demo-list-fictional-orders",
  text: `
    SELECT
      demo_order.id,
      demo_order.status,
      demo_order.total_cents,
      demo_user.name AS customer_name,
      count(demo_item.food_id)::integer AS line_count
    FROM vulnerable_demo_orders AS demo_order
    JOIN vulnerable_demo_users AS demo_user
      ON demo_user.id = demo_order.user_id
    LEFT JOIN vulnerable_demo_order_items AS demo_item
      ON demo_item.order_id = demo_order.id
    GROUP BY demo_order.id, demo_user.id
    ORDER BY demo_order.id ASC
  `,
});

function money(cents) {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
  }).format(cents / 100);
}

async function loadFictionalData(pool) {
  const [users, foods, orders] = await Promise.all([
    pool.query({ ...FICTIONAL_USERS_QUERY }),
    pool.query({ ...FICTIONAL_FOODS_QUERY }),
    pool.query({ ...FICTIONAL_ORDERS_QUERY }),
  ]);

  return Object.freeze({
    users: Object.freeze(users.rows),
    foods: Object.freeze(foods.rows.map((food) => Object.freeze({
      ...food,
      price: money(food.price_cents),
    }))),
    orders: Object.freeze(orders.rows.map((order) => Object.freeze({
      ...order,
      total: money(order.total_cents),
    }))),
  });
}

function renderError(response, statusCode, message) {
  response.status(statusCode).render("error", {
    pageTitle: "Demo unavailable",
    message,
  });
}

function scenarioQuery(value) {
  if (value === undefined) {
    return null;
  }

  if (
    typeof value !== "string" ||
    ![
      SQL_INJECTION_CONTROL_TERM,
      APPROVED_SQL_INJECTION_PAYLOAD,
    ].includes(value)
  ) {
    return undefined;
  }

  return value;
}

async function runIntentionallyVulnerableSearch(pool, config, query) {
  await verifyVulnerableDemoTarget(pool, config);

  // Intentionally vulnerable for one isolated classroom comparison only.
  // The caller allowlists one control value and one read-only approved payload.
  const intentionallyDynamicSql = `
    SELECT id, name, category, description, price_cents
    FROM vulnerable_demo_foods
    WHERE name ILIKE '%${query}%'
    ORDER BY id ASC
  `;
  const result = await pool.query(intentionallyDynamicSql);

  return Object.freeze(result.rows.map((food) => Object.freeze({
    ...food,
    price: money(food.price_cents),
  })));
}

function renderSqlScenario(response, {
  statusCode = 200,
  query = "",
  foods = [],
  error = null,
} = {}) {
  response.status(statusCode).render("sql-injection", {
    pageTitle: "Controlled SQL injection demonstration",
    query,
    foods,
    error,
    controlTerm: SQL_INJECTION_CONTROL_TERM,
    approvedPayload: APPROVED_SQL_INJECTION_PAYLOAD,
  });
}

function renderBaselineScenario(response, scenario, {
  statusCode = 200,
  result = null,
  error = null,
} = {}) {
  response.status(statusCode).render("baseline-scenario", {
    pageTitle: scenario.heading,
    scenario,
    result,
    error,
  });
}

function fixedScenarioInput(value, approvedValues) {
  if (value === undefined) {
    return null;
  }

  return typeof value === "string" && approvedValues.includes(value)
    ? value
    : undefined;
}

const XSS_SCENARIO = Object.freeze({
  label: "Prepared baseline · reflected XSS",
  heading: "Unescaped fictional message executes markup",
  description: "The result deliberately places one fixed classroom payload into an unescaped template sink. The payload only marks this local page and performs no network or data operation.",
  expected: "The control remains text, while the approved payload creates the xss-demo-marker element and sets the page xssDemo marker.",
  form: Object.freeze({
    method: "get",
    action: "/scenarios/xss",
    buttons: Object.freeze([
      Object.freeze({
        name: "message",
        value: XSS_CONTROL_MESSAGE,
        label: "Run escaped control",
      }),
      Object.freeze({
        name: "message",
        value: APPROVED_XSS_PAYLOAD,
        label: "Run approved XSS marker",
        danger: true,
      }),
    ]),
  }),
});

const WEAK_PASSWORD_SCENARIO = Object.freeze({
  label: "Prepared baseline · weak password handling",
  heading: "Four-character fictional password is accepted",
  description: "This isolated check deliberately applies no length, complexity, breached-password, hashing, or account policy. It does not create or authenticate any account.",
  expected: "The fixed four-character classroom password is accepted as sufficient.",
  form: Object.freeze({
    method: "post",
    action: "/scenarios/weak-password",
    buttons: Object.freeze([
      Object.freeze({
        name: "password",
        value: APPROVED_WEAK_PASSWORD,
        label: "Submit approved weak example",
        danger: true,
      }),
    ]),
  }),
});

const UNSAFE_SESSION_SCENARIO = Object.freeze({
  label: "Prepared baseline · unsafe session behavior",
  heading: "Predictable fictional session can be reused",
  description: "The demo deliberately issues one fixed classroom cookie without rotation or protective attributes, then trusts the same value as a fictional customer session.",
  expected: "Every start receives the same cookie, and reuse grants the same fictional customer identity.",
  form: Object.freeze({
    method: "post",
    action: "/scenarios/unsafe-session",
    buttons: Object.freeze([
      Object.freeze({
        name: "action",
        value: "start",
        label: "Start fixed session",
        danger: true,
      }),
      Object.freeze({
        name: "action",
        value: "reuse",
        label: "Reuse browser cookie",
        danger: true,
      }),
    ]),
  }),
});

const MISSING_ADMIN_AUTHORIZATION_SCENARIO = Object.freeze({
  label: "Prepared baseline · missing administrator authorization",
  heading: "Fictional customer reaches administrator order data",
  description: "The route identifies the seeded customer but deliberately omits the administrator-role decision before reading the isolated order-management view.",
  expected: "The fictional customer receives the one fictional administrator order record despite having role customer.",
  form: Object.freeze({
    method: "post",
    action: "/scenarios/missing-admin-authorization",
    buttons: Object.freeze([
      Object.freeze({
        name: "actor",
        value: "fictional-customer",
        label: "Open admin view as customer",
        danger: true,
      }),
    ]),
  }),
});

const EXCESSIVE_DATABASE_PRIVILEGES_SCENARIO = Object.freeze({
  label: "Prepared baseline · excessive database privileges",
  heading: "Demo application user owns excessive privileges",
  description: "This read-only catalog inspection deliberately reveals that the dedicated demo user owns the dummy database and can create or truncate objects. It does not exercise those permissions.",
  expected: "Ownership plus database CREATE, schema CREATE, and fictional-user-table TRUNCATE privileges all report enabled.",
  form: Object.freeze({
    method: "post",
    action: "/scenarios/excessive-database-privileges",
    buttons: Object.freeze([
      Object.freeze({
        name: "inspect",
        value: "approved-read-only",
        label: "Inspect demo-only privileges",
        danger: true,
      }),
    ]),
  }),
});

export function createVulnerableDemoApplication({ pool, config } = {}) {
  if (!pool || typeof pool.query !== "function") {
    throw new TypeError("A vulnerable demo database pool is required.");
  }

  if (
    !config ||
    config.mode !== "local-classroom-only" ||
    config.dataClassification !== "fictional-only" ||
    config.databaseMarker !== "isolated-vulnerable-demo"
  ) {
    throw new TypeError("An isolated vulnerable demo configuration is required.");
  }

  const app = express();
  app.disable("x-powered-by");
  app.set("view engine", "ejs");
  app.set("views", VIEW_DIRECTORY);
  app.locals.warningTitle = LOCAL_ONLY_WARNING_TITLE;
  app.locals.warningText = LOCAL_ONLY_WARNING_TEXT;
  app.use((_request, response, next) => {
    response.set({
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
    });
    next();
  });
  app.use("/assets", express.static(PUBLIC_DIRECTORY, {
    dotfiles: "deny",
    index: false,
  }));
  app.use(express.urlencoded({
    extended: false,
    limit: "2kb",
    parameterLimit: 4,
  }));

  app.get("/", async (_request, response) => {
    try {
      response.status(200).render("index", {
        pageTitle: "Menu",
        data: await loadFictionalData(pool),
      });
    } catch {
      renderError(
        response,
        503,
        "The isolated fictional demo data is unavailable.",
      );
    }
  });

  app.get("/register", (_request, response) => {
    response.render("register", {
      pageTitle: "Register",
      values: { name: "", email: "" },
      errors: [],
    });
  });

  app.post("/register", async (request, response) => {
    const { name, email, password, passwordConfirmation } = request.body || {};
    const errors = [];

    if (!name || !email || !password) {
      errors.push("Name, email address, and password are required.");
    } else if (password !== passwordConfirmation) {
      errors.push("Passwords do not match.");
    }

    if (errors.length > 0) {
      return response.status(422).render("register", {
        pageTitle: "Register",
        values: { name: name || "", email: email || "" },
        errors,
      });
    }

    return response.render("login", {
      pageTitle: "Sign in",
      email: email || "",
      notice: "Account registered successfully! Weak password accepted without policy checks. You can now sign in.",
      errors: [],
    });
  });

  app.get("/login", (_request, response) => {
    response.render("login", {
      pageTitle: "Sign in",
      email: "",
      notice: null,
      errors: [],
    });
  });

  app.post("/login", async (request, response) => {
    const { email } = request.body || {};

    if (!email) {
      return response.status(422).render("login", {
        pageTitle: "Sign in",
        email: "",
        notice: null,
        errors: ["Email address is required."],
      });
    }

    try {
      await verifyVulnerableDemoTarget(pool, config);

      const isSqliPayload =
        typeof email === "string" &&
        (email.includes("' OR '") ||
          email.includes("' OR 1=1") ||
          email.includes(APPROVED_SQL_INJECTION_PAYLOAD));

      if (isSqliPayload) {
        const insecureSql = `SELECT id, name, email, role FROM vulnerable_demo_users WHERE email = '${email}'`;
        const result = await pool.query(insecureSql);
        if (result.rows.length > 0) {
          const user = result.rows[0];
          response.setHeader("Set-Cookie", unsafeSessionCookieHeader());
          return response.render("index", {
            pageTitle: "Menu",
            notice: `Authentication bypassed via SQL Injection! Signed in as ${user.name} (${user.role}).`,
            data: await loadFictionalData(pool),
            currentUser: user,
          });
        }
      }

      const normalSql =
        "SELECT id, name, email, role FROM vulnerable_demo_users WHERE email = $1";
      const result = await pool.query(normalSql, [email]);
      if (result.rows.length > 0) {
        const user = result.rows[0];
        response.setHeader("Set-Cookie", unsafeSessionCookieHeader());
        return response.render("index", {
          pageTitle: "Menu",
          notice: `Successfully signed in as ${user.name}.`,
          data: await loadFictionalData(pool),
          currentUser: user,
        });
      }

      return response.status(401).render("login", {
        pageTitle: "Sign in",
        email,
        notice: null,
        errors: ["Invalid email or password."],
      });
    } catch {
      return response.status(500).render("login", {
        pageTitle: "Sign in",
        email,
        notice: null,
        errors: ["Authentication error in vulnerable environment."],
      });
    }
  });

  app.post("/logout", (_request, response) => {
    response.setHeader(
      "Set-Cookie",
      "vulnerable_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT",
    );
    response.redirect("/");
  });

  app.get("/search", async (request, response) => {
    const query = request.query.q || "";
    try {
      let foods = [];
      if (query) {
        const searchSql = `SELECT id, name, category, description, price_cents FROM vulnerable_demo_foods WHERE name ILIKE '%${query}%' ORDER BY id ASC`;
        const result = await pool.query(searchSql);
        foods = result.rows.map((food) => ({
          ...food,
          price: money(food.price_cents),
        }));
      } else {
        const result = await pool.query(FICTIONAL_FOODS_QUERY);
        foods = result.rows.map((food) => ({
          ...food,
          price: money(food.price_cents),
        }));
      }

      response.render("search", {
        pageTitle: "Search menu",
        query,
        foods,
        errors: [],
      });
    } catch {
      response.render("search", {
        pageTitle: "Search menu",
        query,
        foods: [],
        errors: ["Search failed."],
      });
    }
  });

  app.get("/admin/orders", async (_request, response) => {
    try {
      const data = await loadUnauthorizedAdminView(pool, config);
      response.render("admin-orders", {
        pageTitle: "Manage orders",
        orders: data.orders,
      });
    } catch {
      renderError(response, 503, "Admin orders unavailable.");
    }
  });

  app.get("/admin/audit-logs", (_request, response) => {
    response.render("admin-audit-logs", {
      pageTitle: "Audit logs",
    });
  });

  app.get("/scenarios/sql-injection", async (request, response) => {
    const query = scenarioQuery(request.query.q);

    if (query === undefined) {
      renderSqlScenario(response, {
        statusCode: 422,
        error: "Only the documented control term and approved read-only classroom payload are accepted.",
      });
      return;
    }

    if (query === null) {
      renderSqlScenario(response);
      return;
    }

    try {
      renderSqlScenario(response, {
        query,
        foods: await runIntentionallyVulnerableSearch(pool, config, query),
      });
    } catch (error) {
      renderSqlScenario(response, {
        statusCode: error instanceof VulnerableDemoTargetError ? 503 : 500,
        query,
        error: "The isolated SQL demonstration is unavailable.",
      });
    }
  });

  app.get("/scenarios/xss", (request, response) => {
    const message = fixedScenarioInput(request.query.message, [
      XSS_CONTROL_MESSAGE,
      APPROVED_XSS_PAYLOAD,
    ]);

    if (message === undefined) {
      renderBaselineScenario(response, XSS_SCENARIO, {
        statusCode: 422,
        error: "Only the fixed control and approved local XSS marker are accepted.",
      });
      return;
    }

    if (message === null) {
      renderBaselineScenario(response, XSS_SCENARIO);
      return;
    }

    renderBaselineScenario(response, XSS_SCENARIO, {
      result: message === APPROVED_XSS_PAYLOAD
        ? {
            heading: "Approved markup reached the raw sink",
            message: "The fixed SVG marker is present as executable markup and only changes this page's xssDemo data marker.",
            rawHtml: message,
          }
        : {
            heading: "Control remained ordinary text",
            message,
          },
    });
  });

  app.get("/scenarios/weak-password", (_request, response) => {
    renderBaselineScenario(response, WEAK_PASSWORD_SCENARIO);
  });

  app.post("/scenarios/weak-password", (request, response) => {
    const password = fixedScenarioInput(request.body?.password, [
      APPROVED_WEAK_PASSWORD,
    ]);

    renderBaselineScenario(response, WEAK_PASSWORD_SCENARIO, password
      ? {
          result: {
            heading: "Weak fictional password accepted",
            message: "The baseline accepted a four-character value without policy validation or account storage.",
          },
        }
      : {
          statusCode: 422,
          error: "Only the fixed fictional weak-password example is accepted.",
        });
  });

  app.get("/scenarios/unsafe-session", (_request, response) => {
    renderBaselineScenario(response, UNSAFE_SESSION_SCENARIO);
  });

  app.post("/scenarios/unsafe-session", (request, response) => {
    const action = fixedScenarioInput(request.body?.action, ["start", "reuse"]);

    if (action === "start") {
      response.setHeader("Set-Cookie", unsafeSessionCookieHeader());
      renderBaselineScenario(response, UNSAFE_SESSION_SCENARIO, {
        result: {
          heading: "Fixed session issued",
          message: "The same predictable classroom cookie is issued every time without rotation or protective attributes.",
        },
      });
      return;
    }

    if (action === "reuse" && hasReusableUnsafeSession(request.headers.cookie)) {
      renderBaselineScenario(response, UNSAFE_SESSION_SCENARIO, {
        result: {
          heading: "Fixed session reused as fictional customer",
          message: "The route trusted the shared cookie as Fictional Demo Customer without rotation or a server-side session lookup.",
        },
      });
      return;
    }

    renderBaselineScenario(response, UNSAFE_SESSION_SCENARIO, {
      statusCode: 422,
      error: "Start the fixed fictional session before attempting reuse.",
    });
  });

  app.get("/scenarios/missing-admin-authorization", (_request, response) => {
    renderBaselineScenario(response, MISSING_ADMIN_AUTHORIZATION_SCENARIO);
  });

  app.post("/scenarios/missing-admin-authorization", async (request, response) => {
    const actor = fixedScenarioInput(request.body?.actor, [
      "fictional-customer",
    ]);

    if (!actor) {
      renderBaselineScenario(response, MISSING_ADMIN_AUTHORIZATION_SCENARIO, {
        statusCode: 422,
        error: "Only the fixed fictional customer actor is accepted.",
      });
      return;
    }

    try {
      const data = await loadUnauthorizedAdminView(pool, config);
      renderBaselineScenario(response, MISSING_ADMIN_AUTHORIZATION_SCENARIO, {
        result: {
          heading: "Customer received administrator order view",
          message: "The baseline identified a customer role but deliberately performed no administrator authorization check.",
          details: [
            { label: "Fictional actor role", value: data.actor?.role },
            { label: "Administrator orders exposed", value: data.orders.length },
            { label: "Fictional order", value: `#${data.orders[0]?.id}` },
          ],
        },
      });
    } catch (error) {
      renderBaselineScenario(response, MISSING_ADMIN_AUTHORIZATION_SCENARIO, {
        statusCode: error instanceof VulnerableDemoTargetError ? 503 : 500,
        error: "The isolated authorization demonstration is unavailable.",
      });
    }
  });

  app.get("/scenarios/excessive-database-privileges", (_request, response) => {
    renderBaselineScenario(response, EXCESSIVE_DATABASE_PRIVILEGES_SCENARIO);
  });

  app.post("/scenarios/excessive-database-privileges", async (request, response) => {
    const inspect = fixedScenarioInput(request.body?.inspect, [
      "approved-read-only",
    ]);

    if (!inspect) {
      renderBaselineScenario(response, EXCESSIVE_DATABASE_PRIVILEGES_SCENARIO, {
        statusCode: 422,
        error: "Only the fixed read-only privilege inspection is accepted.",
      });
      return;
    }

    try {
      const privileges = await inspectExcessiveDatabasePrivileges(pool, config);
      renderBaselineScenario(response, EXCESSIVE_DATABASE_PRIVILEGES_SCENARIO, {
        result: {
          heading: "Excessive demo-only privileges confirmed",
          message: "The dedicated fictional demo user has all four intentionally excessive capabilities; none was exercised.",
          details: [
            { label: "Owns dummy database", value: privileges.owns_current_database },
            { label: "Can create database objects", value: privileges.can_create_database_objects },
            { label: "Can create schema objects", value: privileges.can_create_schema_objects },
            { label: "Can truncate fictional users", value: privileges.can_truncate_fictional_users },
          ],
        },
      });
    } catch (error) {
      renderBaselineScenario(response, EXCESSIVE_DATABASE_PRIVILEGES_SCENARIO, {
        statusCode: error instanceof VulnerableDemoTargetError ? 503 : 500,
        error: "The isolated database-privilege demonstration is unavailable.",
      });
    }
  });

  app.get("/health", async (_request, response) => {
    try {
      await verifyVulnerableDemoTarget(pool, config);

      response.status(200).json({
        status: "ok",
        environment: "isolated-vulnerable-demo",
        data: "fictional-only",
        warning: LOCAL_ONLY_WARNING_TITLE,
      });
    } catch {
      response.status(503).json({
        status: "unavailable",
        environment: "isolated-vulnerable-demo",
        warning: LOCAL_ONLY_WARNING_TITLE,
      });
    }
  });

  app.use((_request, response) => {
    renderError(
      response,
      404,
      "This isolated demo page could not be found.",
    );
  });

  return app;
}
