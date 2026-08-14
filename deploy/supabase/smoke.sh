#!/bin/sh
# End-to-end smoke of the RLS boundary through Kong. ASSERTS every
# expectation — broken RLS exits non-zero instead of printing green-looking
# logs. Runs on the server (needs the supabase docker network + .env).
set -eu
cd "$(dirname "$0")"
ANON=$(grep ^ANON_KEY= .env | cut -d= -f2)
curl() { docker run --rm --network supabase curlimages/curl:8.10.1 -s "$@"; }

fail() { echo "SMOKE FAIL: $1" >&2; exit 1; }
assert_eq() { [ "$1" = "$2" ] || fail "$3 (erwartet $2, bekam $1)"; }

RESP=$(curl -X POST http://supabase-kong:8000/auth/v1/signup -H "apikey: $ANON" -H "Content-Type: application/json" -d "{}")
TOKEN=$(echo "$RESP" | sed -n "s/.*\"access_token\":\"\([^\"]*\)\".*/\1/p")
SUB=$(echo "$RESP" | sed -n "s/.*\"id\":\"\([a-f0-9-]\{36\}\)\".*/\1/p" | head -1)
[ -n "$TOKEN" ] || fail "kein Token vom anonymen Signup"
echo "anon user: $SUB"

CODE=$(curl -o /dev/null -w "%{http_code}" -X POST http://supabase-kong:8000/rest/v1/items \
  -H "apikey: $ANON" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"id\":\"smoke-own-$$\",\"type\":\"note\",\"created_by\":\"$SUB\",\"data\":{\"title\":\"smoke\"}}")
assert_eq "$CODE" "201" "Insert mit eigenem created_by"
echo "ok: eigener Insert 201"

CODE=$(curl -o /dev/null -w "%{http_code}" -X POST http://supabase-kong:8000/rest/v1/items \
  -H "apikey: $ANON" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"id\":\"smoke-forge-$$\",\"type\":\"note\",\"created_by\":\"user-mallory\",\"data\":{}}")
assert_eq "$CODE" "403" "Insert mit fremdem created_by muss an RLS scheitern"
echo "ok: Fremd-Insert 403"

BODY=$(curl "http://supabase-kong:8000/rest/v1/items?select=id,created_by&id=eq.smoke-own-$$" \
  -H "apikey: $ANON" -H "Authorization: Bearer $TOKEN")
echo "$BODY" | grep -q "smoke-own-$$" || fail "eigene Row nicht lesbar: $BODY"
echo "ok: Select findet eigene Row"

CODE=$(curl -o /dev/null -w "%{http_code}" -X PATCH "http://supabase-kong:8000/rest/v1/items?id=eq.smoke-own-$$" \
  -H "apikey: $ANON" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"created_by\":\"user-mallory\"}")
assert_eq "$CODE" "400" "created_by-Update muss am Immutability-Trigger scheitern"
echo "ok: Update-Forge 400"

CODE=$(curl -o /dev/null -w "%{http_code}" http://supabase-kong:8000/rest/v1/items)
assert_eq "$CODE" "401" "Request ohne apikey muss 401 sein"
echo "ok: ohne apikey 401"

BODY=$(curl -H "Authorization: Bearer $ANON" http://realtime-dev.supabase-realtime:4000/api/tenants/realtime-dev/health)
echo "$BODY" | grep -q '"healthy":true' || fail "Realtime-Tenant nicht healthy: $BODY"
echo "ok: Realtime healthy"

# Struktur-Assertion: keine DML-Default-Privilegien fuer die App-Rollen.
# Default-Privilegien vergeben Rechte an JEDE kuenftig angelegte Tabelle,
# waehrend RLS sich NICHT automatisch aktiviert — eine neue Tabelle waere bis
# zur manuellen Haertung offen. Rechte gehoeren zusammen mit Tabelle, RLS und
# Policies vergeben (rls#273). Von den Fehlerarten ist "permission denied"
# die richtige, nicht "still lesbar".
#
# Geprueft wird gezielt der Default fuer die Rolle `postgres` — unter ihr
# laufen die Migrationen, ihre Defaults gelten also fuer unsere Tabellen. Der
# Eintrag von `supabase_admin` ist Plattform-Verhalten und nicht unserer.
# Ebenso ignoriert: Dxtm (truncate/references/trigger/maintain) — harmlos,
# es geht um a/r/w/d.
DEFACL=$(docker exec supabase-db psql -U postgres -d postgres -tAc \
  "select coalesce(string_agg(x, ', '), '') from (
     select unnest(defaclacl)::text x from pg_default_acl d
       join pg_namespace n on n.oid = d.defaclnamespace
      where n.nspname = 'public' and d.defaclobjtype = 'r'
        and d.defaclrole = 'postgres'::regrole
   ) t where x ~ '^(anon|authenticated|service_role)=[arwd]'")
assert_eq "$DEFACL" "" "keine DML-Default-Privilegien auf public-Tabellen erwartet"
echo "ok: keine DML-Default-Privilegien"

echo "SMOKE PASS: alle Assertions grün"
