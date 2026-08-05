#!/bin/sh
set -eu
cd "$(dirname "$0")"
ANON=$(grep ^ANON_KEY= .env | cut -d= -f2)
curl() { docker run --rm --network supabase curlimages/curl:8.10.1 -s "$@"; }

RESP=$(curl -X POST http://supabase-kong:8000/auth/v1/signup -H "apikey: $ANON" -H "Content-Type: application/json" -d "{}")
TOKEN=$(echo "$RESP" | sed -n "s/.*\"access_token\":\"\([^\"]*\)\".*/\1/p")
SUB=$(echo "$RESP" | sed -n "s/.*\"id\":\"\([a-f0-9-]\{36\}\)\".*/\1/p" | head -1)
[ -n "$TOKEN" ] || { echo "FAIL: kein Token"; exit 1; }
echo "anon user: $SUB"

echo "--- Insert mit EIGENEM created_by (muss 201 sein) ---"
curl -o /dev/null -w "%{http_code}\n" -X POST http://supabase-kong:8000/rest/v1/items \
  -H "apikey: $ANON" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"id\":\"smoke-own-$$\",\"type\":\"note\",\"created_by\":\"$SUB\",\"data\":{\"title\":\"smoke\"}}"

echo "--- Insert mit FREMDEM created_by (muss 403 RLS sein) ---"
curl -w "\n%{http_code}\n" -X POST http://supabase-kong:8000/rest/v1/items \
  -H "apikey: $ANON" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"id\":\"smoke-forge-$$\",\"type\":\"note\",\"created_by\":\"user-mallory\",\"data\":{}}" | tail -2

echo "--- Select (muss die eigene Row enthalten) ---"
curl "http://supabase-kong:8000/rest/v1/items?select=id,created_by&id=eq.smoke-own-$$" \
  -H "apikey: $ANON" -H "Authorization: Bearer $TOKEN"; echo

echo "--- created_by-Update-Forge (muss am Trigger scheitern) ---"
curl -w "\n%{http_code}\n" -X PATCH "http://supabase-kong:8000/rest/v1/items?id=eq.smoke-own-$$" \
  -H "apikey: $ANON" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"created_by\":\"user-mallory\"}" | tail -2

echo "--- Ohne apikey (muss 401 sein) ---"
curl -o /dev/null -w "%{http_code}\n" http://supabase-kong:8000/rest/v1/items

echo "--- Realtime tenant health ---"
curl -H "Authorization: Bearer $ANON" http://realtime-dev.supabase-realtime:4000/api/tenants/realtime-dev/health; echo
