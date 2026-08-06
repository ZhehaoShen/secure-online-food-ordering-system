import { createAdminFoodController } from "../controllers/admin-food-controller.js";
import { requireAdministrator } from "../middleware/authentication.js";
import { administratorInputValidation } from "../validation/administrator-input.js";

export function registerAdminFoodRoutes(app, {
  foodManagementService,
}) {
  const controller = createAdminFoodController(foodManagementService);

  app.get(
    "/admin/food-items",
    requireAdministrator,
    administratorInputValidation.foodList,
    controller.index,
  );
  app.get(
    "/admin/food-items/new",
    requireAdministrator,
    administratorInputValidation.newFood,
    controller.newForm,
  );
  app.post(
    "/admin/food-items",
    requireAdministrator,
    administratorInputValidation.createFood,
    controller.create,
    controller.invalidCreateInput,
  );
  app.get(
    "/admin/food-items/:foodItemId/edit",
    requireAdministrator,
    administratorInputValidation.editFood,
    controller.editForm,
    controller.invalidIdentifierInput,
  );
  app.post(
    "/admin/food-items/:foodItemId",
    requireAdministrator,
    administratorInputValidation.updateFood,
    controller.update,
    controller.invalidUpdateInput,
  );
  app.post(
    "/admin/food-items/:foodItemId/disable",
    requireAdministrator,
    administratorInputValidation.disableFood,
    controller.disable,
    controller.invalidIdentifierInput,
  );
}
