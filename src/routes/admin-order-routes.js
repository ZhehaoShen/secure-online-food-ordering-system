import { createAdminOrderController } from "../controllers/admin-order-controller.js";
import { requireAdministrator } from "../middleware/authentication.js";

export function registerAdminOrderRoutes(app, { adminOrderService }) {
  const controller = createAdminOrderController(adminOrderService);

  app.get(
    "/admin/orders",
    requireAdministrator,
    controller.index,
  );
  app.get(
    "/admin/orders/:orderId",
    requireAdministrator,
    controller.show,
  );
  app.post(
    "/admin/orders/:orderId/status",
    requireAdministrator,
    controller.updateStatus,
  );
}
