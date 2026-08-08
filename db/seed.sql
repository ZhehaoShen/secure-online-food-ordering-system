BEGIN;

INSERT INTO users (
    name,
    email,
    password_hash,
    role,
    created_at,
    updated_at
)
VALUES
    (
        'Avery Sample',
        'avery.customer@example.test',
        'scrypt$v1$N=16384,r=8,p=1$JPvK5-AH7N2bP_Cn2OCAZw$1SMEMT-pKG35i6xKtIWfPHQIozpqDJGJGz4sti4u4nE3d-5jrO3zqsoepoNTNyprpBgB6THPMAID_nUwhoAxoQ',
        'customer',
        '2026-07-28 14:00:00+00',
        '2026-07-28 14:00:00+00'
    ),
    (
        'Morgan Example',
        'morgan.customer@example.test',
        'scrypt$v1$N=16384,r=8,p=1$JPvK5-AH7N2bP_Cn2OCAZw$1SMEMT-pKG35i6xKtIWfPHQIozpqDJGJGz4sti4u4nE3d-5jrO3zqsoepoNTNyprpBgB6THPMAID_nUwhoAxoQ',
        'customer',
        '2026-07-28 14:05:00+00',
        '2026-07-28 14:05:00+00'
    ),
    (
        'Casey Demo Admin',
        'casey.admin@example.test',
        'scrypt$v1$N=16384,r=8,p=1$HihN1jt0iLhkN9tdvbju5g$J9GZLeQPAF6HPSPNFBXZACN9vozXqvl5wwY6fHJD_D0RvYtw7rbwZSWrhKpW5Me831vcv1CWbk-HOVDi8EO1Mg',
        'admin',
        '2026-07-28 14:10:00+00',
        '2026-07-28 14:10:00+00'
    )
ON CONFLICT (lower(email)) DO NOTHING;

WITH seed_food (
    name,
    category,
    description,
    price_cents,
    is_available,
    created_at
) AS (
    VALUES
        (
            'Maple Garden Bowl',
            'Mains',
            'Roasted seasonal vegetables, quinoa, greens, and maple-tahini dressing.',
            1299,
            true,
            '2026-07-28 15:00:00+00'::timestamp with time zone
        ),
        (
            'Harbour Veggie Wrap',
            'Mains',
            'Grilled vegetables, chickpeas, lettuce, and herb spread in a soft wrap.',
            1099,
            true,
            '2026-07-28 15:01:00+00'::timestamp with time zone
        ),
        (
            'Cedar Lentil Soup',
            'Sides',
            'Red lentils, tomatoes, carrots, and mild warming spices.',
            799,
            true,
            '2026-07-28 15:02:00+00'::timestamp with time zone
        ),
        (
            'Orchard Oat Bar',
            'Desserts',
            'Baked oats with apple, cinnamon, and sunflower seeds.',
            499,
            true,
            '2026-07-28 15:03:00+00'::timestamp with time zone
        ),
        (
            'Northern Berry Fizz',
            'Drinks',
            'Sparkling water with a fictional mixed-berry cordial.',
            399,
            true,
            '2026-07-28 15:04:00+00'::timestamp with time zone
        ),
        (
            'Lakeside Apple Crumble',
            'Desserts',
            'Warm apple filling with an oat crumble topping.',
            699,
            false,
            '2026-07-28 15:05:00+00'::timestamp with time zone
        )
)
INSERT INTO food_items (
    name,
    category,
    description,
    price_cents,
    is_available,
    created_at,
    updated_at
)
SELECT
    seed_food.name,
    seed_food.category,
    seed_food.description,
    seed_food.price_cents,
    seed_food.is_available,
    seed_food.created_at,
    seed_food.created_at
FROM seed_food
WHERE NOT EXISTS (
    SELECT 1
    FROM food_items AS existing_food
    WHERE lower(existing_food.name) = lower(seed_food.name)
      AND lower(existing_food.category) = lower(seed_food.category)
);

