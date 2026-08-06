import { describe, expect, test } from "vitest";

import { publicInputValidation } from "../../src/validation/public-input.js";
import { RequestValidationError } from "../../src/validation/request.js";

function observedError(validator, request) {
  let result;
  validator(request, {}, (error) => {
    result = error;
  });
  return result;
}

describe("public route validation schemas", () => {
  test.each([
    ["object", { nested: "fictional" }, "malformed"],
    ["one-item array", ["Fictional"], "malformed"],
    ["duplicate array", ["First", "Second"], "duplicate"],
  ])("rejects a registration name supplied as an %s", (
    _description,
    name,
    reason,
  ) => {
    const error = observedError(publicInputValidation.registration, {
      body: {
        name,
        email: "fictional@example.test",
        password: "fictional-password",
        passwordConfirmation: "fictional-password",
      },
    });

    expect(error).toBeInstanceOf(RequestValidationError);
    expect(error).toMatchObject({ field: "name", reason });
  });

  test("rejects nested search objects before service input exists", () => {
    const error = observedError(publicInputValidation.search, {
      query: { q: { nested: "fictional" } },
    });

    expect(error).toBeInstanceOf(RequestValidationError);
    expect(error).toMatchObject({ field: "q", reason: "malformed" });
  });
});
