import { createRegistrationController } from "../controllers/registration-controller.js";
import { publicInputValidation } from "../validation/public-input.js";

export function registerRegistrationRoutes(app, { userService }) {
  const controller = createRegistrationController(userService);

  app.get(
    "/register",
    publicInputValidation.registrationPage,
    controller.show,
  );
  app.post(
    "/register",
    publicInputValidation.registration,
    controller.create,
    controller.invalidInput,
  );
}