WITH seed_orders (email, status, total_cents, created_at) AS (
    VALUES
        (
            'avery.customer@example.test',
            'completed',
            2097,
            '2026-07-29 17:30:00+00'::timestamp with time zone
        ),
        (
            'morgan.customer@example.test',
            'confirmed',
            1898,
            '2026-07-30 01:15:00+00'::timestamp with time zone
        )
)
INSERT INTO orders (
    user_id,
    status,
    total_cents,
    created_at,
    updated_at
)
SELECT
    seed_user.id,
    seed_orders.status,
    seed_orders.total_cents,
    seed_orders.created_at,
    seed_orders.created_at
FROM seed_orders
JOIN users AS seed_user
  ON seed_user.email = seed_orders.email
WHERE NOT EXISTS (
    SELECT 1
    FROM orders AS existing_order
    WHERE existing_order.user_id = seed_user.id
      AND existing_order.status = seed_orders.status
      AND existing_order.total_cents = seed_orders.total_cents
      AND existing_order.created_at = seed_orders.created_at
);

WITH seed_lines (
    email,
    order_created_at,
    food_name,
    food_category,
    quantity
) AS (
    VALUES
        (
            'avery.customer@example.test',
            '2026-07-29 17:30:00+00'::timestamp with time zone,
            'Maple Garden Bowl',
            'Mains',
            1
        ),
        (
            'avery.customer@example.test',
            '2026-07-29 17:30:00+00'::timestamp with time zone,
            'Northern Berry Fizz',
            'Drinks',
            2
        ),
        (
            'morgan.customer@example.test',
            '2026-07-30 01:15:00+00'::timestamp with time zone,
            'Harbour Veggie Wrap',
            'Mains',
            1
        ),
        (
            'morgan.customer@example.test',
            '2026-07-30 01:15:00+00'::timestamp with time zone,
            'Cedar Lentil Soup',
            'Sides',
            1
        )
)
INSERT INTO order_items (
    order_id,
    food_item_id,
    food_name_snapshot,
    unit_price_cents,
    quantity
)
SELECT
    seed_order.id,
    seed_food.id,
    seed_food.name,
    seed_food.price_cents,
    seed_lines.quantity
FROM seed_lines
JOIN users AS seed_user
  ON seed_user.email = seed_lines.email
JOIN orders AS seed_order
  ON seed_order.user_id = seed_user.id
 AND seed_order.created_at = seed_lines.order_created_at
JOIN food_items AS seed_food
  ON seed_food.name = seed_lines.food_name
 AND seed_food.category = seed_lines.food_category
ON CONFLICT (order_id, food_item_id) DO NOTHING;

WITH seeded_orders AS (
    SELECT
        seed_order.id AS order_id,
        seed_order.user_id,
        seed_order.created_at,
        count(seed_line.*)::integer AS line_item_count
    FROM orders AS seed_order
    JOIN users AS seed_user
      ON seed_user.id = seed_order.user_id
    JOIN order_items AS seed_line
      ON seed_line.order_id = seed_order.id
    WHERE seed_user.email IN (
        'avery.customer@example.test',
        'morgan.customer@example.test'
    )
      AND seed_order.created_at IN (
          '2026-07-29 17:30:00+00'::timestamp with time zone,
          '2026-07-30 01:15:00+00'::timestamp with time zone
      )
    GROUP BY seed_order.id
)
INSERT INTO audit_logs (
    actor_user_id,
    action,
    entity_type,
    entity_id,
    result,
    details,
    created_at
)
SELECT
    seeded_orders.user_id,
    'order_created',
    'order',
    seeded_orders.order_id,
    'success',
    jsonb_build_object(
        'source',
        'fictional_seed',
        'line_item_count',
        seeded_orders.line_item_count
    ),
    seeded_orders.created_at + interval '1 second'
FROM seeded_orders
WHERE NOT EXISTS (
    SELECT 1
    FROM audit_logs AS existing_audit
    WHERE existing_audit.action = 'order_created'
      AND existing_audit.entity_type = 'order'
      AND existing_audit.entity_id = seeded_orders.order_id
      AND existing_audit.result = 'success'
      AND existing_audit.details @> '{"source": "fictional_seed"}'::jsonb
);

COMMIT;
