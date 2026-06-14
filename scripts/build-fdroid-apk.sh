#!/usr/bin/env bash
set -euo pipefail

# Build the Real Life Stack Reference App APK for F-Droid distribution.
#
# This script is SELF-CONTAINED: it does not depend on the state of a
# sibling ../web-of-trust checkout. The reference app links against
# @real-life/wot-core + @real-life/adapter-yjs from web-of-trust, whose
# `spec-vnext` HEAD is mid-refactor and breaks the build (e.g. the
# IndexedDbIdentitySeedVault export moved). So we check out web-of-trust
# at the last commit known to build with packages/wot-connector — the
# same pin the deploy workflow uses — into a throwaway ./.wot, build the
# linked packages there, and point the links at it for the duration of
# the build. The repo's package.json files are restored on exit.
#
# Usage:
#   ./scripts/build-fdroid-apk.sh                  # release, unsigned
#   ./scripts/build-fdroid-apk.sh --debug          # debug APK (for OTA testing via logcat)
#   ./scripts/build-fdroid-apk.sh --sign           # release, signed (needs FDROID_KEYSTORE)

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP_DIR="$REPO_ROOT/apps/reference"
WOT_DIR="$REPO_ROOT/.wot"

# Last web-of-trust commit known to build against the current
# packages/wot-connector (keep in sync with .github/workflows/deploy-prototypes.yml).
WOT_PIN="f79723e8b81467f394b8d5c9ab18da2b34c9c35c"

BUILD_TYPE="release"
SIGN=0
for arg in "$@"; do
  case "$arg" in
    --debug) BUILD_TYPE="debug" ;;
    --sign)  SIGN=1 ;;
    *) echo "Unknown arg: $arg" >&2; exit 1 ;;
  esac
done

# We temporarily sed-patch these three files to point at ./.wot. To
# undo that WITHOUT clobbering any unrelated uncommitted work the
# developer may have in them, snapshot the exact current contents first
# and restore those snapshots on exit — never `git checkout`, which
# would also revert their edits.
PATCHED_FILES=(package.json packages/wot-connector/package.json pnpm-lock.yaml)
SNAPSHOT_DIR="$(mktemp -d)"

cleanup() {
  cd "$REPO_ROOT"
  for f in "${PATCHED_FILES[@]}"; do
    snap="$SNAPSHOT_DIR/$(echo "$f" | tr / _)"
    if [[ -f "$snap" ]]; then cp "$snap" "$f"; fi
  done
  rm -rf "$SNAPSHOT_DIR"
  echo "==> Restored package.json / lockfile from pre-build snapshot."
  echo "    (node_modules still point at .wot; run 'pnpm install' to"
  echo "     return to your normal dev setup.)"
}
trap cleanup EXIT

# Snapshot before any patching.
cd "$REPO_ROOT"
for f in "${PATCHED_FILES[@]}"; do
  cp "$f" "$SNAPSHOT_DIR/$(echo "$f" | tr / _)"
done

echo "==> Preparing pinned web-of-trust ($WOT_PIN) in .wot ..."
if [[ ! -d "$WOT_DIR/.git" ]]; then
  git clone https://github.com/real-life-org/web-of-trust.git "$WOT_DIR"
fi
git -C "$WOT_DIR" fetch --depth 1 origin "$WOT_PIN" 2>/dev/null || git -C "$WOT_DIR" fetch origin
git -C "$WOT_DIR" checkout --quiet "$WOT_PIN"

echo "==> Building web-of-trust packages (wot-core, adapter-yjs)..."
cd "$WOT_DIR"
pnpm install --frozen-lockfile
pnpm --filter @web_of_trust/core build
pnpm --filter @web_of_trust/adapter-yjs build

echo "==> Pointing reference links at .wot (temporary, restored on exit)..."
cd "$REPO_ROOT"
sed -i 's|link:../web-of-trust/|link:.wot/|g' package.json
sed -i 's|"@real-life/wot-core": "^0.2.0"|"@real-life/wot-core": "link:../../.wot/packages/wot-core"|g' packages/wot-connector/package.json
sed -i 's|"@real-life/adapter-yjs": "^0.1.0"|"@real-life/adapter-yjs": "link:../../.wot/packages/adapter-yjs"|g' packages/wot-connector/package.json
pnpm install --no-frozen-lockfile

echo "==> Building workspace packages..."
pnpm --filter @real-life-stack/data-interface build
pnpm --filter @real-life-stack/toolkit build
pnpm --filter @real-life-stack/mock-connector --filter @real-life-stack/local-connector build
pnpm --filter @real-life-stack/wot-connector build

