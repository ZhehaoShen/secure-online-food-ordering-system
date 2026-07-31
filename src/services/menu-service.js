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

export class SearchQueryError extends PublicApplicationError {
  constructor() {
    super({
      name: "SearchQueryError",
      code: "INVALID_SEARCH_QUERY",
      message: "The search filters are invalid.",
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

function normalizeSearchValue(value, maximumLength) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  if (typeof value !== "string") {
    throw new SearchQueryError();
  }

  const normalized = value.trim();

  if (normalized.length < 1 || normalized.length > maximumLength) {
    throw new SearchQueryError();
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

    async getSearchResults({ query, category } = {}) {
      const normalizedQuery = normalizeSearchValue(query, 120);
      const normalizedCategory = normalizeSearchValue(category, 80);
      const [foods, categories] = await Promise.all([
        foodItemRepository.searchAvailable({
          query: normalizedQuery,
          category: normalizedCategory,
        }),
        foodItemRepository.listAvailableCategories(),
      ]);

      return Object.freeze({
        foods,
        categories: Object.freeze([...categories]),
        query: normalizedQuery,
        selectedCategory: normalizedCategory,
      });
    },
  });
}
