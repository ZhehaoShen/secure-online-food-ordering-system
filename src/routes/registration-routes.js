import { createRegistrationController } from "../controllers/registration-controller.js";

export function registerRegistrationRoutes(app, { userService }) {
  const controller = createRegistrationController(userService);

  app.get("/register", controller.show);
  app.post("/register", controller.create);
}
