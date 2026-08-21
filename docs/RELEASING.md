# Releasing

Wie aus einem Merge auf `master` veröffentlichte Artefakte werden — für **beide**
Ausgänge dieses Repos: die **npm-Pakete** (`@real-life-stack/*`, für externe
Konsumenten) und die **App** (Reference App, für Nutzer auf F-Droid / Play /
Obtainium).

Ein einziger Motor treibt beides: **release-please**. Er sammelt Conventional
Commits, hält *eine* Release-PR offen und erzeugt beim Merge die passenden Tags.
Strukturgleich zu web-of-trust.

---

## Das Gesamtbild

```
Merge auf master
  → release-please pflegt EINE Release-PR (Pakete + App, nach Conventional Commits)
  → du mergst sie:
       ├─ Paket-Tags  toolkit-v* / data-interface-v* / *-connector-v*  → publish.yml (Dispatch) → npm
       └─ App-Tag     app-vX.Y.Z                                        → build-on-tag (Dispatch) → CI
                                                                          baut APK (F-Droid) + AAB (Play)
                                                                          → Server signiert & liefert aus
```

Zwei Ausgänge aus einer PR, npm und App. Die App baut die Workspace-Pakete **aus
dem Quellcode** (`pnpm --filter … build`), nicht aus npm — sie wartet nie auf den
npm-Publish.

**Wichtig — Paket-Änderungen lösen einen App-Release aus.** Die Reference App
hängt via `workspace:*` an `data-interface`, `toolkit` und den Konnektoren; ein
`fix:`/`feat:` nur unter `packages/**` würde für sich genommen nur das Paket
bumpen. Damit die Änderung auch **Play** erreicht (Play hat kein OTA, updated nur
über ein getaggtes AAB), kaskadiert das release-please-Plugin **`node-workspace`**
den Bump auf jeden Dependent — also auf die App. Ergebnis: ein Paket-Fix, der in
die App kompiliert, erzeugt zuverlässig auch einen `app-v*`-Tag → nativen Build →
Play-Auslieferung.

> **Der Vertrag dahinter ist zerbrechlich** — `node-workspace` nimmt nur
> Komponenten mit aufgelöstem `release-type: node` in den Graphen; eine als
> `simple` konfigurierte App fällt still heraus, und ein root-relativer
> `extra-files`-Pfad bumpt die Versionsdatei nie. Beides ist in der CI sonst
> unsichtbar und kracht erst beim Release. Deshalb prüft
> **`scripts/release/test-release-cascade.mjs`** diese Invarianten bei jedem PR
> (Job `release-cascade` in `tests.yml`): Plugin aktiv, App und alle konsumierten
> Pakete sind `node`-Komponenten, `extra-files` zeigt auf die echte Datei,
> Versionen in Manifest / `package.json` / `version.properties` stimmen überein.
> Lokal: `node scripts/release/test-release-cascade.mjs`.

---

## Was wodurch ausgelöst wird

| Ereignis | Läuft |
|---|---|
| **Merge auf `master`** (App-/Paket-Pfade) | `deploy-prototypes.yml` → Web-App + **OTA**; `release-please.yml` → Release-PR |
| **Merge der Release-PR** | Tags entstehen → `publish.yml` (npm) + `build-on-tag` (App) per Dispatch |
| **`<paket>-v*`-Tag** | `publish.yml` (Dispatch aus release-please) → tgz + npm |
| **`app-v*`-Tag** | `build-on-tag` → APK + AAB als CI-Artefakt |

> **GITHUB_TOKEN-Tags triggern keine Workflows** (GitHub-Rekursionsschutz).
> Deshalb stößt `release-please.yml` `publish.yml` **und** `build-on-tag`
> ausdrücklich per `workflow_dispatch` an.

---

## Die npm-Pakete

Konfiguriert in `release-please-config.json` — **sechs** publizierbare Pakete:
`data-interface`, `toolkit`, `mock-connector`, `local-connector`, `wot-connector`,
`supabase-connector`.

1. Conventional Commits unter `packages/<x>/**` bumpen das jeweilige Paket.
2. Merge der Release-PR → Tag `<component>-vX.Y.Z` (z. B. `toolkit-v0.1.1`).
3. `release-please.yml` (Job `trigger-publish`) dispatcht `publish.yml` pro
   released Paket.
4. `publish.yml` macht **zwei** Dinge: tgz-Assets ans GitHub-Release (Tarball-Weg)
   **und** npm via **Trusted Publishing (OIDC)** — kein Token im Repo. `pnpm pack`
   löst `workspace:*` auf die konkrete Version auf, npm-Paket und Asset sind
   byte-identisch.

### ⚠️ Einmalige npm-Einrichtung pro Paket (Henne-Ei)

Trusted Publishing kann **nicht** von Anfang an greifen: npm lässt einen Trusted
Publisher erst konfigurieren, wenn das Paket **schon existiert** — die Einstellung
hängt an der Paketseite. Ein nie publiziertes Paket lässt sich also nicht per OIDC
publizieren. Die Reihenfolge ist deshalb zwingend:

1. **Org/Scope**: Die npm-Org muss zum Scope passen. `@real-life-stack/*` verlangt
   die Org **`real-life-stack`** — nicht `real-life`. (Scopes sind an den
   Org-Namen gebunden.)
