import { describe, expect, test } from "vitest";

import { customerInputValidation } from "../../src/validation/customer-input.js";
import { RequestValidationError } from "../../src/validation/request.js";

function observedError(validator, request) {
  let result;
  validator(request, {}, (error) => {
    result = error;
  });
  return result;
}

describe("customer cart and order validation schemas", () => {
  test.each([
    ["object food ID", {
      body: { foodItemId: { nested: "fictional" }, quantity: "1" },
    }, "foodItemId", "malformed"],
    ["one-item ID array", {
      body: { foodItemId: ["1"], quantity: "1" },
    }, "foodItemId", "malformed"],
    ["duplicate quantity", {
      body: { foodItemId: "1", quantity: ["1", "2"] },
    }, "quantity", "duplicate"],
  ])("rejects %s before cart service input exists", (
    _description,
    request,
    field,
    reason,
  ) => {
    const error = observedError(
      customerInputValidation.addCartItem,
      request,
    );

    expect(error).toBeInstanceOf(RequestValidationError);
    expect(error).toMatchObject({ field, reason });
  });

  test("rejects object route identifiers", () => {
    const error = observedError(customerInputValidation.orderDetail, {
      params: { orderId: { nested: "fictional" } },
      query: {},
    });

    expect(error).toBeInstanceOf(RequestValidationError);
    expect(error).toMatchObject({ field: "orderId", reason: "malformed" });
  });

  test("rejects client-owned checkout fields", () => {
    const error = observedError(customerInputValidation.checkout, {
      body: { totalCents: "1" },
    });

    expect(error).toBeInstanceOf(RequestValidationError);
    expect(error).toMatchObject({
      field: "totalCents",
      reason: "unexpected",
    });
  });
});
