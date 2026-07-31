import { createAdminFoodController } from "../controllers/admin-food-controller.js";
import { requireAdministrator } from "../middleware/authentication.js";

export function registerAdminFoodRoutes(app, {
  foodManagementService,
}) {
  const controller = createAdminFoodController(foodManagementService);

  app.get(
    "/admin/food-items",
    requireAdministrator,
    controller.index,
  );
  app.get(
    "/admin/food-items/new",
    requireAdministrator,
    controller.newForm,
  );
  app.post(
    "/admin/food-items",
    requireAdministrator,
    controller.create,
  );
  app.get(
    "/admin/food-items/:foodItemId/edit",
    requireAdministrator,
    controller.editForm,
  );
  app.post(
    "/admin/food-items/:foodItemId",
    requireAdministrator,
    controller.update,
  );
  app.post(
    "/admin/food-items/:foodItemId/disable",
    requireAdministrator,
    controller.disable,
  );
}
