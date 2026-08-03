#!/usr/bin/env bash
# Offline-Tests fuer die Sicherheitsgrenzen von bootstrap-npm-publish.sh (#205).
#
# WARUM: Das Skript kann einen IRREVERSIBLEN npm-Publish ausloesen. Zwei seiner
# Schutzwaelle waren im Review als Blocker aufgefallen (ein Vertipper wie
# --dry-rnu publizierte scharf; ein fremdes .tgz aus einem geteilten /tmp konnte
# unter unserem Scope landen). Beide sind gefixt — aber von Hand nachgewiesen,
# und von Hand heisst: beim naechsten Umbau prueft sie niemand mehr.
#
# Diese Tests laufen OHNE Netz und ohne npm-Konto: `npm` und `pnpm` werden durch
# Stubs auf dem PATH ersetzt, die ihre Aufrufe protokollieren. Geprueft wird nicht
# nur der Exit-Code, sondern vor allem: WURDE publish aufgerufen — und womit.
#
# Aufruf:  scripts/release/bootstrap-npm-publish.test.sh
set -euo pipefail

SCRIPT_UNDER_TEST="$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")/bootstrap-npm-publish.sh"
PACKAGES=(data-interface toolkit mock-connector local-connector graphql-connector wot-connector)
SCOPE=@real-life-stack
VERSION=0.1.0

TOTAL=0; PASS=0; FAIL=0
ok()   { TOTAL=$((TOTAL+1)); PASS=$((PASS+1)); echo "  ok   $1"; }
bad()  { TOTAL=$((TOTAL+1)); FAIL=$((FAIL+1)); echo "  FAIL $1"; }
# EIN Eltern-Verzeichnis fuer alle Fixtures. Bewusst nicht "jedes Verzeichnis in
# ein Array sammeln": make_env wird als `root=$(make_env …)` aufgerufen, laeuft
# also in einer Subshell — ein dort gefuelltes Array kaeme im Elternprozess nie an
# (die Fixtures blieben liegen, und der EXIT-Trap endete mit Status 1, was den
# ganzen Testlauf rot gemacht haette, obwohl alle Faelle bestanden).
WORKDIR=$(mktemp -d)
trap 'rm -rf "$WORKDIR"' EXIT

# --------------------------------------------------------------- Umgebung bauen
# Fixture-Repo + Stubs. STUB_MODE steuert, was `pnpm pack` erzeugt:
#   correct  → Tarball mit dem erwarteten Namen/Version
#   foreign  → Tarball eines FREMDEN Pakets (der /tmp-Angriff)
#   mismatch → richtiger Name, falsche Version
#   two      → zwei Tarballs (mehrdeutig)
#   none     → gar keiner
make_env() {
  local mode="$1"
  local root; root=$(mktemp -d "$WORKDIR/env-XXXXXX")
  mkdir -p "$root/repo/scripts/release" "$root/bin"
  cp "$SCRIPT_UNDER_TEST" "$root/repo/scripts/release/bootstrap-npm-publish.sh"
  for p in "${PACKAGES[@]}"; do
    mkdir -p "$root/repo/packages/$p"
    printf '{"name":"%s/%s","version":"%s"}\n' "$SCOPE" "$p" "$VERSION" \
      > "$root/repo/packages/$p/package.json"
  done

  # npm-Stub: whoami ok, view meldet E404 (Paket fehlt → wuerde publizieren),
  # publish wird nur protokolliert.
  cat > "$root/bin/npm" <<STUB
#!/usr/bin/env bash
echo "npm \$*" >> "$root/calls.log"
case "\$1" in
  whoami)  echo testuser; exit 0 ;;
  view)    echo "npm error code E404" >&2; exit 1 ;;
  publish) exit 0 ;;
  *)       exit 0 ;;
esac
STUB

  # pnpm-Stub: install/build ok; pack erzeugt je nach Modus.
  cat > "$root/bin/pnpm" <<STUB
#!/usr/bin/env bash
echo "pnpm \$*" >> "$root/calls.log"
dest=""; prev=""
for a in "\$@"; do
  [ "\$prev" = "--pack-destination" ] && dest="\$a"
  prev="\$a"
