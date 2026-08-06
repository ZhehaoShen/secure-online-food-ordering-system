import { createOrderController } from "../controllers/order-controller.js";
import { requireAuthentication } from "../middleware/authentication.js";
import { customerInputValidation } from "../validation/customer-input.js";

export function registerOrderRoutes(app, {
  cartService,
  orderService,
}) {
  const controller = createOrderController({
    cartService,
    orderService,
  });

  app.get(
    "/orders",
    requireAuthentication,
    customerInputValidation.orderHistory,
    controller.history,
  );
  app.get(
    "/orders/:orderId",
    requireAuthentication,
    customerInputValidation.orderDetail,
    controller.show,
    controller.invalidOrderDetailInput,
  );
  app.post(
    "/orders",
    requireAuthentication,
    customerInputValidation.checkout,
    controller.checkout,
    controller.invalidCheckoutInput,
  );
}
