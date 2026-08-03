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
  packages/graphql-connector
  packages/wot-connector
)

DRY_RUN=0
[ "${1:-}" = "--dry-run" ] && DRY_RUN=1

abort() { echo "ABBRUCH: $*" >&2; exit 1; }
cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")/../.."

echo "==> 1/4 npm-Session pruefen"
who=$(npm whoami 2>/dev/null) || abort "nicht eingeloggt — erst 'npm login' (Mitglied der Org real-life-stack)."
echo "    eingeloggt als: $who"

echo "==> 2/4 Was liegt schon auf npm?"
TODO=()
for dir in "${PACKAGES[@]}"; do
  name=$(node -p "require('./$dir/package.json').name")
  version=$(node -p "require('./$dir/package.json').version")
  # Drei Faelle sauber trennen (wie in publish.yml): liegt dort / fehlt / Fehler.
  set +e
  out=$(npm view "$name@$version" version 2>&1); rc=$?
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
mkdir -p /tmp/rls-bootstrap-tgz
for dir in "${TODO[@]}"; do
  name=$(node -p "require('./$dir/package.json').name")
  version=$(node -p "require('./$dir/package.json').version")
  if [ "$DRY_RUN" -eq 1 ]; then
    echo "    [dry-run] wuerde publizieren: $name@$version (aus $dir)"
    continue
  fi
  echo "    packe $name@$version"
  pnpm -C "$dir" pack --pack-destination /tmp/rls-bootstrap-tgz
  tarball=$(ls -t /tmp/rls-bootstrap-tgz/*.tgz | head -1)
  echo "    publiziere $tarball"
  npm publish "$tarball" --access public
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