done
[ -n "\$dest" ] || exit 0     # install/build
mkdir -p "\$dest"
mk() {  # \$1=name \$2=version \$3=datei
  local t; t=\$(mktemp -d); mkdir -p "\$t/package"
  printf '{"name":"%s","version":"%s"}\n' "\$1" "\$2" > "\$t/package/package.json"
  ( cd "\$t" && tar -czf "\$3" package )
  rm -rf "\$t"
}
# Welches Paket ist gemeint? -C <dir> steht in den Argumenten.
pkgdir=""; prev=""
for a in "\$@"; do [ "\$prev" = "-C" ] && pkgdir="\$a"; prev="\$a"; done
pname=\$(node -p "require('\$PWD/\$pkgdir/package.json').name")
case "$mode" in
  correct)  mk "\$pname" "$VERSION" "\$dest/ok.tgz" ;;
  foreign)  mk "@boese/fremd" "9.9.9" "\$dest/fremd.tgz" ;;
  mismatch) mk "\$pname" "9.9.9" "\$dest/mismatch.tgz" ;;
  two)      mk "\$pname" "$VERSION" "\$dest/a.tgz"; mk "\$pname" "$VERSION" "\$dest/b.tgz" ;;
  none)     : ;;
esac
exit 0
STUB
  chmod +x "$root/bin/npm" "$root/bin/pnpm"
  : > "$root/calls.log"
  echo "$root"
}

# run <root> [args...] → setzt RC, LOG, OUT und TMPLEFT
# TMPDIR wird auf ein leeres, kontrolliertes Verzeichnis gesetzt: `mktemp` im
# Skript legt sein Tarball-Verzeichnis dort an, also laesst sich hinterher
# nachweisen, dass es wieder aufgeraeumt wurde (Cleanup-Trap).
run() {
  local root="$1"; shift
  rm -rf "$root/tmp"; mkdir -p "$root/tmp"
  set +e
  ( cd "$root/repo" && PATH="$root/bin:$PATH" TMPDIR="$root/tmp" \
      ./scripts/release/bootstrap-npm-publish.sh "$@" >"$root/out.txt" 2>&1 )
  RC=$?
  set -e
  LOG=$(cat "$root/calls.log")
  OUT=$(cat "$root/out.txt")
  TMPLEFT=$(find "$root/tmp" -mindepth 1 | wc -l)
}
published_count() { printf '%s\n' "$LOG" | grep -c '^npm publish' || true; }
# Alle externen Aufrufe (npm UND pnpm) — fuer "Abbruch VOR Nebenwirkungen".
call_count() { [ -z "$LOG" ] && echo 0 || printf '%s\n' "$LOG" | grep -c . ; }
# Reihenfolge der tatsaechlich publizierten Pakete, aus dem Tarball-Pfad
# (out_dir = Paketname mit / und @ ersetzt durch _).
published_order() {
  printf '%s\n' "$LOG" | grep '^npm publish' \
    | grep -oE '_real-life-stack_[a-z-]+' | sed 's/^_real-life-stack_//'
}

echo "== Argumentpruefung: nur --dry-run/--help sind erlaubt =="
# Der eigentliche Blocker: ein Vertipper darf NICHT scharf publizieren.
# Schaerfer als "hat nicht publiziert": bei unbekannten Argumenten darf ueberhaupt
# KEIN externer Befehl gelaufen sein — kein npm whoami, kein pnpm install. Sonst
# waere der Abbruch erst nach Nebenwirkungen erfolgt.
for arg in --dry-rnu --dryrun -n --force --dry-run=true; do
  root=$(make_env correct); run "$root" "$arg"
  if [ "$RC" -ne 0 ] && [ "$(call_count)" -eq 0 ]; then
    ok "'$arg' bricht VOR jedem externen Aufruf ab"
  else
    bad "'$arg' → rc=$RC, externe Aufrufe=$(call_count) (erwartet 0): $(printf '%s' "$LOG" | head -1)"
  fi
done
root=$(make_env correct); run "$root" --dry-run extra
[ "$RC" -ne 0 ] && [ "$(call_count)" -eq 0 ] \
  && ok "'--dry-run extra' bricht VOR jedem externen Aufruf ab" \
  || bad "'--dry-run extra' → rc=$RC, externe Aufrufe=$(call_count)"

echo
echo "== --dry-run publiziert nichts =="
root=$(make_env correct); run "$root" --dry-run
[ "$RC" -eq 0 ] && [ "$(published_count)" -eq 0 ] \
  && ok "--dry-run laeuft durch, publish-Aufrufe = 0" \
  || bad "--dry-run → rc=$RC, publish=$(published_count)"

echo
echo "== Tarball-Identitaet: nur das erwartete Paket wird publiziert =="
# Jeder Fehlerpfad wird DOPPELT geprueft: kein Publish UND kein Temp-Rest. Der
# Cleanup-Trap muss gerade dann greifen, wenn das Skript abbricht — im
# Erfolgsfall allein bewiese er nichts ueber den Abbruchfall.
check_abort() {  # $1=Label
  if [ "$RC" -ne 0 ] && [ "$(published_count)" -eq 0 ]; then
    ok "$1 → Abbruch, nichts publiziert"
  else
    bad "$1 → rc=$RC, publish=$(published_count)"
  fi
  [ "$TMPLEFT" -eq 0 ] \
    && ok "$1 → Temp-Verzeichnis auch im Fehlerfall aufgeraeumt" \
    || bad "$1 → Temp-Reste nach Abbruch: $TMPLEFT"
}