2. **Erst-Publish von Hand**, einmal pro Paket, mit normaler npm-Session:
   ```bash
   npm login                                    # Mitglied der Org real-life-stack
   scripts/release/bootstrap-npm-publish.sh --dry-run
   scripts/release/bootstrap-npm-publish.sh
   ```
   Das Skript überspringt bereits publizierte Pakete, baut in
   Abhängigkeitsreihenfolge und publiziert den `pnpm pack`-Tarball — exakt so, wie
   es `publish.yml` später tut.
3. **Trusted Publisher eintragen**, einmal pro Paket:
   `npmjs.com/package/@real-life-stack/<name>` → *Settings → Trusted publishing* →
   Repository `real-life-org/real-life-stack`, Workflow `publish.yml`.
   (Das Skript gibt am Ende die direkten Links aus.)

Ab dann läuft jeder Publish über die CI, ohne Token im Repo.

**Solange Schritt 2/3 für ein Paket fehlt**, schlägt bei dessen Release nur der
**npm-Step** fehl; der tgz-Asset-Upload ans GitHub-Release gelingt trotzdem. Kein
Datenverlust — aber „kein Teil-Publish" gilt nur **pro Paket**:

- **Je Paket atomar:** `npm publish` landet eine Version ganz oder gar nicht. Ein
  halb publiziertes Paket gibt es nicht.
- **Über mehrere Pakete hinweg nicht:** ein Release kann mittendrin stehen
  bleiben. In der CI bekommt jedes Paket seinen eigenen `publish.yml`-Lauf — die
  einen werden grün, die anderen rot. Der Bootstrap publiziert sequenziell, ein
  Abbruch beim vierten Paket lässt die ersten drei publiziert zurück.
- **Und das bleibt so:** npm-Publishes sind praktisch irreversibel (kein
  Unpublish für eine veröffentlichte Version). Ein misslungener Sammel-Release
  wird nach vorne repariert — fehlende Pakete nachziehen, nicht zurückrollen.

> Diese Schleife gilt für **jedes künftig neu angelegte Paket**, nicht nur für den
> Erstaufbau. Deshalb liegt das Bootstrap-Skript im Repo.

---

## Die App

### Version & versionCode

`apps/reference/android/version.properties` führt **nur** den Semver-Namen:

```properties
# x-release-please-start-version
VERSION_NAME=0.2.2
# x-release-please-end
```

Der Android-`versionCode` wird **deterministisch abgeleitet** (`build.gradle` +
`build-android.sh`, dieselbe Formel):

```
versionCode = major * 10000 + minor * 100 + patch
0.2.2 → 202   0.2.3 → 203   0.3.0 → 300   1.0.0 → 10000
```

Monoton, solange minor/patch < 100. release-please muss so nur den **Namen**
führen. Einmaliger, unkritischer Sprung 4 → 203 beim nächsten Release.

### Zwei Kanäle, zwei Web-Builds

`build-on-tag` baut **zwei** Bundles (siehe `scripts/release/build-android.sh`):

| Artefakt | Web-Build | OTA | signiert mit |
|---|---|---|---|
| **APK** (F-Droid + Obtainium) | `VITE_UPDATE_CHANNEL=android-foss` | **an** | F-Droid-Key |
| **AAB** (Play) | `VITE_UPDATE_CHANNEL=__local__` | **aus** | Play-Upload-Key |

Ein **OTA-Sentinel** erzwingt die Trennung. Google verbietet Self-Updates
außerhalb seines Mechanismus. RLS schaltet OTA über den Kanal `__local__` ab
(`live-update.ts`: `LiveUpdate.reset()` + return); der Minifier faltet den String
weg, daher prüft der Sentinel nur `android-foss`.

### Konsequenz

- **F-Droid-Nutzer** bekommen Web-Änderungen bei **jedem Merge** per OTA
  (`deploy-prototypes.yml`, Kanal `android-foss`).
- **Play-Nutzer** bekommen **kein** OTA — sie updaten nur über einen neuen
  AAB-Upload, also über ein getaggtes Release.

### Signieren & Ausliefern (Server, `wot-release`)

`build-on-tag` produziert **unsignierte** Artefakte. Signiert wird auf dem Server
(Schlüssel-Verwahrung):

```bash
cd ~/wot-release
docker compose run --rm signer       rls app-vX.Y.Z   # F-Droid + GitHub-Release (Obtainium)
docker compose run --rm play-publish rls app-vX.Y.Z   # Play internal
```

Beide prüfen die **Provenienz** vor dem Signieren (kanonischer build-on-tag-Lauf,
Tag-Commit, exakter Hash, OTA-Zustand). Details im `wot-release`-README.

---

## Ein Release schneiden

1. **Arbeiten mit Conventional Commits** (`feat:`, `fix:`, `feat!:`). Der Pfad
   bestimmt die Komponente: `apps/reference/**` → App, `packages/toolkit/**` →
   toolkit, usw.
2. release-please hält eine **Release-PR** offen (Versionen + Changelogs).
3. **Release-PR mergen** → Tags entstehen → npm-Publish (Pakete) + `build-on-tag`
   (App).
4. Für die App: **CI abwarten** (`android-app-vX.Y.Z`), dann **auf dem Server
   signieren & ausliefern** (siehe oben).

---

## Rollback

- **OTA (Web-Layer, F-Droid):** `deploy-prototypes.yml` per `workflow_dispatch`
  mit `rollback_tag: ota-<sha>`.
- **Native App:** kein Downgrade (versionCode nur steigend) → Fix vorwärts,
  Patch-Release.
- **npm:** `npm deprecate` / neue Patch-Version. Kein Unpublish.
