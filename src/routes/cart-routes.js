import { createCartController } from "../controllers/cart-controller.js";
import { requireAuthentication } from "../middleware/authentication.js";

export function registerCartRoutes(app, { cartService }) {
  const controller = createCartController(cartService);

  app.get("/cart", requireAuthentication, controller.show);
  app.post("/cart/items", requireAuthentication, controller.add);
  app.post(
    "/cart/items/:foodItemId/update",
    requireAuthentication,
    controller.update,
  );
  app.post(
    "/cart/items/:foodItemId/remove",
    requireAuthentication,
    controller.remove,
  );
}
