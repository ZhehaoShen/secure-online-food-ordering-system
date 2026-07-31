import { deferredAuditRecorder } from "../audit/deferred-audit-recorder.js";
import { PublicApplicationError } from "../errors.js";

const MAXIMUM_DISTINCT_ITEMS = 100;
const MAXIMUM_QUANTITY = 99;
const MAXIMUM_DATABASE_ID = 9_223_372_036_854_775_807n;
const MAXIMUM_ORDER_TOTAL_CENTS = 2_147_483_647;

export class EmptyOrderDraftError extends PublicApplicationError {
  constructor() {
    super({
      name: "EmptyOrderDraftError",
      code: "EMPTY_ORDER_DRAFT",
      message: "Add at least one available food before placing an order.",
      statusCode: 409,
    });
  }
}

export class InvalidOrderDraftError extends PublicApplicationError {
  constructor() {
    super({
      name: "InvalidOrderDraftError",
      code: "INVALID_ORDER_DRAFT",
      message: "The order draft is invalid.",
      statusCode: 409,
    });
  }
}

export class OrderItemsUnavailableError extends PublicApplicationError {
  constructor() {
    super({
      name: "OrderItemsUnavailableError",
      code: "ORDER_ITEMS_UNAVAILABLE",
      message:
        "The order could not be placed because one or more foods are unavailable.",
      statusCode: 409,
    });
  }
}

export class OrderNotFoundError extends PublicApplicationError {
  constructor() {
    super({
      name: "OrderNotFoundError",
      code: "ORDER_NOT_FOUND",
      message: "The order could not be found.",
      statusCode: 404,
    });
  }
}

function validDatabaseId(value) {
  return typeof value === "string" &&
    /^[1-9][0-9]{0,18}$/.test(value) &&
    BigInt(value) <= MAXIMUM_DATABASE_ID;
}

function normalizeUserId(value) {
  if (!validDatabaseId(value)) {
    throw new InvalidOrderDraftError();
  }

  return value;
}

function normalizeOrderId(value) {
  if (!validDatabaseId(value)) {
    throw new OrderNotFoundError();
  }

  return value;
}

function normalizeCart(cart) {
  if (
    !cart ||
    typeof cart !== "object" ||
    Array.isArray(cart) ||
    !cart.items ||
    typeof cart.items !== "object" ||
    Array.isArray(cart.items)
  ) {
    throw new EmptyOrderDraftError();
  }

  const entries = Object.entries(cart.items);

  if (entries.length === 0) {
    throw new EmptyOrderDraftError();
  }

  if (entries.length > MAXIMUM_DISTINCT_ITEMS) {
    throw new InvalidOrderDraftError();
  }

  return Object.freeze(entries.map(([foodItemId, quantity]) => {
    if (
      !validDatabaseId(foodItemId) ||
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > MAXIMUM_QUANTITY
    ) {
      throw new InvalidOrderDraftError();
    }

    return Object.freeze({
      foodItemId,
      quantity,
    });
  }));
}

function calculateOrderLines(cartItems, foods) {
  if (foods.length !== cartItems.length) {
    throw new OrderItemsUnavailableError();
  }

  const foodsById = new Map(foods.map((food) => [food.id, food]));
  const lines = cartItems.map((cartItem) => {
    const food = foodsById.get(cartItem.foodItemId);

    if (
      !food ||
      !food.isAvailable ||
      !Number.isInteger(food.priceCents) ||
      food.priceCents < 0
    ) {
      throw new OrderItemsUnavailableError();
    }

    return Object.freeze({
      foodItemId: food.id,
      foodNameSnapshot: food.name,
      unitPriceCents: food.priceCents,
      quantity: cartItem.quantity,
      lineTotalCents: food.priceCents * cartItem.quantity,
    });
  });
  const totalCents = lines.reduce(
    (total, line) => total + line.lineTotalCents,
    0,
  );

  if (
    !Number.isSafeInteger(totalCents) ||
    totalCents < 0 ||
    totalCents > MAXIMUM_ORDER_TOTAL_CENTS
  ) {
    throw new InvalidOrderDraftError();
  }

  return Object.freeze({
    lines: Object.freeze(lines),
    totalCents,
  });
}

export function createOrderService(
  orderRepository,
  { auditRecorder = deferredAuditRecorder } = {},
) {
  if (
    !orderRepository ||
    typeof orderRepository.runInTransaction !== "function" ||
    typeof orderRepository.listByUserId !== "function" ||
    typeof orderRepository.findByIdForUser !== "function"
  ) {
    throw new TypeError("An order repository is required.");
  }

  if (!auditRecorder || typeof auditRecorder.record !== "function") {
    throw new TypeError("An audit recorder interface is required.");
  }

  return Object.freeze({
    async listCustomerOrders({ userId } = {}) {
      const normalizedUserId = normalizeUserId(userId);
      return orderRepository.listByUserId(normalizedUserId);
    },

    async getCustomerOrder({ userId, orderId } = {}) {
      const normalizedUserId = normalizeUserId(userId);
      const normalizedOrderId = normalizeOrderId(orderId);
      const order = await orderRepository.findByIdForUser({
        userId: normalizedUserId,
        orderId: normalizedOrderId,
      });

      if (!order) {
        throw new OrderNotFoundError();
      }

      return Object.freeze({
        ...order,
        items: Object.freeze(order.items.map((item) => Object.freeze({
          ...item,
          lineTotalCents: item.unitPriceCents * item.quantity,
        }))),
      });
    },

    async checkout({ userId, cart } = {}) {
      const normalizedUserId = normalizeUserId(userId);
      const cartItems = normalizeCart(cart);

      return orderRepository.runInTransaction(async (transaction) => {
        const foods = await transaction.loadFoodsForCheckout(
          cartItems.map((item) => item.foodItemId),
        );
        const calculated = calculateOrderLines(cartItems, foods);
        const order = await transaction.insertOrder({
          userId: normalizedUserId,
          totalCents: calculated.totalCents,
        });
        const items = await transaction.insertOrderItems(
          calculated.lines.map((line) => ({
            orderId: order.id,
            foodItemId: line.foodItemId,
            foodNameSnapshot: line.foodNameSnapshot,
            unitPriceCents: line.unitPriceCents,
            quantity: line.quantity,
          })),
        );

        await auditRecorder.record(Object.freeze({
          action: "order.created",
          actorUserId: normalizedUserId,
          entityType: "order",
          entityId: order.id,
          result: "success",
        }));

        return Object.freeze({
          ...order,
          items,
        });
      });
    },
  });
}
