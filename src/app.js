import { randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import express from "express";

import { publicErrorDetails } from "./errors.js";
import { logEvent } from "./logger.js";
import { exposeAuthenticatedUser } from "./middleware/authentication.js";
import { csrfProtectionMiddleware } from "./middleware/csrf.js";
import { registerAdminAuditRoutes } from "./routes/admin-audit-routes.js";
import { registerAdminFoodRoutes } from "./routes/admin-food-routes.js";
import { registerAdminOrderRoutes } from "./routes/admin-order-routes.js";
import { registerAuthenticationRoutes } from "./routes/authentication-routes.js";
import { registerCartRoutes } from "./routes/cart-routes.js";
import { registerMenuRoutes } from "./routes/menu-routes.js";
import { registerOrderRoutes } from "./routes/order-routes.js";
import { registerRegistrationRoutes } from "./routes/registration-routes.js";
import {
  MAXIMUM_URLENCODED_BODY_BYTES,
  MAXIMUM_URLENCODED_PARAMETERS,
  normalizeRequestParsingError,
} from "./validation/request.js";

const SERVICE_NAME = "secure-online-food-ordering-system";
const SOURCE_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const VIEW_DIRECTORY = resolve(SOURCE_DIRECTORY, "..", "views");
const PUBLIC_DIRECTORY = resolve(SOURCE_DIRECTORY, "..", "public");
const ERROR_PAGE_TITLES = Object.freeze({
  400: "Invalid request",
  401: "Sign-in required",
  403: "Access denied",
  404: "Page not found",
  409: "Request conflict",
  413: "Request too large",
  422: "Check your request",
  500: "Unexpected error",
  503: "Service unavailable",
});

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
    pageTitle: ERROR_PAGE_TITLES[statusCode] ?? "Request failed",
    activePath: null,
    statusCode,
    code,
    message,
    requestId,
  });
}

export function createApplication({
  adminOrderService,
  auditRepository,
  auditRecorder,
  cartService,
  foodManagementService,
  registerRoutes,
  menuService,
  orderService,
  sessionCookie,
  sessionMiddleware,
  userService,
} = {}) {
  const app = express();

  app.disable("x-powered-by");
  app.set("view engine", "ejs");
  app.set("views", VIEW_DIRECTORY);
  app.locals.currentYear = new Date().getUTCFullYear();
  app.locals.currentUser = null;
  app.locals.csrfToken = "";
  app.locals.auditRecorder = auditRecorder || null;

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

  app.use(express.urlencoded({
    extended: false,
    limit: MAXIMUM_URLENCODED_BODY_BYTES,
    parameterLimit: MAXIMUM_URLENCODED_PARAMETERS,
  }));
  app.use((error, _request, _response, next) => {
    next(normalizeRequestParsingError(error));
  });

  if (sessionMiddleware) {
    app.use(sessionMiddleware);
    app.use(exposeAuthenticatedUser);
    app.use(csrfProtectionMiddleware);
  }

  app.get("/health", (_request, response) => {
    response.status(200).json({
      status: "ok",
      service: SERVICE_NAME,
    });
  });

  if (menuService) {
    registerMenuRoutes(app, { menuService });
  }

  if (userService) {
    registerRegistrationRoutes(app, { userService });
  }

  if (userService && sessionMiddleware && sessionCookie) {
    registerAuthenticationRoutes(app, {
      userService,
      sessionCookie,
      auditRecorder,
    });
  }

  if (cartService && sessionMiddleware) {
    registerCartRoutes(app, { cartService });
  }

  if (cartService && orderService && sessionMiddleware) {
    registerOrderRoutes(app, {
      cartService,
      orderService,
    });
  }

  if (foodManagementService && sessionMiddleware) {
    registerAdminFoodRoutes(app, { foodManagementService });
  }

  if (adminOrderService && sessionMiddleware) {
    registerAdminOrderRoutes(app, { adminOrderService });
  }

  if (auditRepository && sessionMiddleware) {
    registerAdminAuditRoutes(app, { auditRepository });
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
