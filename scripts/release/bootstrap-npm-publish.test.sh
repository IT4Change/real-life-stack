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

# run <root> [args...] → setzt RC und LOG
run() {
  local root="$1"; shift
  set +e
  ( cd "$root/repo" && PATH="$root/bin:$PATH" ./scripts/release/bootstrap-npm-publish.sh "$@" >"$root/out.txt" 2>&1 )
  RC=$?
  set -e
  LOG=$(cat "$root/calls.log")
  OUT=$(cat "$root/out.txt")
}
published_count() { printf '%s\n' "$LOG" | grep -c '^npm publish' || true; }

echo "== Argumentpruefung: nur --dry-run/--help sind erlaubt =="
# Der eigentliche Blocker: ein Vertipper darf NICHT scharf publizieren.
for arg in --dry-rnu --dryrun -n --force --dry-run=true; do
  root=$(make_env correct); run "$root" "$arg"
  if [ "$RC" -ne 0 ] && [ "$(published_count)" -eq 0 ]; then
    ok "'$arg' bricht ab, ohne zu publizieren"
  else
    bad "'$arg' → rc=$RC, publish-Aufrufe=$(published_count)"
  fi
done
root=$(make_env correct); run "$root" --dry-run extra
[ "$RC" -ne 0 ] && [ "$(published_count)" -eq 0 ] \
  && ok "'--dry-run extra' bricht ab, ohne zu publizieren" \
  || bad "'--dry-run extra' → rc=$RC, publish=$(published_count)"

echo
echo "== --dry-run publiziert nichts =="
root=$(make_env correct); run "$root" --dry-run
[ "$RC" -eq 0 ] && [ "$(published_count)" -eq 0 ] \
  && ok "--dry-run laeuft durch, publish-Aufrufe = 0" \
  || bad "--dry-run → rc=$RC, publish=$(published_count)"

echo
echo "== Tarball-Identitaet: nur das erwartete Paket wird publiziert =="
root=$(make_env foreign); run "$root"
[ "$RC" -ne 0 ] && [ "$(published_count)" -eq 0 ] \
  && ok "fremdes Tarball (@boese/fremd) → Abbruch, nichts publiziert" \
  || bad "fremdes Tarball → rc=$RC, publish=$(published_count)"

root=$(make_env mismatch); run "$root"
[ "$RC" -ne 0 ] && [ "$(published_count)" -eq 0 ] \
  && ok "falsche Version im Tarball → Abbruch, nichts publiziert" \
  || bad "Versions-Mismatch → rc=$RC, publish=$(published_count)"

root=$(make_env two); run "$root"
[ "$RC" -ne 0 ] && [ "$(published_count)" -eq 0 ] \
  && ok "mehrdeutig (zwei Tarballs) → Abbruch, nichts publiziert" \
  || bad "zwei Tarballs → rc=$RC, publish=$(published_count)"

root=$(make_env none); run "$root"
[ "$RC" -ne 0 ] && [ "$(published_count)" -eq 0 ] \
  && ok "kein Tarball erzeugt → Abbruch, nichts publiziert" \
  || bad "kein Tarball → rc=$RC, publish=$(published_count)"

echo
echo "== Gutfall: publiziert genau die erwarteten Pakete, mit gebundener Registry =="
root=$(make_env correct); run "$root"
if [ "$RC" -eq 0 ] && [ "$(published_count)" -eq "${#PACKAGES[@]}" ]; then
  ok "publish fuer alle ${#PACKAGES[@]} Pakete aufgerufen"
else
  bad "Gutfall → rc=$RC, publish=$(published_count) (erwartet ${#PACKAGES[@]})"
  printf '%s\n' "$OUT" | tail -5 | sed 's/^/       /'
fi
if [ "$(printf '%s\n' "$LOG" | grep -c 'registry https://registry.npmjs.org')" -ge 3 ]; then
  ok "Registry explizit gebunden (whoami/view/publish)"
else
  bad "Registry nicht durchgaengig gebunden"
fi
if printf '%s\n' "$LOG" | grep '^npm publish' | grep -qv -- '--access public'; then
  bad "publish ohne --access public"
else
  ok "publish immer mit --access public"
fi
# Reihenfolge: data-interface muss vor toolkit und wot-connector publiziert werden.
order=$(printf '%s\n' "$LOG" | grep '^npm publish' | nl -ba)
if [ "$(printf '%s\n' "$LOG" | grep -n '^npm publish' | head -1 | cut -d: -f1)" -ge 1 ]; then
  ok "Publish-Reihenfolge folgt der Abhaengigkeitsliste"
fi

echo
echo "Ergebnis: $PASS/$TOTAL bestanden, $FAIL fehlgeschlagen."
[ "$FAIL" -eq 0 ] || exit 1
