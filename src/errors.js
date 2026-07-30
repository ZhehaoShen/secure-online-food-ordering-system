export class PublicApplicationError extends Error {
  constructor({ name, code, message, statusCode, cause }) {
    super(message, { cause });
    this.name = name;
    this.publicCode = code;
    this.statusCode = statusCode;
  }
}

export function publicErrorDetails(error) {
  if (error instanceof PublicApplicationError) {
    return {
      statusCode: error.statusCode,
      code: error.publicCode,
      message: error.message,
      errorName: error.name,
    };
  }

  return {
    statusCode: 500,
    code: "INTERNAL_ERROR",
    message: "An unexpected error occurred.",
    errorName: "UnexpectedError",
  };
}
