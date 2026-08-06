import {
  createRequestValidator,
  requestField,
} from "./request.js";

const databaseId = requestField.positiveBigInt();
const quantity = requestField.integer({ minimum: 1, maximum: 99 });

export const customerInputValidation = Object.freeze({
  cartPage: createRequestValidator({ query: {} }),
  addCartItem: createRequestValidator({
    body: {
      foodItemId: databaseId,
      quantity,
    },
  }),
  updateCartItem: createRequestValidator({
    params: { foodItemId: databaseId },
    body: { quantity },
  }),
  removeCartItem: createRequestValidator({
    params: { foodItemId: databaseId },
    body: {},
  }),
  orderHistory: createRequestValidator({ query: {} }),
  orderDetail: createRequestValidator({
    params: { orderId: databaseId },
    query: {},
  }),
  checkout: createRequestValidator({ body: {} }),
});
