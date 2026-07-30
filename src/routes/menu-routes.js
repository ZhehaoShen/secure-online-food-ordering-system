import { createMenuController } from "../controllers/menu-controller.js";

export function registerMenuRoutes(app, { menuService }) {
  const controller = createMenuController(menuService);
  app.get("/", controller.show);
}
