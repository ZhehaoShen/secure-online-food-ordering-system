import { PublicApplicationError } from "../errors.js";

export class MenuQueryError extends PublicApplicationError {
  constructor() {
    super({
      name: "MenuQueryError",
      code: "INVALID_MENU_QUERY",
      message: "The menu filter is invalid.",
      statusCode: 422,
    });
  }
}

function normalizeCategory(category) {
  if (category === undefined || category === null || category === "") {
    return null;
  }

  if (typeof category !== "string") {
    throw new MenuQueryError();
  }

  const normalized = category.trim();

  if (normalized.length < 1 || normalized.length > 80) {
    throw new MenuQueryError();
  }

  return normalized;
}

export function createMenuService(foodItemRepository) {
  return Object.freeze({
    async listAvailableFoods({ category } = {}) {
      return foodItemRepository.listAvailable({
        category: normalizeCategory(category),
      });
    },

    async getMenu({ category } = {}) {
      const selectedCategory = normalizeCategory(category);
      const [foods, categories] = await Promise.all([
        foodItemRepository.listAvailable({ category: selectedCategory }),
        foodItemRepository.listAvailableCategories(),
      ]);

      return Object.freeze({
        foods,
        categories: Object.freeze([...categories]),
        selectedCategory,
      });
    },
  });
}