# OTA channel: defaults to the platform name (= "android") via
# live-update.ts's fallback, which is right for testing and direct
# distribution. For the official F-Droid build set VITE_UPDATE_CHANNEL
# explicitly (e.g. `VITE_UPDATE_CHANNEL=android-foss ./scripts/build-fdroid-apk.sh`),
# or `__local__` to disable OTA entirely. It's inherited from the env here.
echo "==> Building web assets (base path /, channel=${VITE_UPDATE_CHANNEL:-<platform fallback>})..."
cd "$APP_DIR"
VITE_BASE_PATH=/ npx vite build

echo "==> Syncing Capacitor..."
npx cap sync android

# Make sure gradle can find the Android SDK without relying on the
# caller's environment. Prefer ANDROID_HOME/ANDROID_SDK_ROOT, else probe
# the usual locations, then pin it via local.properties (gitignored).
ANDROID_SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
if [[ -z "$ANDROID_SDK" || ! -d "$ANDROID_SDK/platform-tools" ]]; then
  for cand in "$HOME/Android/Sdk" "$HOME/Library/Android/sdk" "/opt/android-sdk" "/usr/lib/android-sdk"; do
    if [[ -d "$cand/platform-tools" ]]; then ANDROID_SDK="$cand"; break; fi
  done
fi
if [[ -z "$ANDROID_SDK" || ! -d "$ANDROID_SDK/platform-tools" ]]; then
  echo "ERROR: Android SDK not found. Set ANDROID_HOME (or install the SDK" >&2
  echo "       so it lands in ~/Android/Sdk) and re-run." >&2
  exit 1
fi
export ANDROID_HOME="$ANDROID_SDK"
export ANDROID_SDK_ROOT="$ANDROID_SDK"
# Set sdk.dir without clobbering other local properties (ndk.dir, etc.):
# replace an existing sdk.dir line in place, otherwise append.
LOCAL_PROPS="$APP_DIR/android/local.properties"
if [[ -f "$LOCAL_PROPS" ]] && grep -q '^sdk.dir=' "$LOCAL_PROPS"; then
  sed -i "s|^sdk.dir=.*|sdk.dir=$ANDROID_SDK|" "$LOCAL_PROPS"
else
  echo "sdk.dir=$ANDROID_SDK" >> "$LOCAL_PROPS"
fi
echo "==> Android SDK: $ANDROID_SDK"

cd "$APP_DIR/android"
if [[ "$BUILD_TYPE" == "debug" ]]; then
  echo "==> Building DEBUG APK..."
  ./gradlew assembleDebug
  APK_PATH="$APP_DIR/android/app/build/outputs/apk/debug/app-debug.apk"
  echo "==> Debug APK: $APK_PATH"
  echo "    Install:  adb install -r \"$APK_PATH\""
  echo "    OTA logs: adb logcat | grep -i LiveUpdate"
  exit 0
fi

echo "==> Building RELEASE APK..."
./gradlew assembleRelease
APK_PATH="$APP_DIR/android/app/build/outputs/apk/release/app-release-unsigned.apk"
echo "==> APK built: $APK_PATH"

if [[ "$SIGN" == "1" ]]; then
  KEYSTORE="${FDROID_KEYSTORE:?Set FDROID_KEYSTORE to your keystore path}"
  KEY_ALIAS="${FDROID_KEY_ALIAS:-reallifestack}"
  SIGNED_APK="${APK_PATH%-unsigned.apk}-signed.apk"

  # apksigner lives in the SDK's build-tools, usually not on PATH. Use it
  # from PATH if available, else pick the highest installed build-tools.
  APKSIGNER="$(command -v apksigner || true)"
  if [[ -z "$APKSIGNER" ]]; then
    APKSIGNER="$(ls -d "$ANDROID_HOME"/build-tools/*/apksigner 2>/dev/null | sort -V | tail -1)"
  fi
  if [[ -z "$APKSIGNER" || ! -x "$APKSIGNER" ]]; then
    echo "ERROR: apksigner not found. Install Android build-tools." >&2
    exit 1
  fi

  "$APKSIGNER" sign \
    --ks "$KEYSTORE" \
    --ks-key-alias "$KEY_ALIAS" \
    --out "$SIGNED_APK" \
    "$APK_PATH"
  echo "==> Signed APK: $SIGNED_APK"
fi
