import { PublicApplicationError } from "../errors.js";

export const MAXIMUM_URLENCODED_BODY_BYTES = 16 * 1024;
export const MAXIMUM_URLENCODED_PARAMETERS = 12;
export const MAXIMUM_POSTGRESQL_BIGINT = 9_223_372_036_854_775_807n;

const VALIDATOR_MARKER = Symbol("request-field-validator");
const VALIDATION_REASONS = Object.freeze({
  missing: Object.freeze({
    code: "REQUEST_FIELD_MISSING",
    message: "A required request field is missing.",
  }),
  malformed: Object.freeze({
    code: "REQUEST_FIELD_MALFORMED",
    message: "A request field is malformed.",
  }),
  duplicate: Object.freeze({
    code: "REQUEST_FIELD_DUPLICATE",
    message: "A request field was provided more than once.",
  }),
  unexpected: Object.freeze({
    code: "REQUEST_FIELD_UNEXPECTED",
    message: "The request contains an unexpected field.",
  }),
  boundary: Object.freeze({
    code: "REQUEST_FIELD_OUT_OF_BOUNDS",
    message: "A request field is outside the allowed range.",
  }),
});

export class RequestValidationError extends PublicApplicationError {
  constructor(reason, field = null) {
    const publicDetails = VALIDATION_REASONS[reason];

    if (!publicDetails) {
      throw new TypeError("A supported request-validation reason is required.");
    }

    super({
      name: "RequestValidationError",
      code: publicDetails.code,
      message: publicDetails.message,
      statusCode: 422,
    });
    this.reason = reason;
    this.field = field;
  }
}

export class RequestParsingError extends PublicApplicationError {
  constructor({ code, message, statusCode }) {
    super({
      name: "RequestParsingError",
      code,
      message,
      statusCode,
    });
  }
}

function issue(reason, field) {
  throw new RequestValidationError(reason, field);
}

function fieldValidator(validate, {
  optional = false,
  defaultValue,
} = {}) {
  return Object.freeze({
    [VALIDATOR_MARKER]: true,
    validate,
    optional,
    defaultValue,
  });
}

function assertOptions(condition) {
  if (!condition) {
    throw new TypeError("The request-field validator options are invalid.");
  }
}

function scalarString(value, field) {
  if (typeof value !== "string") {
    issue("malformed", field);
  }

  if (typeof value.isWellFormed === "function" && !value.isWellFormed()) {
    issue("malformed", field);
  }

  return value;
}

function text({
  minimumCodePoints = 0,
  maximumCodePoints = Number.MAX_SAFE_INTEGER,
  maximumBytes = Number.MAX_SAFE_INTEGER,
  trim = false,
  lowercase = false,
  normalization = null,
  pattern = null,
} = {}) {
  assertOptions(
    Number.isSafeInteger(minimumCodePoints) &&
    Number.isSafeInteger(maximumCodePoints) &&
    Number.isSafeInteger(maximumBytes) &&
    minimumCodePoints >= 0 &&
    maximumCodePoints >= minimumCodePoints &&
    maximumBytes >= 0 &&
    typeof lowercase === "boolean" &&
    [null, "NFC", "NFD", "NFKC", "NFKD"].includes(normalization) &&
    (pattern === null || pattern instanceof RegExp),
  );

  return fieldValidator((value, field) => {
    let normalized = scalarString(value, field);

    if (normalization) {
      normalized = normalized.normalize(normalization);
    }

    if (trim) {
      normalized = normalized.trim();
    }

    if (lowercase) {
      normalized = normalized.toLowerCase();
    }

    const codePoints = Array.from(normalized).length;
    const bytes = Buffer.byteLength(normalized, "utf8");

    if (
      codePoints < minimumCodePoints ||
      codePoints > maximumCodePoints ||
      bytes > maximumBytes
    ) {
      issue("boundary", field);
    }

    if (pattern && !pattern.test(normalized)) {
      issue("malformed", field);
    }

    return normalized;
  });
}

function integer({
  minimum = Number.MIN_SAFE_INTEGER,
  maximum = Number.MAX_SAFE_INTEGER,
} = {}) {
  assertOptions(
    Number.isSafeInteger(minimum) &&
    Number.isSafeInteger(maximum) &&
    maximum >= minimum,
  );

  return fieldValidator((value, field) => {
    const rawValue = scalarString(value, field);

    if (!/^-?(?:0|[1-9][0-9]*)$/.test(rawValue)) {
      issue("malformed", field);
    }

    const parsed = Number(rawValue);

    if (
      !Number.isSafeInteger(parsed) ||
      parsed < minimum ||
      parsed > maximum
    ) {
      issue("boundary", field);
    }

    return parsed;
  });
}

