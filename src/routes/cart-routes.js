import { createCartController } from "../controllers/cart-controller.js";
import { requireAuthentication } from "../middleware/authentication.js";
import { customerInputValidation } from "../validation/customer-input.js";

export function registerCartRoutes(app, { cartService }) {
  const controller = createCartController(cartService);

  app.get(
    "/cart",
    requireAuthentication,
    customerInputValidation.cartPage,
    controller.show,
  );
  app.post(
    "/cart/items",
    requireAuthentication,
    customerInputValidation.addCartItem,
    controller.add,
    controller.invalidInput,
  );
  app.post(
    "/cart/items/:foodItemId/update",
    requireAuthentication,
    customerInputValidation.updateCartItem,
    controller.update,
    controller.invalidInput,
  );
  app.post(
    "/cart/items/:foodItemId/remove",
    requireAuthentication,
    customerInputValidation.removeCartItem,
    controller.remove,
    controller.invalidInput,
  );
}
