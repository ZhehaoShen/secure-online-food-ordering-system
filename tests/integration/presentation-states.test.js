import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { createApplication } from "../../src/app.js";
import { PublicApplicationError } from "../../src/errors.js";
import { startServer } from "../../src/server.js";

function closeServer(server) {
  return new Promise((resolveClose, rejectClose) => {
    server.close((error) => {
      if (error) {
        rejectClose(error);
        return;
      }

      resolveClose();
    });
  });
}

async function listen(app) {
  const server = startServer({
    app,
    host: "127.0.0.1",
    port: 0,
  });
  if (!server.listening) {
    await new Promise((resolveListening) => {
      server.once("listening", resolveListening);
    });
  }
  const address = server.address();

  return Object.freeze({
    baseUrl: `http://127.0.0.1:${address.port}`,
    server,
  });
}

function fictionalSession(request, _response, next) {
  const role = request.get("x-fictional-role");
  request.session = {};

  if (role === "customer" || role === "admin") {
    request.session.user = {
      id: role === "admin" ? "2" : "1",
      name: `<script>fictional ${role}</script>`,
      role,
    };
  }

  next();
}

function publicFailure(statusCode, code, message) {
  return new PublicApplicationError({
    name: "FictionalPresentationError",
    code,
    message,
    statusCode,
  });
}

async function getHtml(baseUrl, path, headers = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: {
      accept: "text/html",
      ...headers,
    },
  });

  return Object.freeze({
    response,
    html: await response.text(),
  });
}

describe.sequential("shared Day 3 presentation states", () => {
  let baseUrl;
  let server;

  beforeAll(async () => {
    const menuService = {
      async getMenu() {
        return {
          foods: [{
            id: "1",
            name: "<script>fictional dish</script>",
            description: "A fictional & safely escaped description.",
            category: "Mains",
            priceCents: 1299,
            isAvailable: true,
          }],
          categories: ["Mains"],
          selectedCategory: null,
        };
      },
      async getSearchResults() {
        return {
          foods: [],
          categories: ["Mains"],
          query: null,
          selectedCategory: null,
        };
      },
    };
    const app = createApplication({
      menuService,
      sessionMiddleware: fictionalSession,
      registerRoutes(application) {
        application.get("/presentation/403", (_request, _response, next) => {
          next(publicFailure(
            403,
            "FICTIONAL_ACCESS_DENIED",
            "Administrator access is required.",
          ));
        });
        application.get("/presentation/409", (_request, _response, next) => {
          next(publicFailure(
            409,
            "FICTIONAL_CONFLICT",
            "This fictional request conflicts with the current state.",
          ));
        });
        application.get("/presentation/422", (_request, _response, next) => {
          next(publicFailure(
            422,
            "FICTIONAL_INVALID_INPUT",
            "Check the fictional values and try again.",
          ));
        });
        application.get("/presentation/500", () => {
          throw new Error("password=internal-fictional-marker");
        });
      },
    });
    const listening = await listen(app);
    baseUrl = listening.baseUrl;
    server = listening.server;
  });

  afterAll(async () => {
    if (server) {
      await closeServer(server);
    }
  });

  test("shows navigation appropriate to anonymous, customer, and admin users", async () => {
    const anonymous = await getHtml(baseUrl, "/");
    const customer = await getHtml(baseUrl, "/", {
      "x-fictional-role": "customer",
    });
    const admin = await getHtml(baseUrl, "/", {
      "x-fictional-role": "admin",
    });

    expect(anonymous.html).toContain('href="/register"');
    expect(anonymous.html).toContain('href="/login"');
    expect(anonymous.html).not.toContain('href="/cart"');
    expect(anonymous.html).not.toContain('href="/orders"');
    expect(anonymous.html).not.toContain('href="/admin/food-items"');

    expect(customer.html).toContain('href="/cart"');
    expect(customer.html).toContain('href="/orders"');
    expect(customer.html).toContain("Sign out");
    expect(customer.html).not.toContain('href="/admin/food-items"');

    expect(admin.html).toContain('href="/cart"');
    expect(admin.html).toContain('href="/orders"');
    expect(admin.html).toContain('href="/admin/food-items"');
    expect(admin.html).toContain('href="/admin/orders"');
  });

  test("escapes fictional menu and identity content", async () => {
    const result = await getHtml(baseUrl, "/", {
      "x-fictional-role": "customer",
    });

    expect(result.response.status).toBe(200);
    expect(result.html).toContain("&lt;script&gt;fictional dish&lt;/script&gt;");
    expect(result.html).toContain(
      "A fictional &amp; safely escaped description.",
    );
    expect(result.html).toContain(
      "&lt;script&gt;fictional customer&lt;/script&gt;",
    );
    expect(result.html).not.toContain("<script>fictional");
  });

  test.each([
    ["/missing-fictional-page", 404, "Page not found"],
    ["/presentation/403", 403, "Access denied"],
    ["/presentation/409", 409, "Request conflict"],
    ["/presentation/422", 422, "Check your request"],
    ["/presentation/500", 500, "Unexpected error"],
  ])("renders a safe browser state for %s", async (
    path,
    expectedStatus,
    expectedTitle,
  ) => {
    const result = await getHtml(baseUrl, path);

    expect(result.response.status).toBe(expectedStatus);
    expect(result.html).toContain(`<title>${expectedTitle}`);
    expect(result.html).not.toContain("internal-fictional-marker");
    expect(result.html).not.toContain("password=");
    expect(result.html).not.toContain("FictionalPresentationError");
    expect(result.html).not.toContain(" at ");
    expect(result.html).not.toContain("<pre>");
  });
});
