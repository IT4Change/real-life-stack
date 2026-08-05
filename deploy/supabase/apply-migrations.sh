#!/bin/sh
# Applies the RLS schema migrations (supabase/migrations/*.sql, copied next
# to this script as migrations/) inside the running supabase-db container.
# Order: GoTrue must have migrated the auth schema first (our 0001 creates a
# trigger on auth.users), so run this AFTER the stack is up and healthy.
set -eu
cd "$(dirname "$0")"

if [ ! -d migrations ]; then
  echo "migrations/ fehlt — die supabase/migrations/*.sql aus dem Repo hierher kopieren." >&2
  exit 1
fi

# Wait for auth.users to exist (GoTrue migration finished).
tries=0
until docker exec supabase-db psql -U postgres -d postgres -tAc \
  "select 1 from information_schema.tables where table_schema='auth' and table_name='users'" | grep -q 1; do
  tries=$((tries + 1))
  if [ "$tries" -gt 60 ]; then
    echo "auth.users existiert nach 60 Versuchen nicht — GoTrue-Logs prüfen (docker logs supabase-auth)." >&2
    exit 1
  fi
  sleep 2
done

for file in migrations/*.sql; do
  name=$(basename "$file")
  applied=$(docker exec supabase-db psql -U postgres -d postgres -tAc \
    "select 1 from public.schema_migrations_rls where name = '$name'" 2>/dev/null || true)
  if [ "$applied" = "1" ]; then
    echo "skip  $name (bereits angewendet)"
    continue
  fi
  echo "apply $name"
  docker exec -i supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 --single-transaction < "$file"
  # Journal table: RLS on + no API grants — never reachable through PostgREST.
  docker exec supabase-db psql -U postgres -d postgres -c \
    "create table if not exists public.schema_migrations_rls (name text primary key, applied_at timestamptz not null default now());
     alter table public.schema_migrations_rls enable row level security;
     revoke all on public.schema_migrations_rls from anon, authenticated;
     insert into public.schema_migrations_rls (name) values ('$name') on conflict do nothing" >/dev/null
done

echo "Migrationen angewendet."
