-- =============================================================================
-- PostgreSQL Initialization Script
-- =============================================================================
-- Runs on first database creation
-- =============================================================================

-- Enable useful extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";      -- For text similarity/search

-- Optional: For full-text search on project names, asset descriptions
-- CREATE EXTENSION IF NOT EXISTS "unaccent";

-- Set default timezone
SET timezone = 'UTC';

-- Log completion
DO $$
BEGIN
    RAISE NOTICE 'Database initialization complete';
END $$;
