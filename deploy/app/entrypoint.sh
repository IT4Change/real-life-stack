#!/bin/sh
# Erzeugt /app/config.json aus den Umgebungsvariablen des Containers.
#
# Spec 11: Was sich pro Instanz unterscheidet, wird zur Laufzeit gelesen.
# Dieses Skript ist die Bruecke zwischen `docker run -e …` und der Datei, die
# die App vor dem ersten Render laedt.
#
# Bewusst ohne node/jq: das Laufzeit-Image ist nginx-alpine und soll es
# bleiben. Alles hier ist POSIX-sh.
#
# Bringt der Betreiber eine eigene config.json mit (nach /srv/branding/),
# hat sie Vorrang und wird unveraendert uebernommen.

set -eu

TARGET=/usr/share/nginx/html/app/config.json
BRANDING=/srv/branding

if [ -f "$BRANDING/config.json" ]; then
  cp "$BRANDING/config.json" "$TARGET"
  echo "[rls] Eigene config.json uebernommen."
  exit 0
fi

# Werte kommen aus der Umgebung und landen in JSON: Backslash und
# Anfuehrungszeichen maskieren, Steuerzeichen entfernen. Ohne das kann ein
# Wert die Datei zerbrechen.
esc() {
  printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' -e 's/[[:cntrl:]]//g'
}

# Sammelt Zeilen und schneidet am Ende das letzte Komma ab — so entsteht
# gueltiges JSON, ohne dass ein Platzhalterfeld noetig waere.
BUF=$(mktemp)
trap 'rm -f "$BUF"' EXIT

emit_field() {
  [ -n "${2:-}" ] || return 0
  printf '      "%s": "%s",\n' "$1" "$(esc "$2")" >> "$BUF"
}

# --- endpoints ---
: > "$BUF"
emit_field relayUrl "${RLS_RELAY_URL:-}"
emit_field profilesUrl "${RLS_PROFILES_URL:-}"
emit_field supabaseUrl "${RLS_SUPABASE_URL:-}"
emit_field supabaseAnonKey "${RLS_SUPABASE_ANON_KEY:-}"
ENDPOINTS=$(sed -e '$ s/,$//' "$BUF")

# --- branding ---
: > "$BUF"
emit_field appName "${RLS_APP_NAME:-}"
emit_field faviconUrl "${RLS_FAVICON_URL:-}"

# Farben sind ein Objekt und gehoeren nicht in eine Umgebungsvariable. Sie
# werden NICHT hier eingebettet, sondern nur referenziert: Die App laedt die
# Datei getrennt, damit ein Fehler darin nur die Farben kostet statt die
# ganze Konfiguration unlesbar zu machen. (Review #276)
if [ -f "$BRANDING/theme.json" ]; then
  printf '      "colorsUrl": "/branding/theme.json"\n' >> "$BUF"
else
  sed -i -e '$ s/,$//' "$BUF"
fi
BRAND=$(cat "$BUF")

{
  echo '{'
  printf '  "endpoints": {\n%s\n  }' "$ENDPOINTS"
  if [ -n "${RLS_DEFAULT_CONNECTOR:-}" ]; then
    printf ',\n  "defaultConnector": "%s"' "$(esc "$RLS_DEFAULT_CONNECTOR")"
  fi
  if [ -n "$BRAND" ]; then
    printf ',\n  "branding": {\n%s\n  }' "$BRAND"
  fi
  printf '\n}\n'
} > "$TARGET"

echo "[rls] config.json erzeugt fuer ${RLS_APP_NAME:-<ohne Namen>} (Relay: ${RLS_RELAY_URL:-Standard})."
