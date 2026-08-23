#!/usr/bin/env bash
# Erst-Publish der Workspace-Pakete nach npm — EINMALIG pro Paket, von Hand.
#
# WARUM ES DAS BRAUCHT (Henne-Ei): npm laesst einen Trusted Publisher (OIDC) erst
# konfigurieren, wenn das Paket bereits existiert — die Einstellung haengt an der
# Paketseite. Ein nie publiziertes Paket kann also nicht per OIDC publiziert
# werden. Der ERSTE Publish muss mit einem klassischen Login/Token laufen; danach
# uebernimmt publish.yml via Trusted Publishing, ohne jedes Geheimnis im Repo.
#
# Das gilt nicht nur heute: JEDES kuenftig neu angelegte Paket durchlaeuft
# dieselbe Schleife. Deshalb liegt dieses Skript im Repo und ist kein Wegwerf-
# Einzeiler.
#
# Voraussetzungen:
#   - `npm login` als Mitglied der npm-Org `real-life-stack` (Scope-Eigentuemer).
#   - pnpm + node wie ueblich.
# Das Skript fasst KEINE Tokens an: es nutzt deine bestehende npm-Session.
#
# Aufruf:
#   scripts/release/bootstrap-npm-publish.sh --dry-run   # nur zeigen, was passiert
#   scripts/release/bootstrap-npm-publish.sh             # wirklich publizieren
set -euo pipefail

# Reihenfolge = Abhaengigkeitsreihenfolge. data-interface ist die Basis; toolkit
# und die Konnektoren haengen daran, wot-connector zusaetzlich am toolkit. Ein
# Konsument koennte sonst kurzzeitig ein Paket installieren, dessen Dependency
# noch gar nicht auf npm liegt.
PACKAGES=(
  packages/data-interface
  packages/toolkit
  packages/mock-connector
  packages/local-connector
  packages/supabase-connector
  packages/wot-connector
)

abort() { echo "ABBRUCH: $*" >&2; exit 1; }

# Registry EXPLIZIT binden. Ein .npmrc (Repo, Home oder Env) koennte sonst auf
# eine andere Registry zeigen — dann liefe der "gibt es das schon?"-Check gegen
# Registry A, waehrend der Publish nach B ginge. Bei einem irreversiblen
# npm-Publish ist das kein Restrisiko, das man eingeht.
REGISTRY="${NPM_REGISTRY:-https://registry.npmjs.org}"

# Argumente STRIKT auswerten: ein Vertipper wie --dry-rnu darf nicht stillschweigend
# als "kein Dry-Run" durchgehen und echt publizieren.
DRY_RUN=0
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY_RUN=1; shift ;;
    -h|--help) echo "Aufruf: $0 [--dry-run]"; exit 0 ;;
    *) abort "unbekanntes Argument '$1' (erlaubt: --dry-run). Aus Sicherheitsgruenden kein Publish." ;;
  esac
done

cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")/../.."

echo "==> 1/4 npm-Session pruefen (Registry: $REGISTRY)"
who=$(npm whoami --registry "$REGISTRY" 2>/dev/null) \
  || abort "nicht eingeloggt bei $REGISTRY — erst 'npm login' (Mitglied der Org real-life-stack)."
echo "    eingeloggt als: $who"

echo "==> 2/4 Was liegt schon auf npm?"
TODO=()
for dir in "${PACKAGES[@]}"; do
  name=$(node -p "require('./$dir/package.json').name")
  version=$(node -p "require('./$dir/package.json').version")
  # Drei Faelle sauber trennen (wie in publish.yml): liegt dort / fehlt / Fehler.
  set +e
  out=$(npm view "$name@$version" version --registry "$REGISTRY" 2>&1); rc=$?
  set -e
  if [ "$rc" -eq 0 ] && [ "$out" = "$version" ]; then
    echo "    vorhanden: $name@$version — wird uebersprungen"
  elif [ "$rc" -ne 0 ] && ! printf '%s' "$out" | grep -q 'E404'; then
    abort "npm view fuer $name@$version fehlgeschlagen: $out"
  else
    echo "    fehlt:     $name@$version"
    TODO+=("$dir")
  fi
done

