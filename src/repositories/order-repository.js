import { PublicApplicationError } from "../errors.js";
import { DatabaseUnavailableError } from "../db/pool.js";

const ADMIN_ORDER_LIST_QUERY = {
  name: "orders-list-admin",
  text: `
    SELECT
      managed_order.id,
      managed_order.user_id,
      managed_order.status,
      managed_order.total_cents,
      managed_order.created_at,
      managed_order.updated_at,
      customer.name AS customer_name,
      customer.email AS customer_email,
      count(order_line.food_item_id)::integer AS line_count,
      coalesce(sum(order_line.quantity), 0)::integer AS item_count
    FROM orders AS managed_order
    JOIN users AS customer
      ON customer.id = managed_order.user_id
    LEFT JOIN order_items AS order_line
      ON order_line.order_id = managed_order.id
    WHERE ($1::text IS NULL OR managed_order.status = $1)
    GROUP BY managed_order.id, customer.id
    ORDER BY managed_order.created_at DESC, managed_order.id DESC
    LIMIT 100
  `,
};

const ADMIN_ORDER_DETAIL_QUERY = {
  name: "orders-find-admin-detail",
  text: `
    SELECT
      managed_order.id,
      managed_order.id AS order_id,
      managed_order.user_id,
      managed_order.status,
      managed_order.total_cents,
      managed_order.created_at,
      managed_order.updated_at,
      customer.name AS customer_name,
      customer.email AS customer_email,
      order_line.food_item_id,
      order_line.food_name_snapshot,
      order_line.unit_price_cents,
      order_line.quantity
    FROM orders AS managed_order
    JOIN users AS customer
      ON customer.id = managed_order.user_id
    LEFT JOIN order_items AS order_line
      ON order_line.order_id = managed_order.id
    WHERE managed_order.id = $1
    ORDER BY order_line.food_name_snapshot ASC,
      order_line.food_item_id ASC
  `,
};

const UPDATE_ORDER_STATUS_QUERY = {
  name: "orders-update-admin-status",
  text: `
    UPDATE orders
    SET
      status = $3,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $1
      AND status = $2
    RETURNING
      id,
      user_id,
      status,
      total_cents,
      created_at,
      updated_at
  `,
};

const CUSTOMER_ORDER_HISTORY_QUERY = {
  name: "orders-list-customer-history",
  text: `
    SELECT
      customer_order.id,
      customer_order.user_id,
      customer_order.status,
      customer_order.total_cents,
      customer_order.created_at,
      customer_order.updated_at,
      count(order_line.food_item_id)::integer AS line_count,
      coalesce(sum(order_line.quantity), 0)::integer AS item_count
    FROM orders AS customer_order
    LEFT JOIN order_items AS order_line
      ON order_line.order_id = customer_order.id
    WHERE customer_order.user_id = $1
    GROUP BY customer_order.id
    ORDER BY customer_order.created_at DESC, customer_order.id DESC
    LIMIT 100
  `,
};

const CUSTOMER_ORDER_DETAIL_QUERY = {
  name: "orders-find-customer-detail",
  text: `
    SELECT
      customer_order.id,
      customer_order.id AS order_id,
      customer_order.user_id,
      customer_order.status,
      customer_order.total_cents,
      customer_order.created_at,
      customer_order.updated_at,
      order_line.food_item_id,
      order_line.food_name_snapshot,
      order_line.unit_price_cents,
      order_line.quantity
    FROM orders AS customer_order
    LEFT JOIN order_items AS order_line
      ON order_line.order_id = customer_order.id
    WHERE customer_order.id = $1
      AND customer_order.user_id = $2
    ORDER BY order_line.food_name_snapshot ASC,
      order_line.food_item_id ASC
  `,
};

const LOAD_FOODS_FOR_CHECKOUT_QUERY = {
  name: "orders-load-foods-for-checkout",
  text: `
    SELECT
      id,
      name,
      price_cents,
      is_available
    FROM food_items
    WHERE id = ANY($1::bigint[])
    ORDER BY id ASC
    FOR UPDATE
  `,
};

const INSERT_ORDER_QUERY = {
  name: "orders-insert-confirmed",
  text: `
    INSERT INTO orders (
      user_id,
      status,
      total_cents
    )
    VALUES ($1, 'confirmed', $2)
    RETURNING
      id,
      user_id,
      status,
      total_cents,
      created_at,
      updated_at
  `,
};

const INSERT_ORDER_ITEM_QUERY = {
  name: "order-items-insert-snapshot",
  text: `
    INSERT INTO order_items (
      order_id,
      food_item_id,
      food_name_snapshot,
      unit_price_cents,
      quantity
    )
    VALUES ($1, $2, $3, $4, $5)
    RETURNING
      order_id,
      food_item_id,
      food_name_snapshot,
      unit_price_cents,
      quantity
  `,
};

export class OrderPersistenceError extends PublicApplicationError {
  constructor(cause) {
    super({
      name: "OrderPersistenceError",
      code: "ORDER_NOT_CREATED",
      message: "The order could not be placed.",
      statusCode: 500,
      cause,
    });
  }
}

