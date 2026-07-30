import { DatabaseUnavailableError } from "../db/pool.js";

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
  });
}