if [ ${#TODO[@]} -eq 0 ]; then
  echo
  echo "Alle Pakete liegen bereits auf npm. Nichts zu tun."
  echo "Falls der CI-Publish trotzdem scheitert: Trusted Publisher je Paket pruefen"
  echo "(npmjs.com/package/<name> → Settings → Trusted publishing)."
  exit 0
fi

echo "==> 3/4 Pakete bauen (inkl. Workspace-Abhaengigkeiten)"
if [ "$DRY_RUN" -eq 1 ]; then
  echo "    [dry-run] uebersprungen"
else
  pnpm install --frozen-lockfile
  for dir in "${TODO[@]}"; do
    name=$(node -p "require('./$dir/package.json').name")
    pnpm --filter "${name}..." build
  done
fi

echo "==> 4/4 Publizieren (in Abhaengigkeitsreihenfolge)"
# pnpm pack loest "workspace:*" auf konkrete Versionen auf — deshalb packen und
# den fertigen Tarball publizieren, exakt wie publish.yml es spaeter tut.
#
# EIGENES temporaeres Verzeichnis statt eines festen /tmp-Pfads, und pro Paket ein
# frisches Unterverzeichnis: ein gemeinsam genutzter, vorhersagbarer Ordner kann
# ein altes oder fremdes .tgz enthalten, und "das neueste nehmen" wuerde es dann
# unter unserem Scope publizieren. Ein npm-Publish ist irreversibel.
TGZ_ROOT=$(mktemp -d)
trap 'rm -rf "$TGZ_ROOT"' EXIT

for dir in "${TODO[@]}"; do
  name=$(node -p "require('./$dir/package.json').name")
  version=$(node -p "require('./$dir/package.json').version")
  if [ "$DRY_RUN" -eq 1 ]; then
    echo "    [dry-run] wuerde publizieren: $name@$version (aus $dir)"
    continue
  fi

  out_dir="$TGZ_ROOT/$(printf '%s' "$name" | tr '/@' '__')"
  mkdir -p "$out_dir"
  echo "    packe $name@$version"
  pnpm -C "$dir" pack --pack-destination "$out_dir"

  # Genau EIN Tarball darf entstanden sein — kein Glob-Raten, kein "neuestes".
  shopt -s nullglob
  tarballs=("$out_dir"/*.tgz)
  shopt -u nullglob
  [ ${#tarballs[@]} -eq 1 ] \
    || abort "erwarte genau ein Tarball fuer $name, fand: ${tarballs[*]:-keins}"
  tarball="${tarballs[0]}"

  # Und er muss auch WIRKLICH dieses Paket in dieser Version sein. Damit kann
  # weder eine Fehlkonfiguration noch eine untergeschobene Datei etwas Fremdes
  # unter unserem Scope veroeffentlichen.
  meta=$(tar -xzOf "$tarball" package/package.json) \
    || abort "package.json nicht aus $tarball lesbar"
  t_name=$(printf '%s' "$meta" | node -p "JSON.parse(require('fs').readFileSync(0,'utf8')).name")
  t_version=$(printf '%s' "$meta" | node -p "JSON.parse(require('fs').readFileSync(0,'utf8')).version")
  [ "$t_name" = "$name" ] \
    || abort "Tarball enthaelt '$t_name', erwartet '$name' — nichts publiziert."
  [ "$t_version" = "$version" ] \
    || abort "Tarball ist Version '$t_version', erwartet '$version' — nichts publiziert."

  echo "    publiziere $t_name@$t_version ($(basename "$tarball"))"
  npm publish "$tarball" --access public --registry "$REGISTRY"
done

echo
if [ "$DRY_RUN" -eq 1 ]; then
  echo "Dry-Run fertig — nichts publiziert."
  exit 0
fi
echo "FERTIG. Jetzt der zweite, MANUELLE Schritt pro Paket (einmalig):"
echo
for dir in "${TODO[@]}"; do
  name=$(node -p "require('./$dir/package.json').name")
  echo "  https://www.npmjs.com/package/$name/access"
done
echo
echo "  dort: Settings → Trusted publishing → GitHub Actions"
echo "        Repository: real-life-org/real-life-stack"
echo "        Workflow:   publish.yml"
echo
echo "Danach laeuft jeder weitere Publish ueber die CI (OIDC), ohne Token."
