import { PublicApplicationError } from "../errors.js";

const MAXIMUM_DISTINCT_ITEMS = 100;
const MAXIMUM_QUANTITY = 99;
const MAXIMUM_DATABASE_ID = 9_223_372_036_854_775_807n;

export class CartInputError extends PublicApplicationError {
  constructor(message = "The cart item or quantity is invalid.") {
    super({
      name: "CartInputError",
      code: "INVALID_CART_INPUT",
      message,
      statusCode: 422,
    });
  }
}

export class CartFoodUnavailableError extends PublicApplicationError {
  constructor() {
    super({
      name: "CartFoodUnavailableError",
      code: "CART_FOOD_UNAVAILABLE",
      message: "The selected food is not available.",
      statusCode: 404,
    });
  }
}

export class CartItemNotFoundError extends PublicApplicationError {
  constructor() {
    super({
      name: "CartItemNotFoundError",
      code: "CART_ITEM_NOT_FOUND",
      message: "The selected cart item was not found.",
      statusCode: 404,
    });
  }
}

function validFoodItemId(value) {
  return typeof value === "string" &&
    /^[1-9][0-9]{0,18}$/.test(value) &&
    BigInt(value) <= MAXIMUM_DATABASE_ID;
}

function normalizeFoodItemId(value) {
  if (!validFoodItemId(value)) {
    throw new CartInputError();
  }

  return value;
}

function normalizeQuantity(value) {
  if (
    typeof value !== "string" ||
    !/^[1-9][0-9]?$/.test(value)
  ) {
    throw new CartInputError();
  }

  const quantity = Number.parseInt(value, 10);

  if (quantity < 1 || quantity > MAXIMUM_QUANTITY) {
    throw new CartInputError();
  }

  return quantity;
}

function normalizeStoredCart(cart) {
  const normalizedItems = {};

  if (
    !cart ||
    typeof cart !== "object" ||
    Array.isArray(cart) ||
    !cart.items ||
    typeof cart.items !== "object" ||
    Array.isArray(cart.items)
  ) {
    return normalizedItems;
  }

  for (const [id, quantity] of Object.entries(cart.items)) {
    if (Object.keys(normalizedItems).length >= MAXIMUM_DISTINCT_ITEMS) {
      break;
    }

    if (
      validFoodItemId(id) &&
      Number.isInteger(quantity) &&
      quantity >= 1 &&
      quantity <= MAXIMUM_QUANTITY
    ) {
      normalizedItems[id] = quantity;
    }
  }

  return normalizedItems;
}

function cartState(items) {
  return Object.freeze({
    items: Object.freeze({ ...items }),
  });
}

export function createCartService(foodItemRepository) {
  if (
    !foodItemRepository ||
    typeof foodItemRepository.listAvailableByIds !== "function" ||
    typeof foodItemRepository.findAvailableById !== "function"
  ) {
    throw new TypeError("A food item repository is required.");
  }

  return Object.freeze({
    async getCart(storedCart) {
      const storedItems = normalizeStoredCart(storedCart);
      const ids = Object.keys(storedItems);
      const foods = await foodItemRepository.listAvailableByIds(ids);
      const items = foods.map((food) => {
        const quantity = storedItems[food.id];
        const lineTotalCents = food.priceCents * quantity;

        return Object.freeze({
          ...food,
          quantity,
          lineTotalCents,
        });
      });
      const availableState = Object.fromEntries(
        items.map((item) => [item.id, item.quantity]),
      );

      return Object.freeze({
        items: Object.freeze(items),
        itemCount: items.reduce(
          (count, item) => count + item.quantity,
          0,
        ),
        totalCents: items.reduce(
          (total, item) => total + item.lineTotalCents,
          0,
        ),
        state: cartState(availableState),
        removedUnavailableCount:
          Object.keys(storedItems).length - items.length,
      });
    },

    async addItem(storedCart, { foodItemId, quantity }) {
      const id = normalizeFoodItemId(foodItemId);
      const addedQuantity = normalizeQuantity(quantity);
      const food = await foodItemRepository.findAvailableById(id);

      if (!food) {
        throw new CartFoodUnavailableError();
      }

      const items = normalizeStoredCart(storedCart);
      const nextQuantity = (items[id] ?? 0) + addedQuantity;

      if (nextQuantity > MAXIMUM_QUANTITY) {
        throw new CartInputError(
          `A cart item cannot exceed ${MAXIMUM_QUANTITY}.`,
        );
      }

      if (
        !(id in items) &&
        Object.keys(items).length >= MAXIMUM_DISTINCT_ITEMS
      ) {
        throw new CartInputError("The cart contains too many distinct items.");
      }

      items[id] = nextQuantity;
      return cartState(items);
    },

    async updateItem(storedCart, { foodItemId, quantity }) {
      const id = normalizeFoodItemId(foodItemId);
      const nextQuantity = normalizeQuantity(quantity);
      const items = normalizeStoredCart(storedCart);

      if (!(id in items)) {
        throw new CartItemNotFoundError();
      }

      const food = await foodItemRepository.findAvailableById(id);

      if (!food) {
        throw new CartFoodUnavailableError();
      }

      items[id] = nextQuantity;
      return cartState(items);
    },

    removeItem(storedCart, { foodItemId }) {
      const id = normalizeFoodItemId(foodItemId);
      const items = normalizeStoredCart(storedCart);
      delete items[id];
      return cartState(items);
    },
  });
}
