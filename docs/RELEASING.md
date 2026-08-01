# Releasing

Wie aus einem Merge auf `master` ein veröffentlichtes App-Release wird (Real Life
Stack Reference App, für Nutzer auf F-Droid / Play / Obtainium).

Motor ist **release-please**: es sammelt Conventional Commits, hält *eine*
Release-PR offen und erzeugt beim Merge den App-Tag.

> **Scope:** release-please ist hier aktuell **app-fokussiert**. Die
> Workspace-Pakete (`@real-life-stack/data-interface`, `toolkit`, connectors)
> werden noch **nicht** über release-please auf npm publiziert. Sie kämen als
> weitere Komponenten in dieselbe Config (dann strukturgleich zu web-of-trust) —
> ein Follow-up, wenn sie extern konsumiert werden sollen. Die App braucht das
> nicht: sie baut die Pakete **aus dem Quellcode**.

---

## Das Gesamtbild

```
Merge auf master
  → release-please pflegt EINE Release-PR (App, nach Conventional Commits)
  → du mergst sie → App-Tag app-vX.Y.Z
       → build-on-tag (Dispatch) → CI baut APK (F-Droid) + AAB (Play)
       → Server signiert & liefert aus
```

---

## Was wodurch ausgelöst wird

| Ereignis | Läuft |
|---|---|
| **Merge auf `master`** (App-/Paket-Pfade) | `deploy-prototypes.yml` → Web-App + **OTA**; `release-please.yml` → Release-PR |
| **Merge der Release-PR** | App-Tag entsteht → `build-on-tag` per Dispatch |
| **`app-v*`-Tag** | `build-on-tag` → APK + AAB als CI-Artefakt |

> **GITHUB_TOKEN-Tags triggern keine Workflows** (GitHub-Rekursionsschutz).
> Deshalb stößt `release-please.yml` `build-on-tag` ausdrücklich per
> `workflow_dispatch` an, statt sich auf `on: push tags` zu verlassen.

---

## Version & versionCode

`apps/reference/android/version.properties` führt **nur** den Semver-Namen:

```properties
# x-release-please-start-version
VERSION_NAME=0.2.2
# x-release-please-end
```

Der Android-`versionCode` wird **deterministisch abgeleitet** — an zwei Stellen
mit derselben Formel (`build.gradle` für den Build, `build-android.sh` für die
`build-info`):

```
versionCode = major * 10000 + minor * 100 + patch
0.2.2 → 202   0.2.3 → 203   0.3.0 → 300   1.0.0 → 10000
```

Monoton, solange minor/patch < 100. So muss release-please nur den **Namen**
führen — den kann es (Semver), einen Integer nicht.

> **Einmaliger Sprung:** Bestehende Releases hatten Codes 1…4. Ab dem nächsten
> Release gilt die Formel (0.2.3 → 203). Der Sprung 4 → 203 ist unkritisch —
> Stores verlangen nur *steigende* Codes, Lücken sind erlaubt.

---

## Zwei Kanäle, zwei Web-Builds

`build-on-tag` baut **zwei** Bundles, weil sich F-Droid und Play im Web-Layer
unterscheiden **müssen** (siehe `scripts/release/build-android.sh`):

| Artefakt | Web-Build | OTA | signiert mit |
|---|---|---|---|
| **APK** (F-Droid + Obtainium) | `VITE_UPDATE_CHANNEL=android-foss` | **an** | F-Droid-Key |
| **AAB** (Play) | `VITE_UPDATE_CHANNEL=__local__` | **aus** | Play-Upload-Key |

Ein **OTA-Sentinel** im Build erzwingt die Trennung (`android-foss` muss im
F-Droid-Bundle stehen, darf nicht im Play-Bundle). Google verbietet Self-Updates
außerhalb seines Mechanismus.

> RLS' App schaltet OTA über den Kanal `__local__` ab (`live-update.ts`:
> `LiveUpdate.reset()` + return), nicht über ein Flag. Der Minifier faltet den
> Kanal-String weg, daher prüft der Sentinel nur `android-foss` (Ab-/Anwesenheit).

### Konsequenz

- **F-Droid-Nutzer** bekommen Web-Änderungen bei **jedem Merge** per OTA
  (`deploy-prototypes.yml`, Kanal `android-foss`).
- **Play-Nutzer** bekommen **kein** OTA. Sie updaten **nur** über einen neuen
  AAB-Upload — also über ein getaggtes Release.

---

## Signieren & Ausliefern (Server, `wot-release`)

`build-on-tag` produziert **unsignierte** Artefakte. Signiert wird auf dem Server
(Schlüssel-Verwahrung):

```bash
cd ~/wot-release
docker compose run --rm signer       rls app-vX.Y.Z   # F-Droid + GitHub-Release (Obtainium)
docker compose run --rm play-publish rls app-vX.Y.Z   # Play internal
```

Beide prüfen die **Provenienz** vor dem Signieren (kanonischer build-on-tag-Lauf,
Tag-Commit, exakter Hash, OTA-Zustand). Details im `wot-release`-README.

> Das F-Droid-Repo liegt im wot-release-Kontext; die RLS-App wird mit demselben
> F-Droid-Schlüssel signiert und im selben Repo ausgeliefert wie WoT.

---

## Ein Release schneiden

1. **Arbeiten mit Conventional Commits** (`feat:`, `fix:`, `feat!:`). Pfad
   `apps/reference/**` → App-Komponente.
2. release-please hält eine **Release-PR** offen (Versionen + Changelog).
3. **Release-PR mergen** → App-Tag → `build-on-tag`.
4. **CI abwarten** (Artefakt `android-app-vX.Y.Z`).
5. **Auf dem Server signieren & ausliefern** (siehe oben).

---

## Rollback

- **OTA (Web-Layer, F-Droid):** `deploy-prototypes.yml` per `workflow_dispatch`
  mit `rollback_tag: ota-<sha>`.
- **Native App:** kein Downgrade (versionCode nur steigend) → Fix vorwärts,
  Patch-Release.
