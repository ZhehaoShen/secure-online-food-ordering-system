import { PublicApplicationError } from "../errors.js";

export class SessionPersistenceError extends PublicApplicationError {
  constructor(cause) {
    super({
      name: "SessionPersistenceError",
      code: "SESSION_UNAVAILABLE",
      message: "The session service is temporarily unavailable.",
      statusCode: 503,
      cause,
    });
  }
}

export function saveSession(request) {
  return new Promise((resolveSave, rejectSave) => {
    request.session.save((error) => {
      if (error) {
        rejectSave(new SessionPersistenceError(error));
        return;
      }

      resolveSave();
    });
  });
}

export function destroySession(request) {
  return new Promise((resolveDestroy, rejectDestroy) => {
    request.session.destroy((error) => {
      if (error) {
        rejectDestroy(new SessionPersistenceError(error));
        return;
      }

      resolveDestroy();
    });
  });
}
