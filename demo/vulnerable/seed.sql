BEGIN;

INSERT INTO vulnerable_demo_environment (
    singleton,
    data_classification,
    environment_marker
)
VALUES (
    true,
    'fictional-only',
    'isolated-vulnerable-demo'
)
ON CONFLICT (singleton) DO UPDATE
SET
    data_classification = EXCLUDED.data_classification,
    environment_marker = EXCLUDED.environment_marker;

INSERT INTO vulnerable_demo_users (
    id,
    name,
    email,
    password_hash,
    role
)
VALUES
    (
        1,
        'Fictional Demo Customer',
        'customer@vulnerable-demo.test',
        'scrypt$v1$N=16384,r=8,p=1$rmhPQeXwuZz8G4r5iSpr2g$jvtTYMl6Z_IefJ6rf01ICOyWe7-a-tWQbnNFrNckA6R4gldPG-yR1nn1nVoXmbjHLzliG2z__xVpfRKJZ6AYgQ',
        'customer'
    ),
    (
        2,
        'Fictional Demo Administrator',
        'admin@vulnerable-demo.test',
        'scrypt$v1$N=16384,r=8,p=1$vAjk9eevcQH_aLeMCA6ELQ$-PS7TzybQBrBfbfjJM_MERP7pk2L4phRGtgjBEFyUPbWQS8LUwgZJigwHr50Jn0ivQu1AfnJTBrOFOKAIVWXjw',
        'admin'
    )
ON CONFLICT (id) DO UPDATE
SET
    name = EXCLUDED.name,
    email = EXCLUDED.email,
    password_hash = EXCLUDED.password_hash,
    role = EXCLUDED.role;

INSERT INTO vulnerable_demo_foods (
    id,
    name,
    category,
    description,
    price_cents
)
VALUES
    (
        101,
        'Classroom Veggie Wrap',
        'Demo Lunch',
        'A fictional wrap used only in the isolated classroom demo.',
        1099
    ),
    (
        102,
        'Training Berry Bowl',
        'Demo Breakfast',
        'A fictional breakfast bowl with no real customer association.',
        875
    ),
    (
        103,
        'Sample Citrus Water',
        'Demo Drinks',
        'A fictional beverage used only for demonstration data.',
        325
    )
ON CONFLICT (id) DO UPDATE
SET
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    description = EXCLUDED.description,
    price_cents = EXCLUDED.price_cents;

INSERT INTO vulnerable_demo_orders (
    id,
    user_id,
    status,
    total_cents
)
VALUES (
    1001,
    1,
    'confirmed',
    2198
)
ON CONFLICT (id) DO UPDATE
SET
    user_id = EXCLUDED.user_id,
    status = EXCLUDED.status,
    total_cents = EXCLUDED.total_cents;

INSERT INTO vulnerable_demo_order_items (
    order_id,
    food_id,
    food_name_snapshot,
    unit_price_cents,
    quantity
)
VALUES (
    1001,
    101,
    'Classroom Veggie Wrap',
    1099,
    2
)
ON CONFLICT (order_id, food_id) DO UPDATE
SET
    food_name_snapshot = EXCLUDED.food_name_snapshot,
    unit_price_cents = EXCLUDED.unit_price_cents,
    quantity = EXCLUDED.quantity;

COMMIT;
