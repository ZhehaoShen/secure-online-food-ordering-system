import { createAuthenticationController } from "../controllers/authentication-controller.js";
import { publicInputValidation } from "../validation/public-input.js";

export function registerAuthenticationRoutes(
  app,
  { userService, sessionCookie },
) {
  const controller = createAuthenticationController(userService, {
    sessionCookie,
  });

  app.get("/login", publicInputValidation.loginPage, controller.show);
  app.post(
    "/login",
    publicInputValidation.login,
    controller.create,
    controller.invalidInput,
  );
  app.post("/logout", publicInputValidation.logout, controller.destroy);
}
