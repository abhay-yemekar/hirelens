-- Runs on first initialization of the CI Postgres service container.
-- Mirrors docker/init/01-extensions.sql for the local compose stack.
CREATE EXTENSION IF NOT EXISTS vector;
