const DEFAULT_LIMIT = 50;
const MAXIMUM_LIMIT = 100;

function normalizeLimit(limit) {
  if (limit === undefined || limit === null) {
    return DEFAULT_LIMIT;
  }
  const parsed = Number.parseInt(limit, 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return DEFAULT_LIMIT;
  }
  return Math.min(parsed, MAXIMUM_LIMIT);
}

function normalizePage(page) {
  if (page === undefined || page === null) {
    return 1;
  }
  const parsed = Number.parseInt(page, 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return 1;
  }
  return parsed;
}

export function createAuditRepository(pool) {
  if (!pool || typeof pool.query !== "function") {
    throw new TypeError("A database pool is required.");
  }

  return Object.freeze({
    async record({
      actorUserId = null,
      action,
      entityType,
      entityId = null,
      result,
      details = {},
    }) {
      if (typeof action !== "string" || !action.trim()) {
        throw new TypeError("Action name is required.");
      }
      if (typeof entityType !== "string" || !entityType.trim()) {
        throw new TypeError("Entity type is required.");
      }
      if (typeof result !== "string" || !result.trim()) {
        throw new TypeError("Result status is required.");
      }

      const queryText = `
        INSERT INTO audit_logs (
          actor_user_id,
          action,
          entity_type,
          entity_id,
          result,
          details
        )
        VALUES ($1, $2, $3, $4, $5, $6::jsonb)
        RETURNING id, created_at;
      `;

      const values = [
        actorUserId ? String(actorUserId) : null,
        action.trim(),
        entityType.trim(),
        entityId ? String(entityId) : null,
        result.trim(),
        JSON.stringify(details ?? {}),
      ];

      const { rows } = await pool.query(queryText, values);
      return rows[0];
    },

    async listAllForAdministration({ page = 1, limit = 50 } = {}) {
      const activeLimit = normalizeLimit(limit);
      const activePage = normalizePage(page);
      const offset = (activePage - 1) * activeLimit;

      const countResult = await pool.query(
        "SELECT COUNT(*)::integer AS total FROM audit_logs;",
      );
      const total = countResult.rows[0]?.total ?? 0;

      const queryText = `
        SELECT
          a.id,
          a.actor_user_id AS "actorUserId",
          u.name AS "actorName",
          u.email AS "actorEmail",
          a.action,
          a.entity_type AS "entityType",
          a.entity_id AS "entityId",
          a.result,
          a.details,
          a.created_at AS "createdAt"
        FROM audit_logs a
        LEFT JOIN users u ON a.actor_user_id = u.id
        ORDER BY a.created_at DESC, a.id DESC
        LIMIT $1 OFFSET $2;
      `;

      const { rows } = await pool.query(queryText, [activeLimit, offset]);

      const totalPages = Math.max(1, Math.ceil(total / activeLimit));

      return Object.freeze({
        logs: Object.freeze(rows),
        pagination: Object.freeze({
          page: activePage,
          limit: activeLimit,
          total,
          totalPages,
        }),
      });
    },
  });
}
