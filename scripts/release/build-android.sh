#!/usr/bin/env bash
# Kanonischer Android-Build vom Tag — RLS Reference App.
#
# Designprinzip "Plattform ist Trigger, nicht Gehirn": die CI-Workflow-Datei
# (.github/workflows/build-on-tag.yml) ist eine duenne Huelle um dieses Skript.
# Ein Umzug zu Forgejo/GitLab tauscht die Huelle, nicht die Logik. Das Skript
# laeuft identisch lokal, in GitHub Actions und spaeter im wot-release-Runner.
# Schwester-Skript: web-of-trust/scripts/release/build-android.sh (WoT-Profil).
#
# Was es garantiert:
#   1. Gebaut wird EXAKT der uebergebene Tag (HEAD muss ihn tragen).
#   2. version.properties stimmt mit dem Tag ueberein — die Klasse
#      "Metadaten behaupten 0.2.1, Quelle steht auf 0.2.0" (23.07.2026)
#      stirbt hier.
#   3. Backend-URLs sind explizit gesetzt und gegen eine Allowlist geprueft,
#      BEVOR irgendetwas signierfaehig wird.
#   4. Output ist ein UNSIGNIERTES APK + build-info.json + SHA256SUMS.
#      Signiert wird woanders (Schluessel-Verwahrung!).
set -euo pipefail

# ---------------------------------------------------------------- App-Profil
APP_DIR=apps/reference
APP_ID=org.reallife.reallifestack
TAG_PREFIX=app-v                               # RLS taggt app-v0.2.1
BUILD_SCRIPT=build:android
GRADLE_TASK=assembleRelease                    # kein Flavor → unsigniertes APK (F-Droid)
AAB_TASK=bundleRelease                          # unsigniertes AAB (Play, Pipeline signiert)
APK_OUT="$APP_DIR/android/app/build/outputs/apk/release"
AAB_OUT="$APP_DIR/android/app/build/outputs/bundle/release"
UPDATE_SERVER=https://real-life-stack.de
BUILD_ENV=(
  VITE_BASE_PATH=/
  VITE_RELAY_URL=wss://relay.web-of-trust.de
  VITE_PROFILE_SERVICE_URL=https://profiles.web-of-trust.de
  VITE_UPDATE_SERVER_URL="$UPDATE_SERVER"
  VITE_UPDATE_CHANNEL=android-foss
)
# Workspace-Pakete, die vor dem App-Build gebaut sein muessen. Reihenfolge und
# Auswahl gespiegelt aus deploy-prototypes.yml (dort bewaehrt).
build_workspace_deps() {
  pnpm --filter @real-life-stack/data-interface build
  pnpm --filter @real-life-stack/toolkit build
  pnpm --filter @real-life-stack/mock-connector --filter @real-life-stack/local-connector build
  pnpm --filter @real-life-stack/wot-connector build
}
# ---------------------------------------------------------------------------

TAG="${1:-}"
if [ -z "$TAG" ]; then
  echo "Aufruf: $0 <tag>   (z.B. ${TAG_PREFIX}0.2.1)" >&2
  exit 1
fi

abort() { echo "ABBRUCH: $*" >&2; exit 1; }

echo "==> 1/6 Tag- und Versionskonsistenz"
case "$TAG" in
  "$TAG_PREFIX"[0-9]*) ;;
  *) abort "Tag '$TAG' passt nicht zum Praefix '$TAG_PREFIX'." ;;
esac

# HEAD muss den Tag tragen. Sonst baut man einen Stand und behauptet einen
# anderen — exakt die Provenienz-Luecke, wegen der es dieses Skript gibt.
# -F: der Tag ist ein LITERAL, kein Regex — sonst sind die Punkte in 0.2.1
# Wildcards, und ein praeparierter Tag koennte als Muster wirken.
if ! git tag --points-at HEAD | grep -qxF "$TAG"; then
  abort "HEAD traegt den Tag '$TAG' nicht. Erst den Tag auschecken."
fi

WANT="${TAG#"$TAG_PREFIX"}"
VERSION_FILE="$APP_DIR/android/version.properties"
VERSION_NAME=$(grep VERSION_NAME "$VERSION_FILE" | cut -d= -f2)
VERSION_CODE=$(grep VERSION_CODE "$VERSION_FILE" | cut -d= -f2)
if [ "$VERSION_NAME" != "$WANT" ]; then
  abort "Tag sagt $WANT, version.properties sagt $VERSION_NAME."
fi
echo "    ok: $TAG == version.properties ($VERSION_NAME, Code $VERSION_CODE)"

echo "==> 2/6 Dependencies (frozen lockfile)"
pnpm install --frozen-lockfile

echo "==> 3/6 Workspace-Pakete bauen"
build_workspace_deps

echo "==> 4/6 Web-Assets bauen (URLs explizit gepinnt)"
( cd "$APP_DIR" && env "${BUILD_ENV[@]}" pnpm "$BUILD_SCRIPT" )

