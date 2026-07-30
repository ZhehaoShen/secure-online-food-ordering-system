import { randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import express from "express";

import { publicErrorDetails } from "./errors.js";
import { logEvent } from "./logger.js";
import { registerMenuRoutes } from "./routes/menu-routes.js";

const SERVICE_NAME = "secure-online-food-ordering-system";
const SOURCE_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const VIEW_DIRECTORY = resolve(SOURCE_DIRECTORY, "..", "views");
const PUBLIC_DIRECTORY = resolve(SOURCE_DIRECTORY, "..", "public");

function requestWantsHtml(request) {
  const accept = request.get("accept") || "";
  return accept.includes("text/html");
}

function renderErrorPage(response, {
  statusCode,
  code,
  message,
  requestId,
}) {
  response.status(statusCode).render("error", {
    pageTitle: statusCode === 404 ? "Page not found" : "Service unavailable",
    activePath: null,
    statusCode,
    code,
    message,
    requestId,
  });
}

export function createApplication({ registerRoutes, menuService } = {}) {
  const app = express();

  app.disable("x-powered-by");
  app.set("view engine", "ejs");
  app.set("views", VIEW_DIRECTORY);
  app.locals.currentYear = new Date().getUTCFullYear();

  app.use((request, response, next) => {
    const requestId = randomUUID();
    const startedAt = performance.now();

    response.locals.requestId = requestId;
    response.set("X-Request-Id", requestId);
    response.set({
      "Content-Security-Policy":
        "default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
    });

    response.on("finish", () => {
      logEvent("info", "request_completed", {
        requestId,
        method: request.method,
        path: request.path,
        statusCode: response.statusCode,
        durationMs: Math.round(performance.now() - startedAt),
      });
    });

    next();
  });

  app.use(
    "/assets",
    express.static(PUBLIC_DIRECTORY, {
      dotfiles: "deny",
      index: false,
      maxAge: "1h",
    }),
  );

  app.get("/health", (_request, response) => {
    response.status(200).json({
      status: "ok",
      service: SERVICE_NAME,
    });
  });

  if (menuService) {
    registerMenuRoutes(app, { menuService });
  }

  if (registerRoutes) {
    registerRoutes(app);
  }

  app.use((request, response) => {
    const error = {
      code: "NOT_FOUND",
      message: "The page you requested could not be found.",
      requestId: response.locals.requestId,
    };

    if (requestWantsHtml(request)) {
      renderErrorPage(response, {
        statusCode: 404,
        ...error,
      });
      return;
    }

    response.status(404).json({
      error,
    });
  });

  app.use((error, request, response, next) => {
    const publicError = publicErrorDetails(error);

    logEvent("error", "request_failed", {
      requestId: response.locals.requestId,
      method: request.method,
      path: request.path,
      statusCode: publicError.statusCode,
      errorName: publicError.errorName,
      errorCode: publicError.code,
    });

    if (response.headersSent) {
      next(error);
      return;
    }

    if (requestWantsHtml(request)) {
      renderErrorPage(response, {
        statusCode: publicError.statusCode,
        code: publicError.code,
        message: publicError.message,
        requestId: response.locals.requestId,
      });
      return;
    }

    response.status(publicError.statusCode).json({
      error: {
        code: publicError.code,
        message: publicError.message,
        requestId: response.locals.requestId,
      },
    });
  });

  return app;
}
