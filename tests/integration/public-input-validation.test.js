import { once } from "node:events";

import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";

import { createApplication } from "../../src/app.js";
import { startServer } from "../../src/server.js";
import { MAXIMUM_URLENCODED_BODY_BYTES } from "../../src/validation/request.js";

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
  const server = startServer({ app, host: "127.0.0.1", port: 0 });
  await once(server, "listening");
  const address = server.address();

  return Object.freeze({
    baseUrl: `http://127.0.0.1:${address.port}`,
    server,
  });
}

async function get(baseUrl, path) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { accept: "text/html" },
    redirect: "manual",
  });

  return Object.freeze({ response, html: await response.text() });
}

async function post(baseUrl, path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      accept: "text/html",
      "content-type": "application/x-www-form-urlencoded",
    },
    body,
    redirect: "manual",
  });

  return Object.freeze({ response, html: await response.text() });
}

function form(values) {
  return new URLSearchParams(values).toString();
}

describe.sequential("public registration, login, menu, and search validation", () => {
  let authenticate;
  let baseUrl;
  let createCustomer;
  let getMenu;
  let getSearchResults;
  let server;

  beforeAll(async () => {
    createCustomer = vi.fn(async () => ({ id: "101" }));
    authenticate = vi.fn(async () => null);
    getMenu = vi.fn(async ({ category }) => ({
      foods: [],
      categories: [],
      selectedCategory: category || null,
    }));
    getSearchResults = vi.fn(async ({ query, category }) => ({
      foods: [],
      categories: [],
      query: query || null,
      selectedCategory: category || null,
    }));
    const app = createApplication({
      menuService: { getMenu, getSearchResults },
      sessionCookie: { name: "fictional_sid", secure: false },
      sessionMiddleware(request, _response, next) {
        request.session = {};
        next();
      },
      userService: { authenticate, createCustomer },
    });
    const listening = await listen(app);
    baseUrl = listening.baseUrl;
    server = listening.server;
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterAll(async () => {
    if (server) {
      await closeServer(server);
    }
  });

  test("normalizes valid registration input before creating an account", async () => {
    const password = "fictional-functional-password";
    const result = await post(baseUrl, "/register", form({
      name: "  Jose\u0301 Fiction  ",
      email: " FICTIONAL.USER@EXAMPLE.TEST ",
      password,
      passwordConfirmation: password,
    }));

    expect(result.response.status).toBe(303);
    expect(result.response.headers.get("location")).toBe("/login?registered=1");
    expect(createCustomer).toHaveBeenCalledWith({
      name: "José Fiction",
      email: "fictional.user@example.test",
      password,
    });
    expect(result.html).not.toContain(password);
  });

  test.each([
    ["missing", form({
      email: "missing@example.test",
      password: "fictional-password",
      passwordConfirmation: "fictional-password",
    })],
    ["malformed", form({
      name: "Malformed Fiction",
      email: "not-an-email",
      password: "fictional-password",
      passwordConfirmation: "fictional-password",
    })],
    ["duplicate", "name=First&name=Second&email=duplicate%40example.test&password=fictional&passwordConfirmation=fictional"],
    ["unexpected", form({
      name: "Unexpected Fiction",
      email: "unexpected@example.test",
      password: "fictional-password",
      passwordConfirmation: "fictional-password",
      role: "admin",
    })],
    ["boundary", form({
      name: "x".repeat(101),
      email: "boundary@example.test",
      password: "fictional-password",
      passwordConfirmation: "fictional-password",
    })],
    ["password mismatch", form({
      name: "Mismatch Fiction",
      email: "mismatch@example.test",
      password: "fictional-password-one",
      passwordConfirmation: "fictional-password-two",
    })],
  ])("rejects %s registration input before account creation", async (
    _description,
    body,
  ) => {
    const result = await post(baseUrl, "/register", body);

    expect(result.response.status).toBe(422);
    expect(result.html).toContain("Please review the form.");
    expect(result.html).not.toContain("password_hash");
    expect(createCustomer).not.toHaveBeenCalled();
  });

  test("bounds registration body size and parameter count before account creation", async () => {
    const oversized = await post(
      baseUrl,
      "/register",
      `name=${"x".repeat(MAXIMUM_URLENCODED_BODY_BYTES + 1)}`,
    );
    const excessiveParameters = await post(
      baseUrl,
      "/register",
      Array.from({ length: 13 }, (_value, index) => `field${index}=x`).join("&"),
    );

    expect(oversized.response.status).toBe(413);
    expect(excessiveParameters.response.status).toBe(413);
    expect(oversized.html).toContain("REQUEST_BODY_TOO_LARGE");
    expect(excessiveParameters.html).toContain(
      "REQUEST_PARAMETER_LIMIT_EXCEEDED",
    );
    expect(createCustomer).not.toHaveBeenCalled();
  });

  test("normalizes a valid login before returning the generic unknown-user response", async () => {
    const result = await post(baseUrl, "/login", form({
      email: " FICTIONAL.UNKNOWN@EXAMPLE.TEST ",
      password: "fictional-password",
    }));

    expect(result.response.status).toBe(401);
    expect(result.html).toContain("Email or password is incorrect.");
    expect(authenticate).toHaveBeenCalledWith({
      email: "fictional.unknown@example.test",
      password: "fictional-password",
    });
  });

  test.each([
    ["missing", "email=missing%40example.test"],
    ["malformed", "email=not-an-email&password=fictional"],
    ["duplicate", "email=one%40example.test&email=two%40example.test&password=fictional"],
    ["unexpected", "email=unexpected%40example.test&password=fictional&role=admin"],
    ["boundary", form({
      email: "boundary@example.test",
      password: "x".repeat(1_025),
    })],
  ])("uses the generic login failure for %s input", async (
    _description,
    body,
  ) => {
    const result = await post(baseUrl, "/login", body);

    expect(result.response.status).toBe(401);
    expect(result.html).toContain("Email or password is incorrect.");
    expect(result.html).not.toContain("RequestValidationError");
    expect(authenticate).not.toHaveBeenCalled();
  });

  test("allows only fixed login notice query fields and values", async () => {
    const valid = await get(baseUrl, "/login?registered=1");
    const duplicate = await get(baseUrl, "/login?registered=1&registered=1");
    const unexpected = await get(baseUrl, "/login?source=fictional");
    const malformed = await get(baseUrl, "/login?registered=0");

    expect(valid.response.status).toBe(200);
    expect(valid.html).toContain("Account created. Sign in to continue.");
    expect(duplicate.response.status).toBe(422);
    expect(unexpected.response.status).toBe(422);
    expect(malformed.response.status).toBe(422);
  });

  test("normalizes menu and search filters before service calls", async () => {
    const menu = await get(baseUrl, "/?category=%20drinks%20");
    const search = await get(
      baseUrl,
      "/search?q=%20Cafe%CC%81%20&category=%20drinks%20",
    );
    const emptySearch = await get(baseUrl, "/search?q=&category=");

    expect(menu.response.status).toBe(200);
    expect(search.response.status).toBe(200);
    expect(emptySearch.response.status).toBe(200);
    expect(getMenu).toHaveBeenCalledWith({ category: "drinks" });
    expect(getSearchResults).toHaveBeenNthCalledWith(1, {
      query: "Café",
      category: "drinks",
    });
    expect(getSearchResults).toHaveBeenNthCalledWith(2, {
      query: "",
      category: "",
    });
  });

  test.each([
    ["duplicate", "/?category=Mains&category=Drinks"],
    ["unexpected", "/?owner=fictional"],
    ["boundary", `/?category=${"x".repeat(81)}`],
  ])("rejects %s menu input before retrieval", async (
    _description,
    path,
  ) => {
    const result = await get(baseUrl, path);

    expect(result.response.status).toBe(422);
    expect(getMenu).not.toHaveBeenCalled();
  });

  test.each([
    ["duplicate", "/search?q=one&q=two"],
    ["unexpected", "/search?q=fictional&owner=fictional"],
    ["query boundary", `/search?q=${"x".repeat(121)}`],
    ["category boundary", `/search?category=${"x".repeat(81)}`],
  ])("rejects %s search input before retrieval", async (
    _description,
    path,
  ) => {
    const result = await get(baseUrl, path);

    expect(result.response.status).toBe(422);
    expect(result.html).toContain("The search could not be completed.");
    expect(result.html).not.toContain("RequestValidationError");
    expect(getSearchResults).not.toHaveBeenCalled();
  });

  test("rejects unexpected registration-page and logout fields", async () => {
    const registrationPage = await get(baseUrl, "/register?role=admin");
    const logout = await post(baseUrl, "/logout", "role=admin");

    expect(registrationPage.response.status).toBe(422);
    expect(logout.response.status).toBe(422);
  });
});
