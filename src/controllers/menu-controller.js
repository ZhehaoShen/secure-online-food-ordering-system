import { SearchQueryError } from "../services/menu-service.js";
import { RequestValidationError } from "../validation/request.js";

const cadCurrency = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
});

function foodView(food) {
  return Object.freeze({
    ...food,
    price: cadCurrency.format(food.priceCents / 100),
  });
}

function categoryView(category) {
  return Object.freeze({
    name: category,
    url: `/?category=${encodeURIComponent(category)}`,
  });
}

function safeSearchValue(value, maximumLength) {
  return typeof value === "string"
    ? value.slice(0, maximumLength)
    : "";
}

function renderSearch(response, {
  statusCode = 200,
  foods = [],
  categories = [],
  query = null,
  selectedCategory = null,
  errors = [],
} = {}) {
  response.status(statusCode).render("search", {
    pageTitle: "Search",
    activePath: "/search",
    foods: foods.map(foodView),
    categories,
    query,
    selectedCategory,
    errors,
  });
}

export function createMenuController(menuService) {
  return Object.freeze({
    async show(request, response) {
      const input = request.validatedInput.query;
      const menu = await menuService.getMenu({
        category: input.category,
      });

      response.status(200).render("menu", {
        pageTitle: "Menu",
        activePath: "/",
        foods: menu.foods.map(foodView),
        categories: menu.categories.map(categoryView),
        selectedCategory: menu.selectedCategory,
      });
    },

    async search(request, response) {
      const input = request.validatedInput.query;

      try {
        const search = await menuService.getSearchResults({
          query: input.q,
          category: input.category,
        });

        renderSearch(response, search);
      } catch (error) {
        if (!(error instanceof SearchQueryError)) {
          throw error;
        }

        renderSearch(response, {
          statusCode: 422,
          query: safeSearchValue(input.q, 120),
          selectedCategory: safeSearchValue(
            input.category,
            80,
          ),
          errors: ["Enter a search term and category within the allowed lengths."],
        });
      }
    },

    invalidSearchInput(error, request, response, next) {
      if (!(error instanceof RequestValidationError)) {
        next(error);
        return;
      }

      renderSearch(response, {
        statusCode: 422,
        query: safeSearchValue(request.query.q, 120),
        selectedCategory: safeSearchValue(request.query.category, 80),
        errors: ["Enter a search term and category within the allowed lengths."],
      });
    },
  });
}
