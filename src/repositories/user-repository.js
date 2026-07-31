import { DatabaseUnavailableError } from "../db/pool.js";

const FIND_ACTIVE_USER_BY_EMAIL_QUERY = {
  name: "users-find-active-by-email",
  text: `
    SELECT
      id,
      name,
      email,
      password_hash,
      role
    FROM users
    WHERE lower(email) = lower($1)
      AND disabled_at IS NULL
    LIMIT 1
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
  });
}
