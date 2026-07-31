import { deferredAuditRecorder } from "../audit/deferred-audit-recorder.js";
import { PublicApplicationError } from "../errors.js";

const MAXIMUM_DATABASE_ID = 9_223_372_036_854_775_807n;
const MAXIMUM_PRICE_CENTS = 2_147_483_647;
const PRICE_PATTERN = /^(0|[1-9][0-9]{0,7})(?:\.([0-9]{1,2}))?$/;

export class FoodManagementInputError extends PublicApplicationError {
  constructor() {
    super({
      name: "FoodManagementInputError",
      code: "INVALID_FOOD_DETAILS",
      message: "The food details are invalid.",
      statusCode: 422,
    });
  }
}

export class FoodItemNotFoundError extends PublicApplicationError {
  constructor() {
    super({
      name: "FoodItemNotFoundError",
      code: "FOOD_ITEM_NOT_FOUND",
      message: "The food item could not be found.",
      statusCode: 404,
    });
  }
}

function validDatabaseId(value) {
  return typeof value === "string" &&
    /^[1-9][0-9]{0,18}$/.test(value) &&
    BigInt(value) <= MAXIMUM_DATABASE_ID;
}

function normalizeId(value) {
  if (!validDatabaseId(value)) {
    throw new FoodItemNotFoundError();
  }

  return value;
}

function normalizeText(value, { minimumLength, maximumLength }) {
  if (typeof value !== "string") {
    throw new FoodManagementInputError();
  }

  const normalized = value.trim();

  if (
    normalized.length < minimumLength ||
    normalized.length > maximumLength
  ) {
    throw new FoodManagementInputError();
  }

  return normalized;
}

function normalizePrice(value) {
  if (typeof value !== "string") {
    throw new FoodManagementInputError();
  }

  const normalized = value.trim();
  const match = PRICE_PATTERN.exec(normalized);

  if (!match) {
    throw new FoodManagementInputError();
  }

  const [dollars] = normalized.split(".");
  const cents = (match[2] ?? "").padEnd(2, "0");
  const priceCents =
    Number.parseInt(dollars, 10) * 100 +
    Number.parseInt(cents || "0", 10);

  if (
    !Number.isSafeInteger(priceCents) ||
    priceCents > MAXIMUM_PRICE_CENTS
  ) {
    throw new FoodManagementInputError();
  }

  return priceCents;
}

function normalizeAvailability(value) {
  if (value === "on" || value === "true" || value === "1") {
    return true;
  }

  if (
    value === undefined ||
    value === null ||
    value === "" ||
    value === "false" ||
    value === "0"
  ) {
    return false;
  }

  throw new FoodManagementInputError();
}

function normalizeFoodInput(input = {}) {
  return Object.freeze({
    name: normalizeText(input.name, {
      minimumLength: 1,
      maximumLength: 120,
    }),
    category: normalizeText(input.category, {
      minimumLength: 1,
      maximumLength: 80,
    }),
    description: normalizeText(input.description, {
      minimumLength: 0,
      maximumLength: 2_000,
    }),
    priceCents: normalizePrice(input.price),
    isAvailable: normalizeAvailability(input.isAvailable),
  });
}

export function createFoodManagementService(
  foodItemRepository,
  { auditRecorder = deferredAuditRecorder } = {},
) {
  if (
    !foodItemRepository ||
    typeof foodItemRepository.listAllForAdministration !== "function" ||
    typeof foodItemRepository.findById !== "function" ||
    typeof foodItemRepository.create !== "function" ||
    typeof foodItemRepository.update !== "function" ||
    typeof foodItemRepository.disable !== "function"
  ) {
    throw new TypeError("A food item repository is required.");
  }

  if (!auditRecorder || typeof auditRecorder.record !== "function") {
    throw new TypeError("An audit recorder interface is required.");
  }

  async function record(action, actorUserId, entityId) {
    await auditRecorder.record(Object.freeze({
      action,
      actorUserId,
      entityType: "food_item",
      entityId,
      result: "success",
    }));
  }

  return Object.freeze({
    async listFoods() {
      return foodItemRepository.listAllForAdministration();
    },

    async getFood({ foodItemId } = {}) {
      const id = normalizeId(foodItemId);
      const food = await foodItemRepository.findById(id);

      if (!food) {
        throw new FoodItemNotFoundError();
      }

      return food;
    },

    async createFood({ actorUserId, input } = {}) {
      const actorId = normalizeId(actorUserId);
      const created = await foodItemRepository.create(
        normalizeFoodInput(input),
      );
      await record("food.created", actorId, created.id);
      return created;
    },

    async updateFood({ actorUserId, foodItemId, input } = {}) {
      const actorId = normalizeId(actorUserId);
      const id = normalizeId(foodItemId);
      const updated = await foodItemRepository.update({
        id,
        ...normalizeFoodInput(input),
      });

      if (!updated) {
        throw new FoodItemNotFoundError();
      }

      await record("food.updated", actorId, updated.id);
      return updated;
    },

    async disableFood({ actorUserId, foodItemId } = {}) {
      const actorId = normalizeId(actorUserId);
      const id = normalizeId(foodItemId);
      const disabled = await foodItemRepository.disable(id);

      if (!disabled) {
        throw new FoodItemNotFoundError();
      }

      await record("food.disabled", actorId, disabled.id);
      return disabled;
    },
  });
}
