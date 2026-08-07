BEGIN;

DELETE FROM vulnerable_demo_order_items;
DELETE FROM vulnerable_demo_orders;
DELETE FROM vulnerable_demo_foods;
DELETE FROM vulnerable_demo_users;

COMMIT;
