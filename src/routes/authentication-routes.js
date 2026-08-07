import { createAuthenticationController } from "../controllers/authentication-controller.js";
import { publicInputValidation } from "../validation/public-input.js";

export function registerAuthenticationRoutes(
  app,
  { userService, sessionCookie, auditRecorder },
) {
  const controller = createAuthenticationController(userService, {
    sessionCookie,
    auditRecorder,
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