root=$(make_env foreign);  run "$root"; check_abort "fremdes Tarball (@boese/fremd)"
root=$(make_env mismatch); run "$root"; check_abort "falsche Version im Tarball"
root=$(make_env two);      run "$root"; check_abort "mehrdeutig (zwei Tarballs)"
root=$(make_env none);     run "$root"; check_abort "kein Tarball erzeugt"

echo
echo "== Gutfall: publiziert genau die erwarteten Pakete, mit gebundener Registry =="
root=$(make_env correct); run "$root"
if [ "$RC" -eq 0 ] && [ "$(published_count)" -eq "${#PACKAGES[@]}" ]; then
  ok "publish fuer alle ${#PACKAGES[@]} Pakete aufgerufen"
else
  bad "Gutfall → rc=$RC, publish=$(published_count) (erwartet ${#PACKAGES[@]})"
  printf '%s\n' "$OUT" | tail -5 | sed 's/^/       /'
fi
# Registry JE Publish-Aufruf, nicht "irgendwo mindestens dreimal". Ein einzelner
# Publish ohne Bindung koennte sonst in eine fremde Registry gehen.
pub_lines=$(printf '%s\n' "$LOG" | grep '^npm publish' || true)
pub_with_reg=$(printf '%s\n' "$pub_lines" | grep -c -- '--registry https://registry.npmjs.org' || true)
if [ "$(published_count)" -gt 0 ] && [ "$pub_with_reg" -eq "$(published_count)" ]; then
  ok "jeder der $(published_count) publish-Aufrufe bindet die Registry"
else
  bad "Registry nicht bei jedem publish gebunden ($pub_with_reg von $(published_count))"
fi
# whoami und view ebenfalls gegen dieselbe Registry — sonst prueft der
# Existenz-Check eine andere Registry als der Publish beschreibt.
for sub in whoami view; do
  n=$(printf '%s\n' "$LOG" | grep "^npm $sub" | grep -c -- '--registry https://registry.npmjs.org' || true)
  t=$(printf '%s\n' "$LOG" | grep -c "^npm $sub" || true)
  [ "$t" -gt 0 ] && [ "$n" -eq "$t" ] \
    && ok "npm $sub bindet die Registry ($n/$t)" \
    || bad "npm $sub ohne Registry-Bindung ($n/$t)"
done

if [ "$(published_count)" -gt 0 ] && ! printf '%s\n' "$pub_lines" | grep -qv -- '--access public'; then
  ok "publish immer mit --access public"
else
  bad "mindestens ein publish ohne --access public"
fi

# ECHTE Reihenfolge pruefen (die alte Fassung verglich nichts — sie war immer
# wahr). Die publizierten Pakete muessen exakt der Abhaengigkeitsliste folgen:
# data-interface zuerst, wot-connector zuletzt (haengt an data-interface + toolkit).
actual_order=$(published_order | tr '\n' ' ' | sed 's/ *$//')
expected_order=$(printf '%s ' "${PACKAGES[@]}" | sed 's/ *$//')
if [ "$actual_order" = "$expected_order" ]; then
  ok "Publish-Reihenfolge entspricht der Abhaengigkeitsliste"
else
  bad "Publish-Reihenfolge falsch: '$actual_order' != '$expected_order'"
fi
# Zusaetzlich die inhaltliche Invariante, unabhaengig von der Listenreihenfolge.
pos() { published_order | grep -nx "$1" | cut -d: -f1 | head -1; }
di=$(pos data-interface); tk=$(pos toolkit); wc_=$(pos wot-connector)
if [ -n "$di" ] && [ -n "$tk" ] && [ -n "$wc_" ] && [ "$di" -lt "$tk" ] && [ "$tk" -lt "$wc_" ]; then
  ok "data-interface vor toolkit vor wot-connector"
else
  bad "Abhaengigkeitsreihenfolge verletzt (di=$di tk=$tk wot=$wc_)"
fi

# Der Cleanup-Trap des Skripts muss sein Tarball-Verzeichnis wieder entfernen —
# sonst blieben gepackte Artefakte im temporaeren Bereich liegen.
[ "$TMPLEFT" -eq 0 ] \
  && ok "temporaeres Tarball-Verzeichnis wurde aufgeraeumt" \
  || bad "Temp-Reste nach dem Lauf: $TMPLEFT Eintrag/Eintraege"

echo
echo "Ergebnis: $PASS/$TOTAL bestanden, $FAIL fehlgeschlagen."
[ "$FAIL" -eq 0 ] || exit 1
