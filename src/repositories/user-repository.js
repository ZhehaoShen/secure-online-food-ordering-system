import { DatabaseUnavailableError } from "../db/pool.js";

const FIND_ACTIVE_USER_BY_EMAIL_QUERY = {
  name: "users-find-active-by-email",
  text: `
    SELECT
      id,
      name,
      email,
      password_hash,
      role,
      failed_login_count,
      locked_until
    FROM users
    WHERE lower(email) = lower($1)
      AND disabled_at IS NULL
    LIMIT 1
  `,
};

const RECORD_AUTHENTICATION_FAILURE_QUERY = {
  name: "users-record-authentication-failure",
  text: `
    WITH current_failure AS (
      SELECT
        id,
        CASE
          WHEN locked_until IS NOT NULL AND locked_until <= $2 THEN 1
          ELSE LEAST(failed_login_count + 1, $3)
        END AS next_count
      FROM users
      WHERE id = $1
        AND disabled_at IS NULL
      FOR UPDATE
    )
    UPDATE users AS target_user
    SET
      failed_login_count = current_failure.next_count,
      locked_until = CASE
        WHEN current_failure.next_count >= $3 THEN $4::timestamptz
        ELSE NULL
      END,
      updated_at = $2
    FROM current_failure
    WHERE target_user.id = current_failure.id
  `,
};

const RESET_AUTHENTICATION_FAILURES_QUERY = {
  name: "users-reset-authentication-failures",
  text: `
    UPDATE users
    SET
      failed_login_count = 0,
      locked_until = NULL,
      updated_at = $2
    WHERE id = $1
      AND disabled_at IS NULL
  `,
};

const CREATE_CUSTOMER_QUERY = {
  name: "users-create-customer",
  text: `
    INSERT INTO users (
      name,
      email,
      password_hash,
      role
    )
    VALUES ($1, $2, $3, 'customer')
    RETURNING
      id,
      name,
      email,
      role,
      created_at
  `,
};

const UNIQUE_VIOLATION_CODE = "23505";
const EMAIL_UNIQUE_CONSTRAINT = "users_email_lower_unique";

export class DuplicateUserError extends Error {
  constructor() {
    super("A user with this normalized email already exists.");
    this.name = "DuplicateUserError";
    this.code = "DUPLICATE_USER";
  }
}

function mapAuthenticationUser(row) {
  return Object.freeze({
    id: String(row.id),
    name: row.name,
    email: row.email,
    passwordHash: row.password_hash,
    role: row.role,
    failedLoginCount: row.failed_login_count,
    lockedUntil: row.locked_until,
  });
}

function mapCreatedUser(row) {
  return Object.freeze({
    id: String(row.id),
    name: row.name,
    email: row.email,
    role: row.role,
    createdAt: row.created_at,
  });
}

function isDuplicateEmailError(error) {
  return error?.code === UNIQUE_VIOLATION_CODE &&
    error?.constraint === EMAIL_UNIQUE_CONSTRAINT;
}

export function createUserRepository(pool) {
  if (!pool || typeof pool.query !== "function") {
    throw new TypeError("A PostgreSQL pool is required for the user repository.");
  }

  return Object.freeze({
    async findActiveByEmail(email) {
      try {
        const result = await pool.query({
          ...FIND_ACTIVE_USER_BY_EMAIL_QUERY,
          values: [email],
        });

        const row = result.rows[0];
        return row ? mapAuthenticationUser(row) : null;
      } catch (error) {
        throw new DatabaseUnavailableError(error);
      }
    },

    async createCustomer({ name, email, passwordHash }) {
      try {
        const result = await pool.query({
          ...CREATE_CUSTOMER_QUERY,
          values: [name, email, passwordHash],
        });

        return mapCreatedUser(result.rows[0]);
      } catch (error) {
        if (isDuplicateEmailError(error)) {
          throw new DuplicateUserError();
        }

        throw new DatabaseUnavailableError(error);
      }
    },

    async recordAuthenticationFailure({
      userId,
      attemptedAt,
      threshold,
      lockedUntil,
    }) {
      try {
        await pool.query({
          ...RECORD_AUTHENTICATION_FAILURE_QUERY,
          values: [userId, attemptedAt, threshold, lockedUntil],
        });
      } catch (error) {
        throw new DatabaseUnavailableError(error);
      }
    },

    async resetAuthenticationFailures({ userId, authenticatedAt }) {
      try {
        await pool.query({
          ...RESET_AUTHENTICATION_FAILURES_QUERY,
          values: [userId, authenticatedAt],
        });
      } catch (error) {
        throw new DatabaseUnavailableError(error);
      }
    },
  });
}
