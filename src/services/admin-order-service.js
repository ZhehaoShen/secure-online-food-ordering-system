import { deferredAuditRecorder } from "../audit/deferred-audit-recorder.js";
import { PublicApplicationError } from "../errors.js";

const MAXIMUM_DATABASE_ID = 9_223_372_036_854_775_807n;

export const ADMIN_ORDER_STATUSES = Object.freeze([
  "confirmed",
  "preparing",
  "completed",
  "cancelled",
]);

const ALLOWED_TRANSITIONS = Object.freeze({
  confirmed: Object.freeze(["preparing", "cancelled"]),
  preparing: Object.freeze(["completed", "cancelled"]),
  completed: Object.freeze([]),
  cancelled: Object.freeze([]),
});

export class AdminOrderInputError extends PublicApplicationError {
  constructor() {
    super({
      name: "AdminOrderInputError",
      code: "INVALID_ORDER_STATUS",
      message: "The order status is invalid.",
      statusCode: 422,
    });
  }
}

export class AdminOrderNotFoundError extends PublicApplicationError {
  constructor() {
    super({
      name: "AdminOrderNotFoundError",
      code: "ADMIN_ORDER_NOT_FOUND",
      message: "The order could not be found.",
      statusCode: 404,
    });
  }
}

export class AdminOrderTransitionError extends PublicApplicationError {
  constructor() {
    super({
      name: "AdminOrderTransitionError",
      code: "ORDER_STATUS_TRANSITION_NOT_ALLOWED",
      message: "That order status change is not allowed.",
      statusCode: 409,
    });
  }
}

function validDatabaseId(value) {
  return typeof value === "string" &&
    /^[1-9][0-9]{0,18}$/.test(value) &&
    BigInt(value) <= MAXIMUM_DATABASE_ID;
}

function normalizeId(value) {
  if (!validDatabaseId(value)) {
    throw new AdminOrderNotFoundError();
  }

  return value;
}

function normalizeStatus(value, { optional = false } = {}) {
  if (optional && (value === undefined || value === null || value === "")) {
    return null;
  }

  if (typeof value !== "string" || !ADMIN_ORDER_STATUSES.includes(value)) {
    throw new AdminOrderInputError();
  }

  return value;
}

function withTransitions(order) {
  return Object.freeze({
    ...order,
    allowedNextStatuses: ALLOWED_TRANSITIONS[order.status],
  });
}

export function createAdminOrderService(
  orderRepository,
  { auditRecorder = deferredAuditRecorder } = {},
) {
  if (
    !orderRepository ||
    typeof orderRepository.listAllForAdministration !== "function" ||
    typeof orderRepository.findByIdForAdministration !== "function" ||
    typeof orderRepository.updateStatus !== "function"
  ) {
    throw new TypeError("An order repository is required.");
  }

  if (!auditRecorder || typeof auditRecorder.record !== "function") {
    throw new TypeError("An audit recorder interface is required.");
  }

  async function findOrder(orderId) {
    const order = await orderRepository.findByIdForAdministration(orderId);

    if (!order) {
      throw new AdminOrderNotFoundError();
    }

    return order;
  }

  return Object.freeze({
    async listOrders({ status } = {}) {
      const selectedStatus = normalizeStatus(status, { optional: true });
      const orders = await orderRepository.listAllForAdministration({
        status: selectedStatus,
      });

      return Object.freeze({
        orders: Object.freeze(orders),
        selectedStatus,
      });
    },

    async getOrder({ orderId } = {}) {
      return withTransitions(await findOrder(normalizeId(orderId)));
    },

    async updateOrderStatus({ actorUserId, orderId, status } = {}) {
      const actorId = normalizeId(actorUserId);
      const id = normalizeId(orderId);
      const nextStatus = normalizeStatus(status);
      const current = await findOrder(id);

      if (!ALLOWED_TRANSITIONS[current.status].includes(nextStatus)) {
        throw new AdminOrderTransitionError();
      }

      const updated = await orderRepository.updateStatus({
        orderId: id,
        expectedStatus: current.status,
        nextStatus,
      });

      if (!updated) {
        throw new AdminOrderTransitionError();
      }

      await auditRecorder.record(Object.freeze({
        action: "order.status_updated",
        actorUserId: actorId,
        entityType: "order",
        entityId: updated.id,
        result: "success",
      }));

      return updated;
    },
  });
}
