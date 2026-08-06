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
import { MAXIMUM_POSTGRESQL_BIGINT } from "../../src/validation/request.js";

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

async function post(baseUrl, path, body = "") {
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

const EMPTY_CART = Object.freeze({
  items: Object.freeze([]),
  itemCount: 0,
  totalCents: 0,
  state: Object.freeze({ items: Object.freeze({}) }),
  removedUnavailableCount: 0,
});

describe.sequential("customer cart and order request validation", () => {
  let addItem;
  let baseUrl;
  let checkout;
  let getCart;
  let getCustomerOrder;
  let listCustomerOrders;
  let removeItem;
  let server;
  let updateItem;

  beforeAll(async () => {
    getCart = vi.fn(async () => EMPTY_CART);
    addItem = vi.fn(async () => EMPTY_CART.state);
    updateItem = vi.fn(async () => EMPTY_CART.state);
    removeItem = vi.fn(() => EMPTY_CART.state);
    checkout = vi.fn(async () => ({ id: "701" }));
    listCustomerOrders = vi.fn(async () => []);
    getCustomerOrder = vi.fn(async () => ({
      id: "701",
      userId: "41",
      status: "confirmed",
      totalCents: 0,
      createdAt: new Date("2026-08-03T12:00:00Z"),
      updatedAt: new Date("2026-08-03T12:00:00Z"),
      items: [],
    }));
    const app = createApplication({
      cartService: { addItem, getCart, removeItem, updateItem },
      orderService: {
        checkout,
        getCustomerOrder,
        listCustomerOrders,
      },
      sessionMiddleware(request, _response, next) {
        request.session = {
          user: { id: "41", name: "Customer Fiction", role: "customer" },
          cart: { items: { "7": 2 } },
          save(callback) {
            callback();
          },
        };
        next();
      },
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

  test("passes only normalized cart identifiers and quantities", async () => {
    const add = await post(baseUrl, "/cart/items", "foodItemId=7&quantity=2");
    const update = await post(
      baseUrl,
      "/cart/items/7/update",
      "quantity=3",
    );
    const remove = await post(baseUrl, "/cart/items/7/remove");

    expect(add.response.status).toBe(303);
    expect(update.response.status).toBe(303);
    expect(remove.response.status).toBe(303);
    expect(addItem).toHaveBeenCalledWith(
      { items: { "7": 2 } },
      { foodItemId: "7", quantity: "2" },
    );
    expect(updateItem).toHaveBeenCalledWith(
      { items: { "7": 2 } },
      { foodItemId: "7", quantity: "3" },
    );
    expect(removeItem).toHaveBeenCalledWith(
      { items: { "7": 2 } },
      { foodItemId: "7" },
    );
  });

  test.each([
    ["missing ID", "quantity=1"],
    ["zero ID", "foodItemId=0&quantity=1"],
    ["overflow ID", `foodItemId=${MAXIMUM_POSTGRESQL_BIGINT + 1n}&quantity=1`],
    ["missing quantity", "foodItemId=7"],
    ["decimal quantity", "foodItemId=7&quantity=1.5"],
    ["quantity boundary", "foodItemId=7&quantity=100"],
    ["duplicate quantity", "foodItemId=7&quantity=1&quantity=2"],
    ["unexpected trusted values", "foodItemId=7&quantity=1&priceCents=1&userId=1&role=admin"],
  ])("rejects %s before adding a cart item", async (
    _description,
    body,
  ) => {
    const result = await post(baseUrl, "/cart/items", body);

    expect(result.response.status).toBe(422);
    expect(result.html).not.toContain("RequestValidationError");
    expect(addItem).not.toHaveBeenCalled();
  });

  test.each([
    ["invalid route ID", "/cart/items/0/update", "quantity=1"],
    ["duplicate quantity", "/cart/items/7/update", "quantity=1&quantity=2"],
    ["unexpected status", "/cart/items/7/update", "quantity=1&status=completed"],
  ])("rejects %s before updating a cart item", async (
    _description,
    path,
    body,
  ) => {
    const result = await post(baseUrl, path, body);

    expect(result.response.status).toBe(422);
    expect(updateItem).not.toHaveBeenCalled();
  });

  test("rejects invalid remove shapes before session mutation", async () => {
    const invalidId = await post(baseUrl, "/cart/items/0/remove");
    const unexpected = await post(
      baseUrl,
      "/cart/items/7/remove",
      "ownerId=41",
    );

    expect(invalidId.response.status).toBe(422);
    expect(unexpected.response.status).toBe(422);
    expect(removeItem).not.toHaveBeenCalled();
  });

  test("rejects client-owned checkout values and preserves the session cart", async () => {
    const result = await post(
      baseUrl,
      "/orders",
      "priceCents=1&totalCents=1&userId=1&role=admin&status=completed&foodNameSnapshot=changed",
    );

    expect(result.response.status).toBe(422);
    expect(result.html).toContain("unexpected field");
    expect(checkout).not.toHaveBeenCalled();
    expect(getCart).toHaveBeenCalledWith({ items: { "7": 2 } });
  });

  test("uses only authenticated identity and session cart for valid checkout", async () => {
    const result = await post(baseUrl, "/orders");

    expect(result.response.status).toBe(303);
    expect(result.response.headers.get("location")).toBe("/orders/701");
    expect(checkout).toHaveBeenCalledWith({
      userId: "41",
      cart: { items: { "7": 2 } },
    });
  });

  test("enforces exact cart and order-history query shapes", async () => {
    const cart = await get(baseUrl, "/cart?ownerId=41");
    const history = await get(baseUrl, "/orders?status=completed");

    expect(cart.response.status).toBe(422);
    expect(history.response.status).toBe(422);
    expect(getCart).not.toHaveBeenCalled();
    expect(listCustomerOrders).not.toHaveBeenCalled();
  });

  test("uses authenticated identity and a normalized order ID for detail", async () => {
    const history = await get(baseUrl, "/orders");
    const detail = await get(baseUrl, "/orders/701");

    expect(history.response.status).toBe(200);
    expect(detail.response.status).toBe(200);
    expect(listCustomerOrders).toHaveBeenCalledWith({ userId: "41" });
    expect(getCustomerOrder).toHaveBeenCalledWith({
      userId: "41",
      orderId: "701",
    });
  });

  test("maps invalid order IDs to the existing missing state without retrieval", async () => {
    const zero = await get(baseUrl, "/orders/0");
    const overflow = await get(
      baseUrl,
      `/orders/${MAXIMUM_POSTGRESQL_BIGINT + 1n}`,
    );
    const unexpected = await get(baseUrl, "/orders/701?ownerId=41");

    expect(zero.response.status).toBe(404);
    expect(overflow.response.status).toBe(404);
    expect(zero.html).toContain("The order could not be found.");
    expect(unexpected.response.status).toBe(422);
    expect(getCustomerOrder).not.toHaveBeenCalled();
  });
});
