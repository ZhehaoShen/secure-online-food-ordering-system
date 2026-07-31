import { createAuthenticationController } from "../controllers/authentication-controller.js";

export function registerAuthenticationRoutes(
  app,
  { userService, sessionCookie },
) {
  const controller = createAuthenticationController(userService, {
    sessionCookie,
  });

  app.get("/login", controller.show);
  app.post("/login", controller.create);
  app.post("/logout", controller.destroy);
}
