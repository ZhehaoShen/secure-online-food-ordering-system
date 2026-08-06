import {
  ADMIN_ORDER_STATUSES,
  AdminOrderInputError,
  AdminOrderNotFoundError,
  AdminOrderTransitionError,
} from "../services/admin-order-service.js";
import { RequestValidationError } from "../validation/request.js";

const cadCurrency = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
});

const orderDateTime = new Intl.DateTimeFormat("en-CA", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/Toronto",
});

function statusLabel(status) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function statusOptions(selectedStatus = null) {
  return ADMIN_ORDER_STATUSES.map((status) => Object.freeze({
    value: status,
    label: statusLabel(status),
    selected: status === selectedStatus,
  }));
}

function orderSummaryView(order) {
  return Object.freeze({
    ...order,
    statusLabel: statusLabel(order.status),
    total: cadCurrency.format(order.totalCents / 100),
    created: orderDateTime.format(order.createdAt),
  });
}

function orderDetailView(order) {
  return Object.freeze({
    ...orderSummaryView(order),
    items: Object.freeze(order.items.map((item) => Object.freeze({
      ...item,
      unitPrice: cadCurrency.format(item.unitPriceCents / 100),
      lineTotal: cadCurrency.format(
        item.unitPriceCents * item.quantity / 100,
      ),
    }))),
    transitions: Object.freeze(
      order.allowedNextStatuses.map((status) => Object.freeze({
        value: status,
        label: statusLabel(status),
      })),
    ),
  });
}

function renderList(response, {
  orders = [],
  selectedStatus = null,
  errors = [],
  statusCode = 200,
} = {}) {
  response.status(statusCode).render("admin-orders", {
    pageTitle: "Manage orders",
    activePath: "/admin/orders",
    orders: orders.map(orderSummaryView),
    selectedStatus,
    statuses: statusOptions(selectedStatus),
    errors,
  });
}

function renderDetail(response, {
  order = null,
  errors = [],
  notice = null,
  statusCode = 200,
} = {}) {
  response.status(statusCode).render("admin-order-detail", {
    pageTitle: order ? `Manage order #${order.id}` : "Order not found",
    activePath: "/admin/orders",
    order: order ? orderDetailView(order) : null,
    errors,
    notice,
  });
}

export function createAdminOrderController(adminOrderService) {
  async function loadDetail(request) {
    return adminOrderService.getOrder({
      orderId: request.validatedInput?.params?.orderId ?? request.params.orderId,
    });
  }

  return Object.freeze({
    async index(request, response) {
      try {
        const result = await adminOrderService.listOrders({
          status: request.validatedInput.query.status,
        });
        renderList(response, result);
      } catch (error) {
        if (!(error instanceof AdminOrderInputError)) {
          throw error;
        }

        renderList(response, {
          statusCode: error.statusCode,
          errors: [error.message],
        });
      }
    },

    async show(request, response) {
      try {
        const order = await loadDetail(request);
        renderDetail(response, {
          order,
          notice: request.validatedInput.query.notice === "updated"
            ? "The order status was updated."
            : null,
        });
      } catch (error) {
        if (!(error instanceof AdminOrderNotFoundError)) {
          throw error;
        }

        renderDetail(response, { statusCode: 404 });
      }
    },

    async updateStatus(request, response) {
      const input = request.validatedInput;
      try {
        const updated = await adminOrderService.updateOrderStatus({
          actorUserId: request.authenticatedUser.id,
          orderId: input.params.orderId,
          status: input.body.status,
        });
        response.redirect(
          303,
          `/admin/orders/${updated.id}?notice=updated`,
        );
      } catch (error) {
        if (error instanceof AdminOrderNotFoundError) {
          renderDetail(response, { statusCode: 404 });
          return;
        }

        if (
          !(error instanceof AdminOrderInputError) &&
          !(error instanceof AdminOrderTransitionError)
        ) {
          throw error;
        }

        try {
          const order = await loadDetail(request);
          renderDetail(response, {
            order,
            statusCode: error.statusCode,
            errors: [error.message],
          });
        } catch (loadError) {
          if (!(loadError instanceof AdminOrderNotFoundError)) {
            throw loadError;
          }

          renderDetail(response, { statusCode: 404 });
        }
      }
    },

    invalidListInput(error, _request, response, next) {
      if (!(error instanceof RequestValidationError)) {
        next(error);
        return;
      }
      renderList(response, {
        statusCode: 422,
        errors: ["The order status is invalid."],
      });
    },

    invalidDetailInput(error, _request, response, next) {
      if (!(error instanceof RequestValidationError) || error.field !== "orderId") {
        next(error);
        return;
      }
      renderDetail(response, { statusCode: 404 });
    },

    async invalidStatusInput(error, request, response, next) {
      if (!(error instanceof RequestValidationError)) {
        next(error);
        return;
      }
      if (error.field === "orderId") {
        renderDetail(response, { statusCode: 404 });
        return;
      }
      try {
        const order = await loadDetail(request);
        renderDetail(response, {
          order,
          statusCode: 422,
          errors: [error.field === "status"
            ? "The order status is invalid."
            : error.message],
        });
      } catch (loadError) {
        if (!(loadError instanceof AdminOrderNotFoundError)) {
          throw loadError;
        }
        renderDetail(response, { statusCode: 404 });
      }
    },
  });
}