echo "==> 5/6 Bundle verifizieren"
d="$APP_DIR/dist/assets"
for bad in utopia-lab relay.box; do
  if grep -rlq "$bad" "$d"/*.js; then
    abort "'$bad' im Bundle gefunden (tote/lokale Infrastruktur)."
  fi
done
# Alle ws/wss-URLs EINMAL extrahieren, Positiv- und Allowlist-Pruefung auf
# derselben Liste. Der Anker ([/:?#]|$) ist entscheidend: ein blosses
# Praefix-Match liesse wss://relay.web-of-trust.de.angreifer.tld durch und
# haette es zugleich als "Produktions-Relay vorhanden" gezaehlt.
WS_URLS=$(grep -rhoE "wss?://[^\"'\`[:space:]]+" "$d"/*.js | sort -u || true)
ALLOW='^wss://relay\.web-of-trust\.de([/:?#]|$)'
printf '%s\n' "$WS_URLS" | grep -qE "$ALLOW" \
  || abort "Produktions-Relay fehlt im Bundle."
UNEXPECTED_WS=$(printf '%s\n' "$WS_URLS" | grep -vE "$ALLOW" || true)
if [ -n "$UNEXPECTED_WS" ]; then
  echo "ABBRUCH: unerwartete WebSocket-URLs im Bundle:" >&2
  printf '  %s\n' $UNEXPECTED_WS >&2
  exit 1
fi
echo "    ok: WebSocket-Allowlist bestanden"
echo "    HTTPS-Hosts im Bundle (zur Durchsicht):"
grep -rhoE "https://[a-zA-Z0-9.-]+" "$d"/*.js | sed 's|https://|      |' | sort -u

echo "==> 6/6 Android-Build (APK für F-Droid + AAB für Play)"
rm -rf "$APK_OUT" "$AAB_OUT"
( cd "$APP_DIR/android" && ./gradlew --no-daemon "$GRADLE_TASK" "$AAB_TASK" )

# APK waehlen — ohne Pipe: unter pipefail bricht sowohl ein leerer grep -v als
# auch ein leeres ls die Zuweisung ab, bevor Fallback/Fehlermeldung greifen.
# Bei RLS ist das einzige APK das unsignierte — der Fallback ist der Normalfall.
shopt -s nullglob
APKS=("$APK_OUT"/*.apk)
AABS=("$AAB_OUT"/*.aab)
shopt -u nullglob
[ ${#APKS[@]} -gt 0 ] || abort "kein APK in $APK_OUT"
[ ${#AABS[@]} -gt 0 ] || abort "kein AAB in $AAB_OUT"
BUILT=""
for a in "${APKS[@]}"; do
  case "$a" in *-unsigned.apk) continue ;; esac
  BUILT="$a"; break
done
[ -n "$BUILT" ] || BUILT="${APKS[0]}"
AAB="${AABS[0]}"

OUT=out/release
rm -rf "$OUT" && mkdir -p "$OUT"
cp "$BUILT" "$OUT/"
cp "$AAB" "$OUT/"
COMMIT=$(git rev-parse HEAD)
# JSON maschinell erzeugen statt per Heredoc: die Java-Versionszeile enthaelt
# Anfuehrungszeichen, Hand-Escaping hat nachweislich ungueltiges JSON erzeugt.
# Werte gehen als Env hinein, node uebernimmt das Escaping. Kein Zeitstempel —
# die Datei soll bei einem Reproduzierbarkeits-Vergleich identisch sein.
BI_APP="$APP_ID" BI_TAG="$TAG" BI_COMMIT="$COMMIT" \
BI_VNAME="$VERSION_NAME" BI_VCODE="$VERSION_CODE" \
BI_TASK="$GRADLE_TASK $AAB_TASK" \
BI_APK="$(basename "$BUILT")" BI_AAB="$(basename "$AAB")" \
BI_NODE="$(node --version)" BI_PNPM="$(pnpm --version)" \
BI_JAVA="$(java -version 2>&1 | head -1)" \
node -e '
const e = process.env;
require("fs").writeFileSync(process.argv[1], JSON.stringify({
  app: e.BI_APP, tag: e.BI_TAG, commit: e.BI_COMMIT,
  versionName: e.BI_VNAME, versionCode: Number(e.BI_VCODE),
  gradleTask: e.BI_TASK, updateChannel: "android-foss",
  artifacts: { apk: e.BI_APK, aab: e.BI_AAB },
  toolchain: { node: e.BI_NODE, pnpm: e.BI_PNPM, java: e.BI_JAVA },
  signed: false,
  note: "APK (F-Droid) und AAB (Play) unsigniert. Signierung erfolgt getrennt (Schluessel-Verwahrung)."
}, null, 2) + "\n");
' "$OUT/build-info.json"
node -e 'JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"))' "$OUT/build-info.json"

( cd "$OUT" && sha256sum ./* > SHA256SUMS )

echo
echo "FERTIG: $OUT/"
ls -la "$OUT/"
