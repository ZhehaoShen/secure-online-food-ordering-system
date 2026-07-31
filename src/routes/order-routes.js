import { createOrderController } from "../controllers/order-controller.js";
import { requireAuthentication } from "../middleware/authentication.js";

export function registerOrderRoutes(app, {
  cartService,
  orderService,
}) {
  const controller = createOrderController({
    cartService,
    orderService,
  });

  app.get("/orders", requireAuthentication, controller.history);
  app.get(
    "/orders/:orderId",
    requireAuthentication,
    controller.show,
  );
  app.post("/orders", requireAuthentication, controller.checkout);
}
