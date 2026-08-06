import { once } from "node:events";

import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";

import { createApplication } from "../../src/app.js";
import { startServer } from "../../src/server.js";
import {
  createRequestValidator,
  MAXIMUM_URLENCODED_BODY_BYTES,
  requestField,
} from "../../src/validation/request.js";

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
  await once(server, "listening");
  const address = server.address();

  return Object.freeze({
    baseUrl: `http://127.0.0.1:${address.port}`,
    server,
  });
}

async function post(baseUrl, body, { accept = "application/json" } = {}) {
  const response = await fetch(`${baseUrl}/validation-probe`, {
    method: "POST",
    headers: {
      accept,
      "content-type": "application/x-www-form-urlencoded",
    },
    body,
  });

  return Object.freeze({
    response,
    text: await response.text(),
  });
}

describe.sequential("request-validation foundation", () => {
  let baseUrl;
  let repositoryWrite;
  let server;

  beforeAll(async () => {
    repositoryWrite = vi.fn(async (input) => Object.freeze({ ...input }));
    const validateProbe = createRequestValidator({
      body: {
        name: requestField.text({
          minimumCodePoints: 1,
          maximumCodePoints: 20,
          maximumBytes: 40,
          trim: true,
        }),
        quantity: requestField.integer({ minimum: 1, maximum: 99 }),
        available: requestField.boolean(),
        role: requestField.enumeration(["customer"]),
        foodItemId: requestField.positiveBigInt(),
      },
    });
    const app = createApplication({
      registerRoutes(application) {
        application.post(
          "/validation-probe",
          validateProbe,
          async (request, response) => {
            await repositoryWrite(request.validatedInput.body);
            response.status(201).json({ status: "created" });
          },
        );
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

  test.each([
    ["missing", "name=Fictional&quantity=1&available=true&role=customer", "REQUEST_FIELD_MISSING"],
    ["malformed", "name=Fictional&quantity=1.5&available=true&role=customer&foodItemId=1", "REQUEST_FIELD_MALFORMED"],
    ["duplicate", "name=First&name=Second&quantity=1&available=true&role=customer&foodItemId=1", "REQUEST_FIELD_DUPLICATE"],
    ["unexpected", "name=Fictional&quantity=1&available=true&role=customer&foodItemId=1&owner=2", "REQUEST_FIELD_UNEXPECTED"],
    ["boundary", `name=${"x".repeat(21)}&quantity=1&available=true&role=customer&foodItemId=1`, "REQUEST_FIELD_OUT_OF_BOUNDS"],
  ])("returns a controlled JSON error for %s input", async (
    _reason,
    body,
    code,
  ) => {
    const result = await post(baseUrl, body);
    const payload = JSON.parse(result.text);

    expect(result.response.status).toBe(422);
    expect(payload.error).toEqual({
      code,
      message: expect.any(String),
      requestId: expect.any(String),
    });
    expect(result.text).not.toContain("owner=2");
    expect(result.text).not.toContain("RequestValidationError");
    expect(repositoryWrite).not.toHaveBeenCalled();
  });

  test("renders a browser-safe validation page without reflecting input", async () => {
    const marker = "fictional-private-marker";
    const result = await post(
      baseUrl,
      `name=${marker.repeat(2)}&quantity=1&available=true&role=customer&foodItemId=1`,
      { accept: "text/html" },
    );

    expect(result.response.status).toBe(422);
    expect(result.text).toContain("Check your request");
    expect(result.text).toContain("REQUEST_FIELD_OUT_OF_BOUNDS");
    expect(result.text).not.toContain(marker);
    expect(result.text).not.toContain("RequestValidationError");
    expect(result.text).not.toContain(" at ");
    expect(repositoryWrite).not.toHaveBeenCalled();
  });

  test("bounds oversized bodies before validation or repository writes", async () => {
    const result = await post(
      baseUrl,
      `name=${"x".repeat(MAXIMUM_URLENCODED_BODY_BYTES + 1)}`,
    );
    const payload = JSON.parse(result.text);

    expect(result.response.status).toBe(413);
    expect(payload.error.code).toBe("REQUEST_BODY_TOO_LARGE");
    expect(result.text).not.toContain("PayloadTooLargeError");
    expect(repositoryWrite).not.toHaveBeenCalled();
  });

  test("bounds parameter counts before validation or repository writes", async () => {
    const fields = Array.from({ length: 13 }, (_value, index) =>
      `field${index}=fictional`,
    ).join("&");
    const result = await post(baseUrl, fields);
    const payload = JSON.parse(result.text);

    expect(result.response.status).toBe(413);
    expect(payload.error.code).toBe("REQUEST_PARAMETER_LIMIT_EXCEEDED");
    expect(result.text).not.toContain("parameters.too.many");
    expect(repositoryWrite).not.toHaveBeenCalled();
  });

  test("safely rejects URL encoding tolerated by the decoder", async () => {
    const result = await post(baseUrl, "name=%E0%A4%A");
    const payload = JSON.parse(result.text);

    expect(result.response.status).toBe(422);
    expect(payload.error.code).toBe("REQUEST_FIELD_MISSING");
    expect(result.text).not.toContain("URIError");
    expect(result.text).not.toContain("RequestValidationError");
    expect(repositoryWrite).not.toHaveBeenCalled();
  });

  test("allows one valid normalized request to reach the repository", async () => {
    const result = await post(
      baseUrl,
      "name=%20Fictional%20&quantity=2&available=on&role=customer&foodItemId=1",
    );

    expect(result.response.status).toBe(201);
    expect(JSON.parse(result.text)).toEqual({ status: "created" });
    expect(repositoryWrite).toHaveBeenCalledTimes(1);
    expect(repositoryWrite).toHaveBeenCalledWith({
      name: "Fictional",
      quantity: 2,
      available: true,
      role: "customer",
      foodItemId: "1",
    });
  });
});
