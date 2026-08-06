import { ADMIN_ORDER_STATUSES } from "../services/admin-order-service.js";
import { createRequestValidator, requestField } from "./request.js";

const databaseId = requestField.positiveBigInt();
const notice = requestField.optional(requestField.enumeration([
  "created", "updated", "disabled",
]));
const orderNotice = requestField.optional(
  requestField.enumeration(["updated"]),
);
const orderStatus = requestField.enumeration(ADMIN_ORDER_STATUSES);
const optionalOrderStatus = requestField.optional(orderStatus);
const foodName = requestField.text({
  minimumCodePoints: 1, maximumCodePoints: 120, maximumBytes: 480,
  trim: true, normalization: "NFC",
});
const category = requestField.text({
  minimumCodePoints: 1, maximumCodePoints: 80, maximumBytes: 320,
  trim: true, normalization: "NFC",
});
const description = requestField.text({
  maximumCodePoints: 2_000, maximumBytes: 8_000,
  trim: true, normalization: "NFC",
});
const price = requestField.text({
  minimumCodePoints: 1, maximumCodePoints: 11, maximumBytes: 11,
  trim: true,
  pattern: /^(?:0|[1-9][0-9]{0,7})(?:\.[0-9]{1,2})?$/,
});
const availability = requestField.optional(requestField.enumeration([
  "", "on", "true", "1", "false", "0",
]), { defaultValue: "" });
const foodBody = Object.freeze({
  name: foodName,
  category,
  description,
  price,
  isAvailable: availability,
});

export const administratorInputValidation = Object.freeze({
  foodList: createRequestValidator({ query: { notice } }),
  newFood: createRequestValidator({ query: {} }),
  createFood: createRequestValidator({ body: foodBody }),
  editFood: createRequestValidator({
    params: { foodItemId: databaseId }, query: {},
  }),
  updateFood: createRequestValidator({
    params: { foodItemId: databaseId }, body: foodBody,
  }),
  disableFood: createRequestValidator({
    params: { foodItemId: databaseId }, body: {},
  }),
  orderList: createRequestValidator({
    query: { status: optionalOrderStatus },
  }),
  orderDetail: createRequestValidator({
    params: { orderId: databaseId }, query: { notice: orderNotice },
  }),
  updateOrderStatus: createRequestValidator({
    params: { orderId: databaseId }, body: { status: orderStatus },
  }),
});
