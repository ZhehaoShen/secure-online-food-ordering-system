import { createAdminOrderController } from "../controllers/admin-order-controller.js";
import { requireAdministrator } from "../middleware/authentication.js";
import { administratorInputValidation } from "../validation/administrator-input.js";

export function registerAdminOrderRoutes(app, { adminOrderService }) {
  const controller = createAdminOrderController(adminOrderService);

  app.get(
    "/admin/orders",
    requireAdministrator,
    administratorInputValidation.orderList,
    controller.index,
    controller.invalidListInput,
  );
  app.get(
    "/admin/orders/:orderId",
    requireAdministrator,
    administratorInputValidation.orderDetail,
    controller.show,
    controller.invalidDetailInput,
  );
  app.post(
    "/admin/orders/:orderId/status",
    requireAdministrator,
    administratorInputValidation.updateOrderStatus,
    controller.updateStatus,
    controller.invalidStatusInput,
  );
}