function mapFood(row) {
  return Object.freeze({
    id: String(row.id),
    name: row.name,
    priceCents: row.price_cents,
    isAvailable: row.is_available,
  });
}

function mapOrder(row) {
  return Object.freeze({
    id: String(row.id),
    userId: String(row.user_id),
    status: row.status,
    totalCents: row.total_cents,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function mapOrderItem(row) {
  return Object.freeze({
    orderId: String(row.order_id),
    foodItemId: String(row.food_item_id),
    foodNameSnapshot: row.food_name_snapshot,
    unitPriceCents: row.unit_price_cents,
    quantity: row.quantity,
  });
}

function mapOrderSummary(row) {
  return Object.freeze({
    ...mapOrder(row),
    lineCount: row.line_count,
    itemCount: row.item_count,
  });
}

function mapAdminOrderSummary(row) {
  return Object.freeze({
    ...mapOrderSummary(row),
    customerName: row.customer_name,
    customerEmail: row.customer_email,
  });
}

function mapOrderDetail(rows) {
  if (rows.length === 0) {
    return null;
  }

  const order = mapOrder(rows[0]);
  const items = rows
    .filter((row) => row.food_item_id !== null)
    .map(mapOrderItem);

  return Object.freeze({
    ...order,
    items: Object.freeze(items),
  });
}

function mapAdminOrderDetail(rows) {
  if (rows.length === 0) {
    return null;
  }

  const detail = mapOrderDetail(rows);

  return Object.freeze({
    ...detail,
    customerName: rows[0].customer_name,
    customerEmail: rows[0].customer_email,
  });
}

function createTransaction(client) {
  return Object.freeze({
    async loadFoodsForCheckout(ids) {
      const result = await client.query({
        ...LOAD_FOODS_FOR_CHECKOUT_QUERY,
        values: [ids],
      });

      return result.rows.map(mapFood);
    },

    async insertOrder({ userId, totalCents }) {
      const result = await client.query({
        ...INSERT_ORDER_QUERY,
        values: [userId, totalCents],
      });

      return mapOrder(result.rows[0]);
    },

    async insertOrderItems(items) {
      const insertedItems = [];

      for (const item of items) {
        const result = await client.query({
          ...INSERT_ORDER_ITEM_QUERY,
          values: [
            item.orderId,
            item.foodItemId,
            item.foodNameSnapshot,
            item.unitPriceCents,
            item.quantity,
          ],
        });
        insertedItems.push(mapOrderItem(result.rows[0]));
      }

      return Object.freeze(insertedItems);
    },
  });
}

export function createOrderRepository(pool) {
  if (
    !pool ||
    typeof pool.connect !== "function" ||
    typeof pool.query !== "function"
  ) {
    throw new TypeError("A database pool is required.");
  }

  return Object.freeze({
    async listAllForAdministration({ status = null } = {}) {
      try {
        const result = await pool.query({
          ...ADMIN_ORDER_LIST_QUERY,
          values: [status],
        });

        return result.rows.map(mapAdminOrderSummary);
      } catch (error) {
        throw new DatabaseUnavailableError(error);
      }
    },

    async findByIdForAdministration(orderId) {
      try {
        const result = await pool.query({
          ...ADMIN_ORDER_DETAIL_QUERY,
          values: [orderId],
        });

        return mapAdminOrderDetail(result.rows);
      } catch (error) {
        throw new DatabaseUnavailableError(error);
      }
    },

    async updateStatus({ orderId, expectedStatus, nextStatus }) {
      try {
        const result = await pool.query({
          ...UPDATE_ORDER_STATUS_QUERY,
          values: [orderId, expectedStatus, nextStatus],
        });
        const row = result.rows[0];

        return row ? mapOrder(row) : null;
      } catch (error) {
        throw new DatabaseUnavailableError(error);
      }
    },

    async listByUserId(userId) {
      try {
        const result = await pool.query({
          ...CUSTOMER_ORDER_HISTORY_QUERY,
          values: [userId],
        });

        return result.rows.map(mapOrderSummary);
      } catch (error) {
        throw new DatabaseUnavailableError(error);
      }
    },

    async findByIdForUser({ orderId, userId }) {
      try {
        const result = await pool.query({
          ...CUSTOMER_ORDER_DETAIL_QUERY,
          values: [orderId, userId],
        });

        return mapOrderDetail(result.rows);
      } catch (error) {
        throw new DatabaseUnavailableError(error);
      }
    },

    async runInTransaction(work) {
      let client;
      let transactionStarted = false;

      try {
        client = await pool.connect();
        await client.query("BEGIN");
        transactionStarted = true;

        const result = await work(createTransaction(client));

        await client.query("COMMIT");
        transactionStarted = false;
        return result;
      } catch (error) {
        if (client && transactionStarted) {
          try {
            await client.query("ROLLBACK");
          } catch {
            throw new OrderPersistenceError(error);
          }
        }

        if (error instanceof PublicApplicationError) {
          throw error;
        }

        throw new OrderPersistenceError(error);
      } finally {
        client?.release();
      }
    },
  });
}
