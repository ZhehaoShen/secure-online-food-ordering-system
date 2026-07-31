import {
  FoodItemNotFoundError,
  FoodManagementInputError,
} from "../services/food-management-service.js";

const cadCurrency = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
});

const NOTICES = Object.freeze({
  created: "The food item was created.",
  updated: "The food item was updated.",
  disabled: "The food item was disabled.",
});

function foodListView(food) {
  return Object.freeze({
    ...food,
    price: cadCurrency.format(food.priceCents / 100),
  });
}

function emptyForm() {
  return Object.freeze({
    name: "",
    category: "",
    description: "",
    price: "",
    isAvailable: true,
  });
}

function foodForm(food) {
  return Object.freeze({
    name: food.name,
    category: food.category,
    description: food.description,
    price: (food.priceCents / 100).toFixed(2),
    isAvailable: food.isAvailable,
  });
}

function safeText(value, maximumLength) {
  return typeof value === "string"
    ? value.slice(0, maximumLength)
    : "";
}

function submittedForm(body) {
  return Object.freeze({
    name: safeText(body?.name, 120),
    category: safeText(body?.category, 80),
    description: safeText(body?.description, 2_000),
    price: safeText(body?.price, 32),
    isAvailable:
      body?.isAvailable === "on" ||
      body?.isAvailable === "true" ||
      body?.isAvailable === "1",
  });
}

function renderForm(response, {
  mode,
  form,
  foodItemId = null,
  errors = [],
  statusCode = 200,
  missing = false,
}) {
  response.status(statusCode).render("admin-food-form", {
    pageTitle: missing
      ? "Food item not found"
      : mode === "create"
        ? "Add food item"
        : "Edit food item",
    activePath: "/admin/food-items",
    mode,
    form,
    foodItemId,
    errors,
    missing,
  });
}

function renderMissing(response) {
  renderForm(response, {
    mode: "edit",
    form: emptyForm(),
    statusCode: 404,
    missing: true,
  });
}

export function createAdminFoodController(foodManagementService) {
  return Object.freeze({
    async index(request, response) {
      const foods = await foodManagementService.listFoods();
      const notice = typeof request.query.notice === "string"
        ? NOTICES[request.query.notice] ?? null
        : null;

      response.status(200).render("admin-food-items", {
        pageTitle: "Manage food",
        activePath: "/admin/food-items",
        foods: foods.map(foodListView),
        notice,
      });
    },

    newForm(_request, response) {
      renderForm(response, {
        mode: "create",
        form: emptyForm(),
      });
    },

    async create(request, response) {
      try {
        await foodManagementService.createFood({
          actorUserId: request.authenticatedUser.id,
          input: request.body,
        });
        response.redirect(303, "/admin/food-items?notice=created");
      } catch (error) {
        if (!(error instanceof FoodManagementInputError)) {
          throw error;
        }

        renderForm(response, {
          mode: "create",
          form: submittedForm(request.body),
          errors: [error.message],
          statusCode: error.statusCode,
        });
      }
    },

    async editForm(request, response) {
      try {
        const food = await foodManagementService.getFood({
          foodItemId: request.params.foodItemId,
        });
        renderForm(response, {
          mode: "edit",
          form: foodForm(food),
          foodItemId: food.id,
        });
      } catch (error) {
        if (!(error instanceof FoodItemNotFoundError)) {
          throw error;
        }

        renderMissing(response);
      }
    },

    async update(request, response) {
      try {
        await foodManagementService.updateFood({
          actorUserId: request.authenticatedUser.id,
          foodItemId: request.params.foodItemId,
          input: request.body,
        });
        response.redirect(303, "/admin/food-items?notice=updated");
      } catch (error) {
        if (error instanceof FoodManagementInputError) {
          renderForm(response, {
            mode: "edit",
            form: submittedForm(request.body),
            foodItemId: request.params.foodItemId,
            errors: [error.message],
            statusCode: error.statusCode,
          });
          return;
        }

        if (error instanceof FoodItemNotFoundError) {
          renderMissing(response);
          return;
        }

        throw error;
      }
    },

    async disable(request, response) {
      try {
        await foodManagementService.disableFood({
          actorUserId: request.authenticatedUser.id,
          foodItemId: request.params.foodItemId,
        });
        response.redirect(303, "/admin/food-items?notice=disabled");
      } catch (error) {
        if (!(error instanceof FoodItemNotFoundError)) {
          throw error;
        }

        renderMissing(response);
      }
    },
  });
}
