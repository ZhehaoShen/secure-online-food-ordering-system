import { describe, expect, test } from "vitest";

import { administratorInputValidation } from "../../src/validation/administrator-input.js";
import { RequestValidationError } from "../../src/validation/request.js";

const VALID_FOOD = Object.freeze({
  name: " Fictional Tart ",
  category: " Desserts ",
  description: " Test description. ",
  price: "8.75",
  isAvailable: "on",
});

function run(validator, request) {
  let error;
  validator(request, {}, (observed) => {
    error = observed;
  });
  return error;
}

describe("administrator input validation schemas", () => {
  test("normalizes valid food fields while preserving fixed representations", () => {
    const request = { body: { ...VALID_FOOD } };
    expect(run(administratorInputValidation.createFood, request)).toBeUndefined();
    expect(request.validatedInput.body).toEqual({
      name: "Fictional Tart",
      category: "Desserts",
      description: "Test description.",
      price: "8.75",
      isAvailable: "on",
    });
  });

  test.each([
    ["object name", { name: { nested: "x" } }, "name", "malformed"],
    ["duplicate category", { category: ["One", "Two"] }, "category", "duplicate"],
    ["unexpected role", { role: "customer" }, "role", "unexpected"],
    ["long name", { name: "x".repeat(121) }, "name", "boundary"],
    ["long category", { category: "x".repeat(81) }, "category", "boundary"],
    ["long description", { description: "x".repeat(2_001) }, "description", "boundary"],
    ["invalid availability", { isAvailable: "yes" }, "isAvailable", "malformed"],
  ])("rejects %s", (_description, override, field, reason) => {
    const error = run(administratorInputValidation.createFood, {
      body: { ...VALID_FOOD, ...override },
    });
    expect(error).toBeInstanceOf(RequestValidationError);
    expect(error).toMatchObject({ field, reason });
  });

  test.each(["-1", "1.999", "1e3", "+1"])(
    "rejects invalid or overflowing CAD price %s",
    (price) => {
      const error = run(administratorInputValidation.createFood, {
        body: { ...VALID_FOOD, price },
      });
      expect(error).toBeInstanceOf(RequestValidationError);
    },
  );

  test.each([
    ["zero food ID", administratorInputValidation.disableFood, {
      params: { foodItemId: "0" }, body: {},
    }, "foodItemId"],
    ["invalid order status", administratorInputValidation.updateOrderStatus, {
      params: { orderId: "1" }, body: { status: "refunded" },
    }, "status"],
    ["client actor", administratorInputValidation.updateOrderStatus, {
      params: { orderId: "1" },
      body: { status: "preparing", actorUserId: "9" },
    }, "actorUserId"],
  ])("rejects %s", (_description, validator, request, field) => {
    const error = run(validator, request);
    expect(error).toBeInstanceOf(RequestValidationError);
    expect(error.field).toBe(field);
  });
});
