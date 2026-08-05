#!/bin/sh
# Regressionstest für apply-migrations.sh — OHNE Docker/Postgres: ein
# docker-Shim zeichnet auf, was psql erreichen würde. Verankert den
# Fail-closed-Vertrag (#238 CodeRabbit): schlägt das Lesen einer
# Migrationsdatei fehl, darf psql NIE starten — insbesondere darf nie ein
# Journal-Marker ohne Schema committen.
#
# Aufruf:  sh deploy/supabase/apply-migrations.selftest.sh
set -eu
HERE=$(cd "$(dirname "$0")" && pwd)
SCRIPT="$HERE/apply-migrations.sh"

failed=0
ok()   { echo "  ok   $1"; }
fail() { echo "  FAIL $1"; failed=1; }

run_case() {
  # $1 = Fallname, $2 = setup-Funktion; Ergebnis via globalem $STATUS/$TXN_LOG.
  workdir=$(mktemp -d)
  mkdir -p "$workdir/bin" "$workdir/app/migrations"
  cp "$SCRIPT" "$workdir/app/apply-migrations.sh"
  TXN_LOG="$workdir/txn.log"
  : > "$TXN_LOG"
  # docker-Shim: beantwortet die Abfragen des Skripts; --single-transaction-
  # Aufrufe schreiben ihr stdin ins Log (das wäre der echte Schema-Commit).
  cat > "$workdir/bin/docker" <<SHIM
#!/bin/sh
case "\$*" in
  *"--single-transaction"*) cat >> "$TXN_LOG"; exit 0 ;;
  *"information_schema.tables"*) echo 1; exit 0 ;;
  *"select 1 from public.schema_migrations_rls"*) echo ""; exit 0 ;;
  *) exit 0 ;;
esac
SHIM
  chmod +x "$workdir/bin/docker"
  "$2" "$workdir/app/migrations"
  STATUS=0
  ( cd "$workdir/app" && PATH="$workdir/bin:$PATH" sh apply-migrations.sh ) >/dev/null 2>&1 || STATUS=$?
}

setup_valid()       { printf 'create table if not exists public.t1 (id int);\n' > "$1/0001_ok.sql"; }
setup_unreadable()  { printf 'create table x;\n' > "$1/0001_locked.sql"; chmod 000 "$1/0001_locked.sql"; }
setup_directory()   { mkdir "$1/0001_dir.sql"; }
setup_no_files()    { :; }

echo "== apply-migrations Fail-closed-Vertrag =="

run_case valid setup_valid
[ "$STATUS" -eq 0 ] || fail "gültige Migration: exit $STATUS statt 0"
grep -q "create table if not exists public.t1" "$TXN_LOG" || fail "gültige Migration: Schema fehlt im Commit"
grep -q "insert into public.schema_migrations_rls (name) values ('0001_ok.sql')" "$TXN_LOG" || fail "gültige Migration: Marker fehlt im Commit"
[ "$failed" -eq 0 ] && ok "gültige Migration: Schema + Marker in einem Commit"

run_case unreadable setup_unreadable
if [ "$STATUS" -eq 0 ]; then fail "unlesbare Datei: exit 0 statt Fehler"; else ok "unlesbare Datei → Abbruch (exit $STATUS)"; fi
if [ -s "$TXN_LOG" ]; then fail "unlesbare Datei: psql wurde trotzdem gestartet (Marker-ohne-Schema-Risiko!)"; else ok "unlesbare Datei → psql nie gestartet"; fi

run_case directory setup_directory
if [ "$STATUS" -eq 0 ]; then fail "Verzeichnis als .sql: exit 0 statt Fehler"; else ok "Verzeichnis als .sql → Abbruch (exit $STATUS)"; fi
if [ -s "$TXN_LOG" ]; then fail "Verzeichnis als .sql: psql wurde trotzdem gestartet"; else ok "Verzeichnis als .sql → psql nie gestartet"; fi

run_case no_files setup_no_files
if [ "$STATUS" -eq 0 ]; then fail "leerer migrations-Ordner: exit 0 statt Fehler (Glob-Literal)"; else ok "leerer migrations-Ordner → Abbruch (Namens-Guard fängt Glob-Literal)"; fi
if [ -s "$TXN_LOG" ]; then fail "leerer migrations-Ordner: psql wurde gestartet"; else ok "leerer migrations-Ordner → psql nie gestartet"; fi

if [ "$failed" -eq 0 ]; then
  echo "Selbsttest bestanden."
else
  echo "Selbsttest VERLETZT — der Migrationspfad ist nicht fail-closed."
  exit 1
fi
