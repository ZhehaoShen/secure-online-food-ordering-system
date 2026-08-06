import { deferredAuditRecorder } from "../audit/deferred-audit-recorder.js";
import { PublicApplicationError } from "../errors.js";
import {
  hashPassword,
  verifyPassword,
} from "../security/passwords.js";
import { passwordMeetsPolicy } from "../security/password-policy.js";
import { DuplicateUserError } from "../repositories/user-repository.js";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAXIMUM_PASSWORD_CHARACTERS = 1_024;
export const LOGIN_PROTECTION = Object.freeze({
  failureThreshold: 5,
  lockoutMilliseconds: 5 * 60 * 1_000,
});
const UNKNOWN_USER_PASSWORD_HASH =
  "scrypt$v1$N=16384,r=8,p=1$kGidufkqVjs8ewM5ntCaVg$_PUJyf8TahJ-iU28IDK2hBv3-regvY6_h_ek7tRQSi6cujsL1UyyrLPoQNEUxUnZSeW-w5zjpyTvTneGJCbnkg";

export class UserInputError extends PublicApplicationError {
  constructor() {
    super({
      name: "UserInputError",
      code: "INVALID_USER_INPUT",
      message: "The account details are invalid.",
      statusCode: 422,
    });
  }
}

export class DuplicateAccountError extends PublicApplicationError {
  constructor() {
    super({
      name: "DuplicateAccountError",
      code: "ACCOUNT_NOT_CREATED",
      message: "The account could not be created with those details.",
      statusCode: 422,
    });
  }
}

function normalizeName(name) {
  if (typeof name !== "string") {
    throw new UserInputError();
  }

  const normalized = name.trim();

  if (normalized.length < 1 || normalized.length > 100) {
    throw new UserInputError();
  }

  return normalized;
}

function normalizeEmail(email) {
  if (typeof email !== "string") {
    throw new UserInputError();
  }

  const normalized = email.trim().toLowerCase();

  if (
    normalized.length < 3 ||
    normalized.length > 254 ||
    !EMAIL_PATTERN.test(normalized)
  ) {
    throw new UserInputError();
  }

  return normalized;
}

function validFunctionalPassword(password) {
  return typeof password === "string" &&
    password.length > 0 &&
    password.length <= MAXIMUM_PASSWORD_CHARACTERS;
}

function safeUser(user) {
  return Object.freeze({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    ...(user.createdAt ? { createdAt: user.createdAt } : {}),
  });
}

async function recordAuditPlaceholder(auditRecorder, event) {
  await auditRecorder.record(Object.freeze(event));
}

function currentTime(clock) {
  const now = clock();

  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new TypeError("The authentication clock must return a valid Date.");
  }

  return new Date(now.getTime());
}

function hasActiveLock(user, attemptedAt) {
  if (!user?.lockedUntil) {
    return false;
  }

  const lockedUntil = new Date(user.lockedUntil);
  return !Number.isNaN(lockedUntil.getTime()) && lockedUntil > attemptedAt;
}

export function createUserService(
  userRepository,
  {
    auditRecorder = deferredAuditRecorder,
    clock = () => new Date(),
  } = {},
) {
  if (
    !userRepository ||
    typeof userRepository.createCustomer !== "function" ||
    typeof userRepository.findActiveByEmail !== "function" ||
    typeof userRepository.recordAuthenticationFailure !== "function" ||
    typeof userRepository.resetAuthenticationFailures !== "function"
  ) {
    throw new TypeError("A user repository is required.");
  }

  if (!auditRecorder || typeof auditRecorder.record !== "function") {
    throw new TypeError("An audit recorder interface is required.");
  }

  if (typeof clock !== "function") {
    throw new TypeError("An authentication clock is required.");
  }

  return Object.freeze({
    async createCustomer({ name, email, password } = {}) {
      const normalizedName = normalizeName(name);
      const normalizedEmail = normalizeEmail(email);

      if (!passwordMeetsPolicy(password)) {
        throw new UserInputError();
      }

      const passwordHash = await hashPassword(password);
      let createdUser;

      try {
        createdUser = await userRepository.createCustomer({
          name: normalizedName,
          email: normalizedEmail,
          passwordHash,
        });
      } catch (error) {
        if (error instanceof DuplicateUserError) {
          throw new DuplicateAccountError();
        }

        throw error;
      }

      await recordAuditPlaceholder(auditRecorder, {
        action: "user.registered",
        actorUserId: createdUser.id,
        entityType: "user",
        entityId: createdUser.id,
        result: "success",
      });

      return safeUser(createdUser);
    },

    async authenticate({ email, password } = {}) {
      let normalizedEmail;

      try {
        normalizedEmail = normalizeEmail(email);
      } catch {
        await recordAuditPlaceholder(auditRecorder, {
          action: "authentication.login",
          actorUserId: null,
          entityType: "user",
          entityId: null,
          result: "failure",
        });
        return null;
      }

      if (!validFunctionalPassword(password)) {
        await recordAuditPlaceholder(auditRecorder, {
          action: "authentication.login",
          actorUserId: null,
          entityType: "user",
          entityId: null,
          result: "failure",
        });
        return null;
      }

      const user = await userRepository.findActiveByEmail(normalizedEmail);
      const attemptedAt = currentTime(clock);
      const passwordMatches = await verifyPassword(
        password,
        user?.passwordHash ?? UNKNOWN_USER_PASSWORD_HASH,
      );
      const locked = hasActiveLock(user, attemptedAt);
      const authenticated = Boolean(user && passwordMatches && !locked);

      if (user && authenticated) {
        await userRepository.resetAuthenticationFailures({
          userId: user.id,
          authenticatedAt: attemptedAt,
        });
      } else if (user && !locked) {
        await userRepository.recordAuthenticationFailure({
          userId: user.id,
          attemptedAt,
          threshold: LOGIN_PROTECTION.failureThreshold,
          lockedUntil: new Date(
            attemptedAt.getTime() + LOGIN_PROTECTION.lockoutMilliseconds,
          ),
        });
      }

      await recordAuditPlaceholder(auditRecorder, {
        action: "authentication.login",
        actorUserId: authenticated ? user.id : null,
        entityType: "user",
        entityId: authenticated ? user.id : null,
        result: authenticated ? "success" : "failure",
      });

      return authenticated ? safeUser(user) : null;
    },
  });
}
