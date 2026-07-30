BEGIN;

CREATE TABLE IF NOT EXISTS users (
    id bigint GENERATED ALWAYS AS IDENTITY,
    name varchar(100) NOT NULL,
    email varchar(254) NOT NULL,
    password_hash text NOT NULL,
    role varchar(20) NOT NULL DEFAULT 'customer',
    failed_login_count integer NOT NULL DEFAULT 0,
    locked_until timestamp with time zone,
    created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    disabled_at timestamp with time zone,
    CONSTRAINT users_primary_key PRIMARY KEY (id),
    CONSTRAINT users_name_trimmed_check
        CHECK (name = btrim(name)),
    CONSTRAINT users_name_length_check
        CHECK (char_length(name) BETWEEN 1 AND 100),
    CONSTRAINT users_email_normalized_check
        CHECK (email = lower(btrim(email))),
    CONSTRAINT users_email_length_check
        CHECK (char_length(email) BETWEEN 3 AND 254),
    CONSTRAINT users_password_hash_length_check
        CHECK (char_length(password_hash) BETWEEN 32 AND 1024),
    CONSTRAINT users_role_check
        CHECK (role IN ('customer', 'admin')),
    CONSTRAINT users_failed_login_count_check
        CHECK (failed_login_count >= 0),
    CONSTRAINT users_updated_at_check
        CHECK (updated_at >= created_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_unique
    ON users (lower(email));

CREATE TABLE IF NOT EXISTS food_items (
    id bigint GENERATED ALWAYS AS IDENTITY,
    name varchar(120) NOT NULL,
    category varchar(80) NOT NULL,
    description text NOT NULL,
    price_cents integer NOT NULL,
    is_available boolean NOT NULL DEFAULT true,
    created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT food_items_primary_key PRIMARY KEY (id),
    CONSTRAINT food_items_name_trimmed_check
        CHECK (name = btrim(name)),
    CONSTRAINT food_items_name_length_check
        CHECK (char_length(name) BETWEEN 1 AND 120),
    CONSTRAINT food_items_category_trimmed_check
        CHECK (category = btrim(category)),
    CONSTRAINT food_items_category_length_check
        CHECK (char_length(category) BETWEEN 1 AND 80),
    CONSTRAINT food_items_description_length_check
        CHECK (char_length(description) <= 2000),
    CONSTRAINT food_items_price_cents_check
        CHECK (price_cents >= 0),
    CONSTRAINT food_items_updated_at_check
        CHECK (updated_at >= created_at)
);

CREATE INDEX IF NOT EXISTS food_items_menu_browse_index
    ON food_items (is_available, category, name);

CREATE INDEX IF NOT EXISTS food_items_name_lower_index
    ON food_items (lower(name));

CREATE INDEX IF NOT EXISTS food_items_category_lower_index
    ON food_items (lower(category));

CREATE TABLE IF NOT EXISTS orders (
    id bigint GENERATED ALWAYS AS IDENTITY,
    user_id bigint NOT NULL,
    status varchar(20) NOT NULL DEFAULT 'confirmed',
    total_cents integer NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT orders_primary_key PRIMARY KEY (id),
    CONSTRAINT orders_user_foreign_key
        FOREIGN KEY (user_id)
        REFERENCES users (id)
        ON DELETE RESTRICT,
    CONSTRAINT orders_status_check
        CHECK (status IN ('confirmed', 'preparing', 'completed', 'cancelled')),
    CONSTRAINT orders_total_cents_check
        CHECK (total_cents >= 0),
    CONSTRAINT orders_updated_at_check
        CHECK (updated_at >= created_at)
);

CREATE INDEX IF NOT EXISTS orders_user_history_index
    ON orders (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS orders_status_review_index
    ON orders (status, created_at DESC);

CREATE TABLE IF NOT EXISTS order_items (
    order_id bigint NOT NULL,
    food_item_id bigint NOT NULL,
    food_name_snapshot varchar(120) NOT NULL,
    unit_price_cents integer NOT NULL,
    quantity integer NOT NULL,
    CONSTRAINT order_items_primary_key
        PRIMARY KEY (order_id, food_item_id),
    CONSTRAINT order_items_order_foreign_key
        FOREIGN KEY (order_id)
        REFERENCES orders (id)
        ON DELETE CASCADE,
    CONSTRAINT order_items_food_item_foreign_key
        FOREIGN KEY (food_item_id)
        REFERENCES food_items (id)
        ON DELETE RESTRICT,
    CONSTRAINT order_items_food_name_snapshot_trimmed_check
        CHECK (food_name_snapshot = btrim(food_name_snapshot)),
    CONSTRAINT order_items_food_name_snapshot_length_check
        CHECK (char_length(food_name_snapshot) BETWEEN 1 AND 120),
    CONSTRAINT order_items_unit_price_cents_check
        CHECK (unit_price_cents >= 0),
    CONSTRAINT order_items_quantity_check
        CHECK (quantity BETWEEN 1 AND 99)
);

CREATE INDEX IF NOT EXISTS order_items_food_item_index
    ON order_items (food_item_id);

CREATE TABLE IF NOT EXISTS audit_logs (
    id bigint GENERATED ALWAYS AS IDENTITY,
    actor_user_id bigint,
    action varchar(100) NOT NULL,
    entity_type varchar(80) NOT NULL,
    entity_id bigint,
    result varchar(20) NOT NULL,
    details jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT audit_logs_primary_key PRIMARY KEY (id),
    CONSTRAINT audit_logs_actor_user_foreign_key
        FOREIGN KEY (actor_user_id)
        REFERENCES users (id)
        ON DELETE SET NULL,
    CONSTRAINT audit_logs_action_trimmed_check
        CHECK (action = btrim(action)),
    CONSTRAINT audit_logs_action_length_check
        CHECK (char_length(action) BETWEEN 1 AND 100),
    CONSTRAINT audit_logs_entity_type_trimmed_check
        CHECK (entity_type = btrim(entity_type)),
    CONSTRAINT audit_logs_entity_type_length_check
        CHECK (char_length(entity_type) BETWEEN 1 AND 80),
    CONSTRAINT audit_logs_entity_id_check
        CHECK (entity_id IS NULL OR entity_id > 0),
    CONSTRAINT audit_logs_result_check
        CHECK (result IN ('success', 'failure', 'denied')),
    CONSTRAINT audit_logs_details_object_check
        CHECK (jsonb_typeof(details) = 'object'),
    CONSTRAINT audit_logs_details_size_check
        CHECK (octet_length(details::text) <= 8192)
);

CREATE INDEX IF NOT EXISTS audit_logs_actor_history_index
    ON audit_logs (actor_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS audit_logs_action_history_index
    ON audit_logs (action, created_at DESC);

CREATE INDEX IF NOT EXISTS audit_logs_entity_history_index
    ON audit_logs (entity_type, entity_id, created_at DESC);

COMMIT;