function boolean({
  trueValues = ["true", "1", "on"],
  falseValues = ["false", "0", "off"],
} = {}) {
  const allowedTrue = new Set(trueValues);
  const allowedFalse = new Set(falseValues);
  assertOptions(
    trueValues.length > 0 &&
    falseValues.length > 0 &&
    [...allowedTrue, ...allowedFalse].every((value) =>
      typeof value === "string",
    ) &&
    [...allowedTrue].every((value) => !allowedFalse.has(value)),
  );

  return fieldValidator((value, field) => {
    const rawValue = scalarString(value, field);

    if (allowedTrue.has(rawValue)) {
      return true;
    }

    if (allowedFalse.has(rawValue)) {
      return false;
    }

    issue("malformed", field);
  });
}

function enumeration(values) {
  const allowed = new Set(values);
  assertOptions(
    Array.isArray(values) &&
    values.length > 0 &&
    allowed.size === values.length &&
    values.every((value) => typeof value === "string"),
  );

  return fieldValidator((value, field) => {
    const rawValue = scalarString(value, field);

    if (!allowed.has(rawValue)) {
      issue("malformed", field);
    }

    return rawValue;
  });
}

function positiveBigInt({ maximum = MAXIMUM_POSTGRESQL_BIGINT } = {}) {
  assertOptions(typeof maximum === "bigint" && maximum > 0n);

  return fieldValidator((value, field) => {
    const rawValue = scalarString(value, field);

    if (!/^[1-9][0-9]*$/.test(rawValue)) {
      issue("malformed", field);
    }

    if (BigInt(rawValue) > maximum) {
      issue("boundary", field);
    }

    return rawValue;
  });
}

function optional(validator, { defaultValue = null } = {}) {
  if (!validator?.[VALIDATOR_MARKER]) {
    throw new TypeError("A request-field validator is required.");
  }

  return fieldValidator(validator.validate, {
    optional: true,
    defaultValue,
  });
}

export const requestField = Object.freeze({
  text,
  integer,
  boolean,
  enumeration,
  positiveBigInt,
  optional,
});

function plainRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function validateRequestFields(input, schema) {
  if (!plainRecord(schema)) {
    throw new TypeError("A request-field schema is required.");
  }

  if (!plainRecord(input)) {
    issue("malformed", null);
  }

  const schemaEntries = Object.entries(schema);
  const allowedFields = new Set(schemaEntries.map(([field]) => field));
  const unexpectedField = Object.keys(input)
    .sort()
    .find((field) => !allowedFields.has(field));

  if (unexpectedField) {
    issue("unexpected", unexpectedField);
  }

  const output = {};

  for (const [field, validator] of schemaEntries) {
    if (!validator?.[VALIDATOR_MARKER]) {
      throw new TypeError(`A validator is required for ${field}.`);
    }

    if (!Object.hasOwn(input, field) || input[field] === undefined) {
      if (validator.optional) {
        output[field] = validator.defaultValue;
        continue;
      }

      issue("missing", field);
    }

    const value = input[field];

    if (Array.isArray(value)) {
      issue(value.length > 1 ? "duplicate" : "malformed", field);
    }

    if (value === null || ["object", "function", "symbol"].includes(
      typeof value,
    )) {
      issue("malformed", field);
    }

    output[field] = validator.validate(value, field);
  }

  return Object.freeze(output);
}

export function createRequestValidator(schemas) {
  if (!plainRecord(schemas)) {
    throw new TypeError("Request validation schemas are required.");
  }

  const schemaEntries = Object.entries(schemas);

  if (
    schemaEntries.length === 0 ||
    schemaEntries.some(([source]) =>
      !["body", "query", "params"].includes(source),
    )
  ) {
    throw new TypeError("At least one supported request schema is required.");
  }

  return function validateRequest(request, _response, next) {
    try {
      const validatedInput = {};

      for (const [source, schema] of schemaEntries) {
        validatedInput[source] = validateRequestFields(
          request[source] ?? {},
          schema,
        );
      }

      request.validatedInput = Object.freeze(validatedInput);
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function normalizeRequestParsingError(error) {
  if (error?.type === "entity.too.large") {
    return new RequestParsingError({
      code: "REQUEST_BODY_TOO_LARGE",
      message: "The request body is too large.",
      statusCode: 413,
    });
  }

  if (error?.type === "parameters.too.many") {
    return new RequestParsingError({
      code: "REQUEST_PARAMETER_LIMIT_EXCEEDED",
      message: "The request contains too many fields.",
      statusCode: 413,
    });
  }

  if (["entity.parse.failed", "request.size.invalid"].includes(error?.type)) {
    return new RequestParsingError({
      code: "REQUEST_BODY_MALFORMED",
      message: "The request body is malformed.",
      statusCode: 400,
    });
  }

  return error;
}
