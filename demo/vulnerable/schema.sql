BEGIN;

CREATE TABLE IF NOT EXISTS vulnerable_demo_environment (
    singleton boolean PRIMARY KEY DEFAULT true,
    data_classification varchar(32) NOT NULL,
    environment_marker varchar(64) NOT NULL,
    initialized_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT vulnerable_demo_singleton_check CHECK (singleton = true),
    CONSTRAINT vulnerable_demo_data_check
        CHECK (data_classification = 'fictional-only'),
    CONSTRAINT vulnerable_demo_marker_check
        CHECK (environment_marker = 'isolated-vulnerable-demo')
);

CREATE TABLE IF NOT EXISTS vulnerable_demo_users (
    id integer PRIMARY KEY,
    name varchar(100) NOT NULL,
    email varchar(254) NOT NULL UNIQUE,
    password_hash text NOT NULL,
    role varchar(20) NOT NULL,
    CONSTRAINT vulnerable_demo_user_email_check
        CHECK (email = lower(btrim(email)) AND email LIKE '%@vulnerable-demo.test'),
    CONSTRAINT vulnerable_demo_user_role_check
        CHECK (role IN ('customer', 'admin'))
);

CREATE TABLE IF NOT EXISTS vulnerable_demo_foods (
    id integer PRIMARY KEY,
    name varchar(120) NOT NULL,
    category varchar(80) NOT NULL,
    description text NOT NULL,
    price_cents integer NOT NULL,
    CONSTRAINT vulnerable_demo_food_price_check CHECK (price_cents >= 0)
);

CREATE TABLE IF NOT EXISTS vulnerable_demo_orders (
    id integer PRIMARY KEY,
    user_id integer NOT NULL,
    status varchar(20) NOT NULL,
    total_cents integer NOT NULL,
    CONSTRAINT vulnerable_demo_order_user_foreign_key
        FOREIGN KEY (user_id)
        REFERENCES vulnerable_demo_users (id)
        ON DELETE RESTRICT,
    CONSTRAINT vulnerable_demo_order_status_check
        CHECK (status IN ('confirmed', 'preparing', 'completed', 'cancelled')),
    CONSTRAINT vulnerable_demo_order_total_check CHECK (total_cents >= 0)
);

CREATE TABLE IF NOT EXISTS vulnerable_demo_order_items (
    order_id integer NOT NULL,
    food_id integer NOT NULL,
    food_name_snapshot varchar(120) NOT NULL,
    unit_price_cents integer NOT NULL,
    quantity integer NOT NULL,
    CONSTRAINT vulnerable_demo_order_item_primary_key
        PRIMARY KEY (order_id, food_id),
    CONSTRAINT vulnerable_demo_order_item_order_foreign_key
        FOREIGN KEY (order_id)
        REFERENCES vulnerable_demo_orders (id)
        ON DELETE CASCADE,
    CONSTRAINT vulnerable_demo_order_item_food_foreign_key
        FOREIGN KEY (food_id)
        REFERENCES vulnerable_demo_foods (id)
        ON DELETE RESTRICT,
    CONSTRAINT vulnerable_demo_order_item_price_check
        CHECK (unit_price_cents >= 0),
    CONSTRAINT vulnerable_demo_order_item_quantity_check
        CHECK (quantity BETWEEN 1 AND 99)
);

COMMIT;
