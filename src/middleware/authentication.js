import { PublicApplicationError } from "../errors.js";

const ALLOWED_ROLES = new Set(["customer", "admin"]);

export class AdministratorAccessError extends PublicApplicationError {
  constructor() {
    super({
      name: "AdministratorAccessError",
      code: "ADMINISTRATOR_ACCESS_REQUIRED",
      message: "Administrator access is required.",
      statusCode: 403,
    });
  }
}

function validSessionUser(user) {
  return user &&
    typeof user.id === "string" &&
    /^[1-9][0-9]*$/.test(user.id) &&
    typeof user.name === "string" &&
    user.name.length >= 1 &&
    user.name.length <= 100 &&
    ALLOWED_ROLES.has(user.role);
}

export function exposeAuthenticatedUser(request, response, next) {
  const sessionUser = request.session?.user;

  if (validSessionUser(sessionUser)) {
    request.authenticatedUser = Object.freeze({
      id: sessionUser.id,
      name: sessionUser.name,
      role: sessionUser.role,
    });
    response.locals.currentUser = request.authenticatedUser;
  } else {
    if (request.session && "user" in request.session) {
      delete request.session.user;
    }

    request.authenticatedUser = null;
    response.locals.currentUser = null;
  }

  next();
}

export function requireAuthentication(request, response, next) {
  if (request.authenticatedUser) {
    next();
    return;
  }

  response.redirect(303, "/login");
}

export function requireAdministrator(request, response, next) {
  if (!request.authenticatedUser) {
    response.redirect(303, "/login");
    return;
  }

  if (request.authenticatedUser.role !== "admin") {
    next(new AdministratorAccessError());
    return;
  }

  next();
}
