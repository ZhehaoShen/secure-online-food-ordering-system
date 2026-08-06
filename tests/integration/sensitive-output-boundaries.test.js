import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";

import { createApplication } from "../../src/app.js";
import { startServer } from "../../src/server.js";

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

describe.sequential("browser and request-log sensitive boundaries", () => {
  let baseUrl;
  let server;

  beforeAll(async () => {
    const app = createApplication({
      registerRoutes(application) {
        application.get("/sensitive-probe", (request) => {
          throw new Error(`raw-query=${request.query.token}`);
        });
        application.post("/sensitive-probe", (request) => {
          throw new Error(`raw-body=${JSON.stringify(request.body)}`);
        });
      },
    });
    server = startServer({ app, host: "127.0.0.1", port: 0 });
    await new Promise((resolveListening) => {
      server.once("listening", resolveListening);
    });
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  afterAll(async () => {
    if (server) {
      await closeServer(server);
    }
  });

  test.each([
    {
      description: "query and raw internal error",
      marker: "fictional-query-secret",
      request() {
        return fetch(`${baseUrl}/sensitive-probe?token=fictional-query-secret`, {
          headers: { accept: "text/html" },
        });
      },
    },
    {
      description: "request body and raw internal error",
      marker: "fictional-body-secret",
      request() {
        return fetch(`${baseUrl}/sensitive-probe`, {
          method: "POST",
          headers: {
            accept: "text/html",
            "content-type": "application/x-www-form-urlencoded",
          },
          body: "password=fictional-body-secret&role=admin&totalCents=1",
        });
      },
    },
  ])("excludes $description from browser and logs", async ({ marker, request }) => {
    const output = [];
    const logSpy = vi.spyOn(console, "log").mockImplementation((value) => {
      output.push(value);
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation((value) => {
      output.push(value);
    });
    let response;

    try {
      response = await request();
    } finally {
      logSpy.mockRestore();
      errorSpy.mockRestore();
    }

    const html = await response.text();
    const serializedLogs = JSON.stringify(output);
    expect(response.status).toBe(500);
    expect(html).toContain("An unexpected error occurred.");
    expect(html).not.toContain(marker);
    expect(html).not.toContain("raw-query");
    expect(html).not.toContain("raw-body");
    expect(html).not.toContain(" at ");
    expect(serializedLogs).not.toContain(marker);
    expect(serializedLogs).not.toContain("password");
    expect(serializedLogs).not.toContain("totalCents");
    expect(serializedLogs).not.toContain("role=admin");
    expect(serializedLogs).not.toContain("?token=");
  });
});
