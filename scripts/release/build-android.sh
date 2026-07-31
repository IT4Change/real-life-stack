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
#   4. ZWEI getrennte Web-Builds, weil F-Droid und Play sich im Bundle
#      unterscheiden MUESSEN:
#        - F-Droid-APK: mit OTA-Kanal android-foss (Self-Update erlaubt/gewollt).
#        - Play-AAB:    OHNE OTA (VITE_DISABLE_LIVE_UPDATE) — Google verbietet
#          Self-Updates ausserhalb seines eigenen Mechanismus ausdruecklich.
#      Ein OTA-Sentinel erzwingt diese Trennung, statt sie nur zu meinen.
#   5. Output ist ein UNSIGNIERTES APK (F-Droid) + AAB (Play) + build-info.json
#      + SHA256SUMS. Signiert wird woanders (Schluessel-Verwahrung!).
set -euo pipefail

# ---------------------------------------------------------------- App-Profil
APP_DIR=apps/reference
APP_ID=org.reallife.reallifestack
TAG_PREFIX=app-v                               # RLS taggt app-v0.2.1
BUILD_SCRIPT=build:android                      # tsc -b && vite build && cap sync android
GRADLE_TASK=assembleRelease                     # flavorlos → unsigniertes APK (F-Droid)
AAB_TASK=bundleRelease                           # flavorlos → unsigniertes AAB (Play)
APK_OUT="$APP_DIR/android/app/build/outputs/apk/release"
AAB_OUT="$APP_DIR/android/app/build/outputs/bundle/release"
UPDATE_SERVER=https://real-life-stack.de

# Gemeinsame Backend-URLs. Identisch fuer beide Kanaele — nur das OTA-Verhalten
# unterscheidet sich.
COMMON_ENV=(
  VITE_BASE_PATH=/
  VITE_RELAY_URL=wss://relay.web-of-trust.de
  VITE_PROFILE_SERVICE_URL=https://profiles.web-of-trust.de
)
# F-Droid: OTA AN. Der Self-Updater holt Web-Layer-Updates ohne neues APK — bei
# F-Droid gewollt (langsame Store-Reviews).
FDROID_ENV=(
  "${COMMON_ENV[@]}"
  VITE_UPDATE_SERVER_URL="$UPDATE_SERVER"
  VITE_UPDATE_CHANNEL=android-foss
)
# Play: OTA AUS. Anders als die WoT-App kennt RLS' live-update.ts KEIN
# VITE_DISABLE_LIVE_UPDATE — es faellt bei fehlendem Kanal auf getPlatform()
# ('android') zurueck und wuerde WEITER self-updaten. RLS' eigener Abschalter ist
# der Sentinel-Kanal '__local__' (live-update.ts): der ruft LiveUpdate.reset()
# und kehrt zurueck, ohne je ein Bundle zu holen. Genau das braucht Play.
# Google-Play-Richtlinie:
# https://support.google.com/googleplay/android-developer/answer/16559646
PLAY_ENV=(
  "${COMMON_ENV[@]}"
  VITE_UPDATE_CHANNEL=__local__
)
# Zwei Marker, weil RLS OTA zur LAUFZEIT abschaltet (Kanal __local__), nicht zur
# Compile-Zeit — der OTA-Code bleibt im Bundle, also beweist blosse Abwesenheit
# nichts. Der eingebackene Kanal ist der Beweis:
OTA_ON_MARKER=android-foss                      # nur im F-Droid-Bundle
OTA_OFF_MARKER=__local__                         # RLS-Abschalter, nur im Play-Bundle

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

