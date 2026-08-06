import { createMenuController } from "../controllers/menu-controller.js";
import { publicInputValidation } from "../validation/public-input.js";

export function registerMenuRoutes(app, { menuService }) {
  const controller = createMenuController(menuService);
  app.get("/", publicInputValidation.menu, controller.show);
  app.get(
    "/search",
    publicInputValidation.search,
    controller.search,
    controller.invalidSearchInput,
  );
}
