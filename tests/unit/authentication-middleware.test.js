import { describe, expect, test, vi } from "vitest";

import {
  AdministratorAccessError,
  exposeAuthenticatedUser,
  requireAdministrator,
  requireAuthentication,
} from "../../src/middleware/authentication.js";

function responseDouble() {
  return {
    locals: {},
    redirect: vi.fn(),
  };
}

describe("functional authentication middleware", () => {
  test("exposes only the minimum valid session identity", () => {
    const request = {
      session: {
        user: {
          id: "42",
          name: "Fictional Customer",
          role: "customer",
          email: "not-copied@example.test",
          passwordHash: "not-copied",
        },
      },
    };
    const response = responseDouble();
    const next = vi.fn();

    exposeAuthenticatedUser(request, response, next);

    expect(request.authenticatedUser).toEqual({
      id: "42",
      name: "Fictional Customer",
      role: "customer",
    });
    expect(response.locals.currentUser).toEqual(
      request.authenticatedUser,
    );
    expect(request.authenticatedUser).not.toHaveProperty("email");
    expect(request.authenticatedUser).not.toHaveProperty("passwordHash");
    expect(next).toHaveBeenCalledOnce();
  });

  test("clears an invalid identity and redirects anonymous protected access", () => {
    const request = {
      session: {
        user: {
          id: "invalid",
          name: "",
          role: "owner",
        },
      },
    };
    const response = responseDouble();
    const next = vi.fn();

    exposeAuthenticatedUser(request, response, next);
    requireAuthentication(request, response, next);

    expect(request.session).not.toHaveProperty("user");
    expect(request.authenticatedUser).toBeNull();
    expect(response.redirect).toHaveBeenCalledWith(303, "/login");
  });

  test("allows administrators and returns a controlled error for customers", () => {
    const adminNext = vi.fn();
    requireAdministrator(
      {
        authenticatedUser: {
          id: "7",
          name: "Fictional Admin",
          role: "admin",
        },
      },
      responseDouble(),
      adminNext,
    );
    expect(adminNext).toHaveBeenCalledWith();

    const customerNext = vi.fn();
    requireAdministrator(
      {
        authenticatedUser: {
          id: "8",
          name: "Fictional Customer",
          role: "customer",
        },
      },
      responseDouble(),
      customerNext,
    );
    expect(customerNext.mock.calls[0][0]).toBeInstanceOf(
      AdministratorAccessError,
    );
  });
});
