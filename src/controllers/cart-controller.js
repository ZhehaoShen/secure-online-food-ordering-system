import { saveSession } from "../session/persistence.js";
import {
  CartFoodUnavailableError,
  CartInputError,
  CartItemNotFoundError,
} from "../services/cart-service.js";
import { RequestValidationError } from "../validation/request.js";

const cadCurrency = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
});

function cartView(cart) {
  return Object.freeze({
    ...cart,
    items: cart.items.map((item) => Object.freeze({
      ...item,
      price: cadCurrency.format(item.priceCents / 100),
      lineTotal: cadCurrency.format(item.lineTotalCents / 100),
    })),
    total: cadCurrency.format(cart.totalCents / 100),
  });
}

export function renderCart(response, cart, {
  statusCode = 200,
  errors = [],
} = {}) {
  response.status(statusCode).render("cart", {
    pageTitle: "Cart",
    activePath: "/cart",
    cart: cartView(cart),
    errors,
  });
}

function controlledCartError(error) {
  return error instanceof CartInputError ||
    error instanceof CartFoodUnavailableError ||
    error instanceof CartItemNotFoundError;
}

export function createCartController(cartService) {
  async function renderError(request, response, error) {
    const cart = await cartService.getCart(request.session.cart);
    request.session.cart = cart.state;
    renderCart(response, cart, {
      statusCode: error.statusCode,
      errors: [error.message],
    });
  }

  return Object.freeze({
    async show(request, response) {
      const cart = await cartService.getCart(request.session.cart);
      request.session.cart = cart.state;
      renderCart(response, cart);
    },

    async add(request, response) {
      const input = request.validatedInput.body;

      try {
        request.session.cart = await cartService.addItem(
          request.session.cart,
          {
            foodItemId: input.foodItemId,
            quantity: String(input.quantity),
          },
        );
        await saveSession(request);
        response.redirect(303, "/cart");
      } catch (error) {
        if (!controlledCartError(error)) {
          throw error;
        }

        await renderError(request, response, error);
      }
    },

    async update(request, response) {
      const input = request.validatedInput;

      try {
        request.session.cart = await cartService.updateItem(
          request.session.cart,
          {
            foodItemId: input.params.foodItemId,
            quantity: String(input.body.quantity),
          },
        );
        await saveSession(request);
        response.redirect(303, "/cart");
      } catch (error) {
        if (!controlledCartError(error)) {
          throw error;
        }

        await renderError(request, response, error);
      }
    },

    async remove(request, response) {
      const input = request.validatedInput;

      try {
        request.session.cart = cartService.removeItem(
          request.session.cart,
          {
            foodItemId: input.params.foodItemId,
          },
        );
        await saveSession(request);
        response.redirect(303, "/cart");
      } catch (error) {
        if (!(error instanceof CartInputError)) {
          throw error;
        }

        await renderError(request, response, error);
      }
    },

    async invalidInput(error, request, response, next) {
      if (!(error instanceof RequestValidationError)) {
        next(error);
        return;
      }

      await renderError(request, response, error);
    },
  });
}
