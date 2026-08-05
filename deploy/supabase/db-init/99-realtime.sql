-- Realtime schema (from supabase/docker volumes/db/realtime.sql, owner
-- hardcoded to supabase_admin — matches DB_USER of the realtime service).
create schema if not exists _realtime;
alter schema _realtime owner to supabase_admin;