# --------------------------------------------------------------- Bundle-Pruefung
# Prueft dist/assets: tote Infra, WebSocket-Allowlist, und den OTA-Sentinel fuer
# den jeweiligen Kanal. Wird pro Web-Build aufgerufen.
#   $1 = Label (fdroid|play)   $2 = OTA-Erwartung (on|off)
verify_bundle() {
  local label="$1" ota="$2"
  local d="$APP_DIR/dist/assets"
  for bad in utopia-lab relay.box; do
    if grep -rlq "$bad" "$d"/*.js; then
      abort "'$bad' im $label-Bundle gefunden (tote/lokale Infrastruktur)."
    fi
  done
  # Alle ws/wss-URLs EINMAL extrahieren, Positiv- und Allowlist-Pruefung auf
  # derselben Liste. Der Anker ([/:?#]|$) ist entscheidend: ein blosses
  # Praefix-Match liesse wss://relay.web-of-trust.de.angreifer.tld durch.
  local ws allow unexpected
  ws=$(grep -rhoE "wss?://[^\"'\`[:space:]]+" "$d"/*.js | sort -u || true)
  allow='^wss://relay\.web-of-trust\.de([/:?#]|$)'
  printf '%s\n' "$ws" | grep -qE "$allow" \
    || abort "$label: Produktions-Relay fehlt im Bundle."
  unexpected=$(printf '%s\n' "$ws" | grep -vE "$allow" || true)
  if [ -n "$unexpected" ]; then
    echo "ABBRUCH: unerwartete WebSocket-URLs im $label-Bundle:" >&2
    printf '  %s\n' $unexpected >&2
    exit 1
  fi
  # OTA-Sentinel: erzwingt die Kanal-Trennung, statt sie nur zu meinen. Fuer den
  # F-Droid-Build muss android-foss da sein und __local__ fehlen; fuer Play
  # umgekehrt. So kann ein Self-Updater nie ins Play-AAB geraten (Policy-Verstoss),
  # und ein Play-Build, dem der Abschalt-Kanal fehlt (→ self-update ueber Default
  # 'android'), faellt ebenfalls auf.
  local has_on has_off
  if grep -rlq "$OTA_ON_MARKER"  "$d"/*.js; then has_on=1;  else has_on=0;  fi
  if grep -rlq "$OTA_OFF_MARKER" "$d"/*.js; then has_off=1; else has_off=0; fi
  if [ "$ota" = "on" ]; then
    [ "$has_on"  = 1 ] || abort "$label: OTA-Kanal '$OTA_ON_MARKER' fehlt — F-Droid-OTA wuerde nicht funktionieren."
    [ "$has_off" = 0 ] || abort "$label: Abschalt-Kanal '$OTA_OFF_MARKER' im F-Droid-Bundle — OTA waere aus."
  else
    [ "$has_on"  = 0 ] || abort "$label-Bundle enthaelt OTA-Kanal '$OTA_ON_MARKER' — Play verbietet Self-Updates."
    [ "$has_off" = 1 ] || abort "$label-Bundle: Abschalt-Kanal '$OTA_OFF_MARKER' fehlt — App wuerde ueber Default-Kanal self-updaten."
  fi
  echo "    ok: $label — Allowlist bestanden, OTA $ota bestaetigt (on=$has_on off=$has_off)"
  echo "    HTTPS-Hosts im $label-Bundle (zur Durchsicht):"
  grep -rhoE "https://[a-zA-Z0-9.-]+" "$d"/*.js | sed 's|https://|      |' | sort -u
}

# Baut die Web-Assets mit dem gegebenen Env und verifiziert sie.
#   $1 = Label   $2 = OTA-Erwartung   ab $3 = KEY=VAL-Env-Paare
build_web() {
  local label="$1" ota="$2"; shift 2
  echo "==> Web-Assets ($label, OTA $ota — URLs explizit gepinnt)"
  ( cd "$APP_DIR" && env "$@" pnpm "$BUILD_SCRIPT" )
  verify_bundle "$label" "$ota"
}

OUT=out/release
rm -rf "$OUT" && mkdir -p "$OUT"

echo "==> 4/6 F-Droid: Web-Build (OTA an) → unsigniertes APK"
build_web fdroid on "${FDROID_ENV[@]}"
rm -rf "$APK_OUT"
( cd "$APP_DIR/android" && ./gradlew --no-daemon "$GRADLE_TASK" )
shopt -s nullglob
APKS=("$APK_OUT"/*.apk)
shopt -u nullglob
[ ${#APKS[@]} -gt 0 ] || abort "kein APK in $APK_OUT"
# F-Droid erwartet das UNSIGNIERTE APK — die Pipeline signiert es. Deterministisch:
# genau ein *-unsigned.apk (flavorlos, ohne signingConfig), sonst genau ein APK.
# Alles andere ist mehrdeutig und koennte das falsche Artefakt attestieren.
UNSIGNED=()
for a in "${APKS[@]}"; do case "$a" in *-unsigned.apk) UNSIGNED+=("$a") ;; esac; done
if [ ${#UNSIGNED[@]} -eq 1 ]; then
  BUILT="${UNSIGNED[0]}"
elif [ ${#APKS[@]} -eq 1 ]; then
  BUILT="${APKS[0]}"
else
  abort "APK-Auswahl mehrdeutig (erwarte genau ein unsigniertes APK): ${APKS[*]}"
fi
cp "$BUILT" "$OUT/"

echo "==> 5/6 Play: Web-Build (OTA aus) → unsigniertes AAB"
build_web play off "${PLAY_ENV[@]}"
rm -rf "$AAB_OUT"
( cd "$APP_DIR/android" && ./gradlew --no-daemon "$AAB_TASK" )
shopt -s nullglob
AABS=("$AAB_OUT"/*.aab)
shopt -u nullglob
[ ${#AABS[@]} -eq 1 ] || abort "erwarte genau ein AAB in $AAB_OUT, fand: ${AABS[*]:-keins}"
AAB="${AABS[0]}"
cp "$AAB" "$OUT/"

echo "==> 6/6 build-info + Pruefsummen"
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
  gradleTask: e.BI_TASK,
  artifacts: { apk: e.BI_APK, aab: e.BI_AAB },
  otaChannels: { apk: "android-foss", aab: "disabled" },
  toolchain: { node: e.BI_NODE, pnpm: e.BI_PNPM, java: e.BI_JAVA },
  signed: false,
  note: "APK (F-Droid, OTA an) und AAB (Play, OTA aus) getrennt gebaut, beide unsigniert. Signierung erfolgt getrennt (Schluessel-Verwahrung)."
}, null, 2) + "\n");
' "$OUT/build-info.json"
node -e 'JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"))' "$OUT/build-info.json"

( cd "$OUT" && sha256sum ./* > SHA256SUMS )

echo
echo "FERTIG: $OUT/"
ls -la "$OUT/"
