-- Least-Privilege PostgreSQL Role Setup
-- Repeatable script for creating database roles with restricted runtime permissions.
--
-- Roles:
-- 1. Schema Owner / Migration Role (food_ordering_migrator):
--    Owns the schema and has full DDL rights (CREATE, ALTER, DROP) for running migrations.
-- 2. Application Runtime Role (food_ordering_app):
--    Restricted runtime role. Grants only SELECT, INSERT, UPDATE, DELETE on tables,
--    and USAGE, SELECT, UPDATE on sequences. NO DDL, drop, or superuser permissions.
-- 3. Backup / Export Role (food_ordering_backup):
--    Read-only role for automated pg_dump backups (SELECT on tables and sequences only).

BEGIN;

-- Create Roles if they do not exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'food_ordering_migrator') THEN
        CREATE ROLE food_ordering_migrator WITH LOGIN PASSWORD 'replace_with_local_migration_password';
    END IF;
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'food_ordering_app') THEN
        CREATE ROLE food_ordering_app WITH LOGIN PASSWORD 'replace_with_local_database_password';
    END IF;
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'food_ordering_backup') THEN
        CREATE ROLE food_ordering_backup WITH LOGIN PASSWORD 'replace_with_local_backup_password';
    END IF;
END
$$;

-- Grant Schema Usage
GRANT USAGE ON SCHEMA public TO food_ordering_migrator;
GRANT USAGE ON SCHEMA public TO food_ordering_app;
GRANT USAGE ON SCHEMA public TO food_ordering_backup;

-- Migration Role: Full DDL and DML permissions on public schema
GRANT ALL PRIVILEGES ON SCHEMA public TO food_ordering_migrator;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO food_ordering_migrator;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO food_ordering_migrator;

-- Application Runtime Role: Restricted Data Access (DML only, No DDL)
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO food_ordering_app;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO food_ordering_app;

-- Revoke dangerous schema-level creation/alter permissions from runtime role
REVOKE CREATE ON SCHEMA public FROM food_ordering_app;
REVOKE CREATE ON SCHEMA public FROM food_ordering_backup;

-- Backup Role: Read-only access for backups
GRANT SELECT ON ALL TABLES IN SCHEMA public TO food_ordering_backup;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO food_ordering_backup;

-- Set default privileges for future tables created by food_ordering_migrator
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO food_ordering_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO food_ordering_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO food_ordering_backup;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO food_ordering_backup;

COMMIT;
