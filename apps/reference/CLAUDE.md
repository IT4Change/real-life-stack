# Reference App

## Mobile Deployment (Capacitor)

### Prerequisites
- Xcode installed with command line tools (`xcode-select -s /Applications/Xcode.app/Contents/Developer`)
- iPhone connected via USB with Developer Mode enabled
- For Android: device connected via USB with USB debugging enabled, `adb` available
- Find your iOS device target ID: `npx cap run ios --list`

### Build & Deploy iOS

```bash
# 1. Build web assets (skip tsc if there are TS errors, vite build alone is fine)
cd apps/reference
npx vite build

# 2. Sync web assets to iOS project
npx cap sync ios

# 3. Deploy to device (replace <target-id> with your device ID from --list)
npx cap run ios --target <target-id>
```

### Build & Deploy Android

```bash
# 1. Build web assets
cd apps/reference
npx vite build

# 2. Sync web assets to Android project
npx cap sync android

# 3. Build APK (needs Gradle 8.14+, JAVA_HOME and ANDROID_HOME)
JAVA_HOME=$(/usr/libexec/java_home) \
ANDROID_HOME=/opt/homebrew/share/android-commandlinetools \
gradle assembleDebug -p android

# 4. Install & launch
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
adb shell am start -n org.reallife.reallifestack/.MainActivity
```

### Key Notes
- Base path defaults to `/` in `vite.config.ts` — no `VITE_BASE_PATH` env var needed
- `tsc -b` may fail with unused-import errors; `npx vite build` works fine standalone
- iOS signing: set your own Development Team in Xcode or `project.pbxproj`
- `viewport-fit=cover` in `index.html` is required for `env()` safe area variables to work
- Android needs Gradle 8.14+ on PATH (no local Gradle wrapper in this project)

## OTA Updates (Live Update)

Ermöglicht Web-Bundle-Updates ohne neuen App-Store-Release via `@capawesome/capacitor-live-update`.

### Channels (3 Targets)

| Channel | Target |
|---|---|
| `ios` | Apple App Store |
| `android` | Google Play Store |
| `android-foss` | F-Droid / ohne Google Services |

Jeder Channel hat eine eigene `latest.json`, wird aber mit demselben Web-Bundle gebaut (sofern keine FOSS-spezifischen Env-Vars nötig sind).

### Einrichtung Update-Server

Statische Dateien auf GitHub Pages (`real-life-stack.de`), Zips in GitHub Releases:
- `real-life-stack.de/updates/ios/latest.json`
- `real-life-stack.de/updates/android/latest.json`
- `real-life-stack.de/updates/android-foss/latest.json`

### Bundle erstellen & deployen

Über GitHub Actions: **Actions → "OTA Release" → "Run workflow"** → Version + Channels eingeben.

Der Workflow baut das Bundle pro Channel, erstellt einen GitHub Release mit den Zips und
committed die `latest.json` Dateien automatisch in den `gh-pages` Branch.

### Wie es funktioniert

1. App startet → `checkForLiveUpdate()` in `main.tsx` wird aufgerufen
2. Fetch `https://real-life-stack.de/updates/<channel>/latest.json`
3. Wenn `bundleId` neu: Bundle-Zip herunterladen, entpacken, App neu laden
4. Bei Fehler: App läuft normal weiter (kein Crash)
5. Im Browser/Dev: komplett inaktiv (kein nativer Kontext)

Der `VITE_UPDATE_CHANNEL` wird beim nativen App-Build gesetzt (lokal / Xcode / Android Studio)
**und beim Bau der OTA-Bundles in CI**. Beides ist nötig:

- Das **eingebaute** Bundle kennt seinen Kanal über den nativen Build.
- Nach einem OTA-Reload läuft aber das **heruntergeladene** Bundle. Es kennt seinen Kanal
  nur, wenn `deploy-prototypes.yml` ihn beim Bau gesetzt hat — sonst greift der Fallback
  `Capacitor.getPlatform()`. Für `ios` und `android` ist der zufällig richtig, für
  `android-foss` nicht: die F-Droid-App landete dadurch auf dem Play-Kanal (#193).

Nur für den **Web**-Deploy auf GitHub Pages spielt die Variable keine Rolle — dort läuft die
OTA-Logik nie (kein nativer Kontext).

### Apple-Richtlinien
OTA-Updates sind erlaubt für reine Web-Bundle-Änderungen (kein `eval`, keine neuen nativen APIs).