import session from "express-session";

export function createSessionMiddleware({ store, config } = {}) {
  if (!store || typeof store.get !== "function") {
    throw new TypeError("A session store is required.");
  }

  if (
    !config ||
    typeof config.secret !== "string" ||
    typeof config.cookieName !== "string" ||
    !Number.isSafeInteger(config.idleTimeoutMilliseconds) ||
    typeof config.secureCookie !== "boolean"
  ) {
    throw new TypeError("A valid session configuration is required.");
  }

  return session({
    store,
    name: config.cookieName,
    secret: config.secret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: config.secureCookie,
      maxAge: config.idleTimeoutMilliseconds,
    },
  });
}
