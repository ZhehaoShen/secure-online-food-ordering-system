import { readFile } from "node:fs/promises";

import { describe, expect, test, vi } from "vitest";

import {
  PublicApplicationError,
  publicErrorDetails,
} from "../../src/errors.js";
import { logEvent } from "../../src/logger.js";

describe("sensitive output boundaries", () => {
  test("structured logging keeps only allowlisted primitive diagnostics", () => {
    const errorOutput = vi.spyOn(console, "error").mockImplementation(() => {});
    const password = "Fictional-Log-Password-2026!";

    try {
      logEvent("error", "fictional_sensitive_probe", {
        requestId: "fictional-request-id",
        method: "POST",
        path: "/login",
        statusCode: 500,
        errorName: "UnexpectedError",
        errorCode: "INTERNAL_ERROR",
        password,
        passwordHash: "scrypt$fictional-hash",
        connectionString: "postgres://fictional-private-host/db",
        sessionId: "fictional-session-id",
        authorization: "Bearer fictional-token",
        details: { nested: password },
      });
    } finally {
      expect(errorOutput).toHaveBeenCalledOnce();
      const entry = JSON.parse(errorOutput.mock.calls[0][0]);
      errorOutput.mockRestore();

      expect(entry).toEqual(expect.objectContaining({
        level: "error",
        event: "fictional_sensitive_probe",
        requestId: "fictional-request-id",
        method: "POST",
        path: "/login",
        statusCode: 500,
        errorName: "UnexpectedError",
        errorCode: "INTERNAL_ERROR",
      }));
      const serialized = JSON.stringify(entry);
      expect(serialized).not.toContain(password);
      expect(serialized).not.toContain("scrypt$fictional-hash");
      expect(serialized).not.toContain("fictional-private-host");
      expect(serialized).not.toContain("fictional-session-id");
      expect(serialized).not.toContain("fictional-token");
    }
  });

  test("public error mapping drops raw messages, stacks, and causes", () => {
    const marker = "password=fictional-internal-marker";
    const rawDetails = publicErrorDetails(new Error(marker));
    const controlledDetails = publicErrorDetails(new PublicApplicationError({
      name: "FictionalControlledError",
      code: "FICTIONAL_CONTROLLED_ERROR",
      message: "The fictional request could not be completed.",
      statusCode: 422,
      cause: new Error(marker),
    }));

    expect(rawDetails).toEqual({
      statusCode: 500,
      code: "INTERNAL_ERROR",
      message: "An unexpected error occurred.",
      errorName: "UnexpectedError",
    });
    expect(controlledDetails).toEqual({
      statusCode: 422,
      code: "FICTIONAL_CONTROLLED_ERROR",
      message: "The fictional request could not be completed.",
      errorName: "FictionalControlledError",
    });
    expect(JSON.stringify({ rawDetails, controlledDetails }))
      .not.toContain(marker);
    expect(rawDetails).not.toHaveProperty("stack");
    expect(controlledDetails).not.toHaveProperty("cause");
  });

  test("request logging uses the path without query or raw request objects", async () => {
    const applicationSource = await readFile("src/app.js", "utf8");
    const nonLoggerSources = await Promise.all([
      "src/app.js",
      "src/db/pool.js",
      "src/server.js",
      "src/session/store.js",
    ].map((file) => readFile(file, "utf8")));

    expect(applicationSource).toContain("path: request.path");
    expect(applicationSource).not.toContain("request.originalUrl");
    expect(applicationSource).not.toMatch(/logEvent\([^)]*request\.(?:body|query|headers)/s);
    expect(nonLoggerSources.join("\n")).not.toMatch(/console\.(?:log|error)/);
  });
});
