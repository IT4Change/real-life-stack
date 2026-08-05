#!/bin/sh
# Generates .env with fresh secrets for the Supabase stack (runs ON the
# server, in ~/apps/supabase/). Idempotent: refuses to overwrite an existing
# .env — a regenerated JWT_SECRET would invalidate every issued key/session.
#
# Also (idempotently) connects Traefik to the `supabase` network so the
# Kong routing labels take effect.
#
# Output: only the ANON key (public by design — it ships in every frontend
# bundle). SERVICE_ROLE_KEY / JWT_SECRET / POSTGRES_PASSWORD stay in .env
# (chmod 600).
set -eu
cd "$(dirname "$0")"

if [ -f .env ]; then
  echo ".env existiert bereits — nichts überschrieben." >&2
  echo "Zum Rotieren: .env löschen (macht alle Keys/Sessions ungültig!) und neu ausführen." >&2
else
  # Everything random comes from the node container (NixOS root has no
  # guaranteed openssl): 4 secrets + 2 HS256-JWTs (anon/service_role,
  # 20 years — like the demo keys `supabase start` prints).
  KEYS=$(docker run --rm node:20-alpine node -e '
    const crypto = require("crypto");
    const hex = (n) => crypto.randomBytes(n).toString("hex");
    const jwtSecret = hex(32);
    const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");
    const header = b64({ alg: "HS256", typ: "JWT" });
    const iat = Math.floor(Date.now() / 1000);
    const exp = iat + 20 * 365 * 24 * 3600;
    const sign = (role) => {
      const payload = b64({ role, iss: "supabase", iat, exp });
      const sig = crypto.createHmac("sha256", jwtSecret)
        .update(`${header}.${payload}`).digest("base64url");
      return `${header}.${payload}.${sig}`;
    };
    console.log(hex(24));          // POSTGRES_PASSWORD
    console.log(jwtSecret);        // JWT_SECRET
    console.log(hex(8));           // REALTIME_DB_ENC_KEY (16 chars)
    console.log(hex(32));          // SECRET_KEY_BASE
    console.log(sign("anon"));
    console.log(sign("service_role"));
  ')
  POSTGRES_PASSWORD=$(echo "$KEYS" | sed -n 1p)
  JWT_SECRET=$(echo "$KEYS" | sed -n 2p)
  REALTIME_DB_ENC_KEY=$(echo "$KEYS" | sed -n 3p)
  SECRET_KEY_BASE=$(echo "$KEYS" | sed -n 4p)
  ANON_KEY=$(echo "$KEYS" | sed -n 5p)
  SERVICE_ROLE_KEY=$(echo "$KEYS" | sed -n 6p)

  umask 077
  cat > .env <<EOF
POSTGRES_PASSWORD=$POSTGRES_PASSWORD
JWT_SECRET=$JWT_SECRET
JWT_EXPIRY=3600
ANON_KEY=$ANON_KEY
SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY
REALTIME_DB_ENC_KEY=$REALTIME_DB_ENC_KEY
SECRET_KEY_BASE=$SECRET_KEY_BASE
API_EXTERNAL_URL=https://supabase.real-life-stack.de
SITE_URL=http://localhost:5173
ADDITIONAL_REDIRECT_URLS=
EOF
  echo ".env geschrieben (chmod 600)."
fi

# Traefik ans supabase-Netz (idempotent; Netz entsteht spätestens beim up).
docker network inspect supabase >/dev/null 2>&1 || docker network create supabase
if docker inspect traefik --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}' | grep -qw supabase; then
  echo "Traefik ist bereits mit dem supabase-Netz verbunden."
else
  docker network connect supabase traefik
  echo "Traefik mit dem supabase-Netz verbunden."
fi

echo
echo "ANON_KEY (public, für VITE_SUPABASE_ANON_KEY):"
grep '^ANON_KEY=' .env | cut -d= -f2
