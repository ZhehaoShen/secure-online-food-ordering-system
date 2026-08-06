import {
  DuplicateAccountError,
  UserInputError,
} from "../services/user-service.js";
import { RequestValidationError } from "../validation/request.js";

const INVALID_DETAILS_MESSAGE =
  "Enter a valid name, email address, password, and matching confirmation.";
const DUPLICATE_ACCOUNT_MESSAGE =
  "An account could not be created with this email. Try signing in or use another email.";
const PASSWORD_MISMATCH_MESSAGE =
  "Password and password confirmation must match.";

function safeFormValue(value, maximumLength) {
  return typeof value === "string"
    ? value.slice(0, maximumLength)
    : "";
}

function formValues(body = {}) {
  return Object.freeze({
    name: safeFormValue(body.name, 100),
    email: safeFormValue(body.email, 254),
  });
}

function renderRegistration(response, {
  statusCode = 200,
  values = { name: "", email: "" },
  errors = [],
} = {}) {
  response.status(statusCode).render("register", {
    pageTitle: "Create account",
    activePath: "/register",
    values,
    errors,
  });
}

function passwordsMatch(body = {}) {
  return typeof body.password === "string" &&
    typeof body.passwordConfirmation === "string" &&
    body.password === body.passwordConfirmation;
}

export function createRegistrationController(userService) {
  return Object.freeze({
    show(_request, response) {
      if (response.locals.currentUser) {
        response.redirect(303, "/");
        return;
      }

      renderRegistration(response);
    },

    async create(request, response) {
      if (response.locals.currentUser) {
        response.redirect(303, "/");
        return;
      }

      const input = request.validatedInput.body;
      const values = formValues(input);

      if (!passwordsMatch(input)) {
        renderRegistration(response, {
          statusCode: 422,
          values,
          errors: [PASSWORD_MISMATCH_MESSAGE],
        });
        return;
      }

      try {
        await userService.createCustomer({
          name: input.name,
          email: input.email,
          password: input.password,
        });
      } catch (error) {
        if (error instanceof DuplicateAccountError) {
          renderRegistration(response, {
            statusCode: 422,
            values,
            errors: [DUPLICATE_ACCOUNT_MESSAGE],
          });
          return;
        }

        if (error instanceof UserInputError) {
          renderRegistration(response, {
            statusCode: 422,
            values,
            errors: [INVALID_DETAILS_MESSAGE],
          });
          return;
        }

        throw error;
      }

      response.redirect(303, "/login?registered=1");
    },

    invalidInput(error, request, response, next) {
      if (!(error instanceof RequestValidationError)) {
        next(error);
        return;
      }

      const missingPassword = error.reason === "missing" &&
        ["password", "passwordConfirmation"].includes(error.field);
      renderRegistration(response, {
        statusCode: 422,
        values: formValues(request.body),
        errors: [missingPassword
          ? PASSWORD_MISMATCH_MESSAGE
          : INVALID_DETAILS_MESSAGE],
      });
    },
  });
}
