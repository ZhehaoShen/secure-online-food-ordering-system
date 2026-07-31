import {
  destroySession,
  saveSession,
} from "../session/persistence.js";

const INVALID_LOGIN_MESSAGE = "Email or password is incorrect.";

function safeEmailValue(value) {
  return typeof value === "string" ? value.slice(0, 254) : "";
}

function noticeFromQuery(query = {}) {
  if (query.registered === "1") {
    return "Account created. Sign in to continue.";
  }

  if (query.signedOut === "1") {
    return "You have signed out.";
  }

  return null;
}

function renderLogin(response, {
  statusCode = 200,
  email = "",
  errors = [],
  notice = null,
} = {}) {
  response.status(statusCode).render("login", {
    pageTitle: "Sign in",
    activePath: "/login",
    email,
    errors,
    notice,
  });
}

export function createAuthenticationController(
  userService,
  { sessionCookie },
) {
  return Object.freeze({
    show(request, response) {
      if (response.locals.currentUser) {
        response.redirect(303, "/");
        return;
      }

      renderLogin(response, {
        notice: noticeFromQuery(request.query),
      });
    },

    async create(request, response) {
      if (response.locals.currentUser) {
        response.redirect(303, "/");
        return;
      }

      const email = safeEmailValue(request.body?.email);
      const user = await userService.authenticate({
        email: request.body?.email,
        password: request.body?.password,
      });

      if (!user) {
        renderLogin(response, {
          statusCode: 401,
          email,
          errors: [INVALID_LOGIN_MESSAGE],
        });
        return;
      }

      if (!request.session) {
        throw new TypeError("Session middleware is required for sign-in.");
      }

      request.session.user = Object.freeze({
        id: user.id,
        name: user.name,
        role: user.role,
      });
      await saveSession(request);
      response.redirect(303, "/");
    },

    async destroy(request, response) {
      if (request.session) {
        await destroySession(request);
      }

      response.clearCookie(sessionCookie.name, {
        path: "/",
        httpOnly: true,
        sameSite: "lax",
        secure: sessionCookie.secure,
      });
      response.redirect(303, "/login?signedOut=1");
    },
  });
}
