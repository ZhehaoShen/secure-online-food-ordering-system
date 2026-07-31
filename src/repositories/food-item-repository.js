import { DatabaseUnavailableError } from "../db/pool.js";

const ADMIN_FOODS_QUERY = {
  name: "food-items-list-admin",
  text: `
    SELECT
      id,
      name,
      category,
      description,
      price_cents,
      is_available
    FROM food_items
    ORDER BY is_available DESC, category ASC, name ASC
    LIMIT 200
  `,
};

const FOOD_BY_ID_QUERY = {
  name: "food-items-find-by-id",
  text: `
    SELECT
      id,
      name,
      category,
      description,
      price_cents,
      is_available
    FROM food_items
    WHERE id = $1
    LIMIT 1
  `,
};

const CREATE_FOOD_QUERY = {
  name: "food-items-create",
  text: `
    INSERT INTO food_items (
      name,
      category,
      description,
      price_cents,
      is_available
    )
    VALUES ($1, $2, $3, $4, $5)
    RETURNING
      id,
      name,
      category,
      description,
      price_cents,
      is_available
  `,
};

const UPDATE_FOOD_QUERY = {
  name: "food-items-update",
  text: `
    UPDATE food_items
    SET
      name = $2,
      category = $3,
      description = $4,
      price_cents = $5,
      is_available = $6,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $1
    RETURNING
      id,
      name,
      category,
      description,
      price_cents,
      is_available
  `,
};

const DISABLE_FOOD_QUERY = {
  name: "food-items-disable",
  text: `
    UPDATE food_items
    SET
      is_available = false,
      updated_at = CASE
        WHEN is_available THEN CURRENT_TIMESTAMP
        ELSE updated_at
      END
    WHERE id = $1
    RETURNING
      id,
      name,
      category,
      description,
      price_cents,
      is_available
  `,
};

const AVAILABLE_FOODS_QUERY = {
  name: "food-items-list-available",
  text: `
    SELECT
      id,
      name,
      category,
      description,
      price_cents,
      is_available
    FROM food_items
    WHERE is_available = $1
    ORDER BY category ASC, name ASC
  `,
};

const AVAILABLE_FOODS_BY_CATEGORY_QUERY = {
  name: "food-items-list-available-by-category",
  text: `
    SELECT
      id,
      name,
      category,
      description,
      price_cents,
      is_available
    FROM food_items
    WHERE is_available = $1
      AND lower(category) = lower($2)
    ORDER BY category ASC, name ASC
  `,
};

const AVAILABLE_CATEGORIES_QUERY = {
  name: "food-items-list-available-categories",
  text: `
    SELECT DISTINCT category
    FROM food_items
    WHERE is_available = $1
    ORDER BY category ASC
  `,
};

const SEARCH_AVAILABLE_FOODS_QUERY = {
  name: "food-items-search-available",
  text: `
    SELECT
      id,
      name,
      category,
      description,
      price_cents,
      is_available
    FROM food_items
    WHERE is_available = $1
      AND (
        $2::text IS NULL
        OR strpos(lower(name), lower($2::text)) > 0
      )
      AND (
        $3::text IS NULL
        OR lower(category) = lower($3::text)
      )
    ORDER BY category ASC, name ASC
  `,
};

const AVAILABLE_FOODS_BY_IDS_QUERY = {
  name: "food-items-list-available-by-ids",
  text: `
    SELECT
      id,
      name,
      category,
      description,
      price_cents,
      is_available
    FROM food_items
    WHERE is_available = $1
      AND id = ANY($2::bigint[])
    ORDER BY category ASC, name ASC
  `,
};

const AVAILABLE_FOOD_BY_ID_QUERY = {
  name: "food-items-find-available-by-id",
  text: `
    SELECT
      id,
      name,
      category,
      description,
      price_cents,
      is_available
    FROM food_items
    WHERE is_available = $1
      AND id = $2
    LIMIT 1
  `,
};

