import { describe, expect, test } from "vitest";

import {
  MAXIMUM_POSTGRESQL_BIGINT,
  normalizeRequestParsingError,
  RequestParsingError,
  RequestValidationError,
  requestField,
  validateRequestFields,
} from "../../src/validation/request.js";

function exampleSchema() {
  return {
    title: requestField.text({
      minimumCodePoints: 1,
      maximumCodePoints: 4,
      maximumBytes: 8,
      trim: true,
      normalization: "NFC",
    }),
    quantity: requestField.integer({ minimum: 1, maximum: 99 }),
    available: requestField.boolean(),
    status: requestField.enumeration(["confirmed", "cancelled"]),
    id: requestField.positiveBigInt(),
    category: requestField.optional(requestField.text({
      minimumCodePoints: 1,
      maximumCodePoints: 80,
      maximumBytes: 160,
      trim: true,
    })),
  };
}

function observedError(input, schema = exampleSchema()) {
  try {
    validateRequestFields(input, schema);
  } catch (error) {
    return error;
  }

  throw new Error("Expected request validation to fail.");
}

describe("reusable request validation", () => {
  test("normalizes bounded scalar field types", () => {
    const result = validateRequestFields({
      title: " e\u0301 ",
      quantity: "2",
      available: "on",
      status: "confirmed",
      id: String(MAXIMUM_POSTGRESQL_BIGINT),
    }, exampleSchema());

    expect(result).toEqual({
      title: "é",
      quantity: 2,
      available: true,
      status: "confirmed",
      id: String(MAXIMUM_POSTGRESQL_BIGINT),
      category: null,
    });
    expect(Object.isFrozen(result)).toBe(true);
  });

  test.each([
    ["missing", {
      title: "ok",
      quantity: "2",
      available: "on",
      status: "confirmed",
    }, "id", "REQUEST_FIELD_MISSING"],
    ["unexpected", {
      title: "ok",
      quantity: "2",
      available: "on",
      status: "confirmed",
      id: "1",
      role: "admin",
    }, "role", "REQUEST_FIELD_UNEXPECTED"],
    ["duplicate", {
      title: ["one", "two"],
      quantity: "2",
      available: "on",
      status: "confirmed",
      id: "1",
    }, "title", "REQUEST_FIELD_DUPLICATE"],
    ["malformed", {
      title: { nested: "value" },
      quantity: "2",
      available: "on",
      status: "confirmed",
      id: "1",
    }, "title", "REQUEST_FIELD_MALFORMED"],
    ["boundary", {
      title: "five!",
      quantity: "2",
      available: "on",
      status: "confirmed",
      id: "1",
    }, "title", "REQUEST_FIELD_OUT_OF_BOUNDS"],
  ])("distinguishes %s fields", (
    reason,
    input,
    field,
    publicCode,
  ) => {
    const error = observedError(input);

    expect(error).toBeInstanceOf(RequestValidationError);
    expect(error).toMatchObject({
      reason,
      field,
      publicCode,
      statusCode: 422,
    });
    expect(error.message).not.toContain(JSON.stringify(input));
  });

  test("counts Unicode code points and UTF-8 bytes independently", () => {
    const twoEmoji = requestField.text({
      minimumCodePoints: 2,
      maximumCodePoints: 2,
      maximumBytes: 8,
    });
    const byteBound = requestField.text({
      maximumCodePoints: 2,
      maximumBytes: 7,
    });

    expect(validateRequestFields({ value: "🙂🙂" }, {
      value: twoEmoji,
    })).toEqual({ value: "🙂🙂" });
    expect(observedError({ value: "🙂🙂🙂" }, { value: twoEmoji }))
      .toMatchObject({ reason: "boundary" });
    expect(observedError({ value: "🙂🙂" }, { value: byteBound }))
      .toMatchObject({ reason: "boundary" });
  });

  test.each([
    ["integer format", { value: "1.5" }, requestField.integer()],
    ["integer range", { value: "100" }, requestField.integer({
      minimum: 1,
      maximum: 99,
    })],
    ["boolean", { value: "yes" }, requestField.boolean()],
    ["enum", { value: "administrator" }, requestField.enumeration([
      "customer",
      "admin",
    ])],
    ["positive bigint zero", { value: "0" }, requestField.positiveBigInt()],
    ["positive bigint maximum", {
      value: String(MAXIMUM_POSTGRESQL_BIGINT + 1n),
    }, requestField.positiveBigInt()],
    ["one-item array", { value: ["1"] }, requestField.integer()],
  ])("rejects malformed or boundary %s input", (_label, input, validator) => {
    expect(() => validateRequestFields(input, { value: validator }))
      .toThrow(RequestValidationError);
  });

  test.each([
    ["entity.parse.failed", 400, "REQUEST_BODY_MALFORMED"],
    ["request.size.invalid", 400, "REQUEST_BODY_MALFORMED"],
    ["entity.too.large", 413, "REQUEST_BODY_TOO_LARGE"],
    ["parameters.too.many", 413, "REQUEST_PARAMETER_LIMIT_EXCEEDED"],
  ])("maps %s parser errors to controlled public errors", (
    type,
    statusCode,
    publicCode,
  ) => {
    const error = normalizeRequestParsingError({ type });

    expect(error).toBeInstanceOf(RequestParsingError);
    expect(error).toMatchObject({ statusCode, publicCode });
  });

  test("leaves unrelated parser errors unchanged", () => {
    const originalError = new Error("Fictional unrelated failure");

    expect(normalizeRequestParsingError(originalError)).toBe(originalError);
  });
});
