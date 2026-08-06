import {
  EmptyOrderDraftError,
  InvalidOrderDraftError,
  OrderItemsUnavailableError,
  OrderNotFoundError,
} from "../services/order-service.js";
import { saveSession } from "../session/persistence.js";
import { RequestValidationError } from "../validation/request.js";
import { renderCart } from "./cart-controller.js";

function controlledOrderError(error) {
  return error instanceof EmptyOrderDraftError ||
    error instanceof InvalidOrderDraftError ||
    error instanceof OrderItemsUnavailableError;
}

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
      lineTotal: cadCurrency.format(item.lineTotalCents / 100),
    }))),
  });
}

export function createOrderController({ cartService, orderService }) {
  return Object.freeze({
    async history(request, response) {
      const orders = await orderService.listCustomerOrders({
        userId: request.authenticatedUser.id,
      });

      response.status(200).render("orders", {
        pageTitle: "Order history",
        activePath: "/orders",
        orders: orders.map(orderSummaryView),
      });
    },

    async show(request, response) {
      try {
        const order = await orderService.getCustomerOrder({
          userId: request.authenticatedUser.id,
          orderId: request.validatedInput.params.orderId,
        });

        response.status(200).render("order-detail", {
          pageTitle: `Order #${order.id}`,
          activePath: "/orders",
          order: orderDetailView(order),
        });
      } catch (error) {
        if (!(error instanceof OrderNotFoundError)) {
          throw error;
        }

        response.status(404).render("order-detail", {
          pageTitle: "Order not found",
          activePath: "/orders",
          order: null,
        });
      }
    },

    invalidOrderDetailInput(error, _request, response, next) {
      if (
        !(error instanceof RequestValidationError) ||
        error.field !== "orderId"
      ) {
        next(error);
        return;
      }

      response.status(404).render("order-detail", {
        pageTitle: "Order not found",
        activePath: "/orders",
        order: null,
      });
    },

    async checkout(request, response) {
      try {
        const order = await orderService.checkout({
          userId: request.authenticatedUser.id,
          cart: request.session.cart,
        });

        request.session.cart = Object.freeze({
          items: Object.freeze({}),
        });
        await saveSession(request);
        response.redirect(303, `/orders/${order.id}`);
      } catch (error) {
        if (!controlledOrderError(error)) {
          throw error;
        }

        const cart = await cartService.getCart(request.session.cart);
        renderCart(response, cart, {
          statusCode: error.statusCode,
          errors: [error.message],
        });
      }
    },

    async invalidCheckoutInput(error, request, response, next) {
      if (!(error instanceof RequestValidationError)) {
        next(error);
        return;
      }

      const cart = await cartService.getCart(request.session.cart);
      renderCart(response, cart, {
        statusCode: error.statusCode,
        errors: [error.message],
      });
    },
  });
}