function mapFoodItem(row) {
  return Object.freeze({
    id: String(row.id),
    name: row.name,
    category: row.category,
    description: row.description,
    priceCents: row.price_cents,
    isAvailable: row.is_available,
  });
}

export function createFoodItemRepository(pool) {
  return Object.freeze({
    async listAllForAdministration() {
      try {
        const result = await pool.query(ADMIN_FOODS_QUERY);
        return result.rows.map(mapFoodItem);
      } catch (error) {
        throw new DatabaseUnavailableError(error);
      }
    },

    async findById(id) {
      try {
        const result = await pool.query({
          ...FOOD_BY_ID_QUERY,
          values: [id],
        });
        const row = result.rows[0];

        return row ? mapFoodItem(row) : null;
      } catch (error) {
        throw new DatabaseUnavailableError(error);
      }
    },

    async create({
      name,
      category,
      description,
      priceCents,
      isAvailable,
    }) {
      try {
        const result = await pool.query({
          ...CREATE_FOOD_QUERY,
          values: [
            name,
            category,
            description,
            priceCents,
            isAvailable,
          ],
        });

        return mapFoodItem(result.rows[0]);
      } catch (error) {
        throw new DatabaseUnavailableError(error);
      }
    },

    async update({
      id,
      name,
      category,
      description,
      priceCents,
      isAvailable,
    }) {
      try {
        const result = await pool.query({
          ...UPDATE_FOOD_QUERY,
          values: [
            id,
            name,
            category,
            description,
            priceCents,
            isAvailable,
          ],
        });
        const row = result.rows[0];

        return row ? mapFoodItem(row) : null;
      } catch (error) {
        throw new DatabaseUnavailableError(error);
      }
    },

    async disable(id) {
      try {
        const result = await pool.query({
          ...DISABLE_FOOD_QUERY,
          values: [id],
        });
        const row = result.rows[0];

        return row ? mapFoodItem(row) : null;
      } catch (error) {
        throw new DatabaseUnavailableError(error);
      }
    },

    async listAvailable({ category = null } = {}) {
      const query = category
        ? {
            ...AVAILABLE_FOODS_BY_CATEGORY_QUERY,
            values: [true, category],
          }
        : {
            ...AVAILABLE_FOODS_QUERY,
            values: [true],
          };

      try {
        const result = await pool.query(query);
        return result.rows.map(mapFoodItem);
      } catch (error) {
        throw new DatabaseUnavailableError(error);
      }
    },

    async listAvailableCategories() {
      try {
        const result = await pool.query({
          ...AVAILABLE_CATEGORIES_QUERY,
          values: [true],
        });
        return result.rows.map((row) => row.category);
      } catch (error) {
        throw new DatabaseUnavailableError(error);
      }
    },

    async searchAvailable({ query = null, category = null } = {}) {
      try {
        const result = await pool.query({
          ...SEARCH_AVAILABLE_FOODS_QUERY,
          values: [true, query, category],
        });

        return result.rows.map(mapFoodItem);
      } catch (error) {
        throw new DatabaseUnavailableError(error);
      }
    },

    async listAvailableByIds(ids) {
      if (!Array.isArray(ids) || ids.length === 0) {
        return [];
      }

      try {
        const result = await pool.query({
          ...AVAILABLE_FOODS_BY_IDS_QUERY,
          values: [true, ids],
        });

        return result.rows.map(mapFoodItem);
      } catch (error) {
        throw new DatabaseUnavailableError(error);
      }
    },

    async findAvailableById(id) {
      try {
        const result = await pool.query({
          ...AVAILABLE_FOOD_BY_ID_QUERY,
          values: [true, id],
        });
        const row = result.rows[0];

        return row ? mapFoodItem(row) : null;
      } catch (error) {
        throw new DatabaseUnavailableError(error);
      }
    },
  });
}
