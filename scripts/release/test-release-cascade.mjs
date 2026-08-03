#!/usr/bin/env node
// Regressionstest fuer die Package→App-Releasekaskade.
//
// WARUM ES DEN GIBT: Play hat bewusst KEIN OTA (Google verbietet Self-Updates
// ausserhalb seines Mechanismus). Ein Fix in toolkit, data-interface oder einem Konnektor erreicht
// Play daher NUR, wenn er einen App-Release ausloest. Das haengt an einem
// Vertrag, den man beim Editieren der release-please-Config leicht bricht —
// beides ist in PR #199 passiert und war in der CI unsichtbar:
//   1. Die App stand auf release-type "simple". Der offizielle
//      node-workspace-Code (NodeWorkspace.buildAllPackages/inScope) verwirft JEDE
//      Komponente mit releaseType !== "node", BEVOR er package.json liest. Die
//      App war damit nie im Dependency-Graphen — die Kaskade lief ins Leere, ein
//      core-Fix haette Play nie erreicht.
//   2. extra-files-Pfade sind RELATIV zur Komponente. "apps/reference/android/
//      version.properties" wurde zu "apps/reference/apps/reference/..." und (weil Generic
//      createIfMissing: false nutzt) still uebersprungen: der Tag waere
//      gestiegen, die Versionsdatei nicht — build-android.sh bricht dann wegen
//      genau dieser Drift ab.
//
// Was er NICHT ist: ein End-to-End-release-please-Lauf (braucht Netz + Token und
// waere flaky). Er prueft die Invarianten, aus denen die Kaskade folgt. Der
// End-to-End-Nachweis wurde einmalig per Dry-Run gefuehrt: Baseline-Tag mit allen
// Migrations-Aenderungen, danach als einziger Commit ein Paket-fix → release-please
// baut trotzdem einen apps/reference-Kandidaten.
//
// Schwester: web-of-trust/scripts/release/test-release-cascade.mjs (gleicher
// Vertrag, gleiche Pruefungen).
//
// Aufruf:  node scripts/release/test-release-cascade.mjs
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const read = (p) => readFileSync(join(ROOT, p), 'utf8')
const readJson = (p) => JSON.parse(read(p))

let failed = 0
const ok = (msg) => console.log(`  ok   ${msg}`)
const fail = (msg) => { console.log(`  FAIL ${msg}`); failed++ }
const check = (cond, msg, detail = '') => cond ? ok(msg) : fail(`${msg}${detail ? ` — ${detail}` : ''}`)

const config = readJson('release-please-config.json')
const manifest = readJson('.release-please-manifest.json')
const packages = config.packages ?? {}

// release-please defaultet auf "node", wenn kein release-type gesetzt ist.
// Fuer den node-workspace-Graphen zaehlt genau dieser aufgeloeste Wert.
const resolvedType = (path) => packages[path]?.['release-type'] ?? 'node'

// Die App-Komponente finden: die mit component "app" (→ Tag app-v*).
const appPath = Object.keys(packages).find((p) => packages[p].component === 'app')

console.log('== Kaskaden-Vertrag: node-workspace ==')
check(
  Array.isArray(config.plugins) && config.plugins.includes('node-workspace'),
  'Plugin node-workspace aktiv',
  `plugins=${JSON.stringify(config.plugins ?? null)}`,
)
check(!!appPath, 'App-Komponente (component "app") konfiguriert')

if (!appPath) {
  console.log('\nOhne App-Komponente sind die weiteren Pruefungen sinnlos.')
  process.exit(1)
}

check(
  resolvedType(appPath) === 'node',
  `App (${appPath}) ist im node-workspace-Graphen (release-type node)`,
  `aufgeloest: "${resolvedType(appPath)}" — node-workspace verwirft alles != node`,
)

console.log('\n== Jede konsumierte workspace:*-Abhaengigkeit ist eine node-Komponente ==')
// Nur so kaskadiert ein Bump DIESES Pakets auf die App. Faengt auch den Fall
// "neue Workspace-Dependency ergaenzt, aber nicht als Komponente eingetragen".
const appPkg = readJson(join(appPath, 'package.json'))
const deps = { ...(appPkg.dependencies ?? {}), ...(appPkg.devDependencies ?? {}) }
const workspaceDeps = Object.entries(deps)
  .filter(([, spec]) => String(spec).startsWith('workspace:'))
  .map(([name]) => name)

check(workspaceDeps.length > 0, 'App hat workspace:*-Abhaengigkeiten', 'keine gefunden?')

// Komponentenpfad je Paketname (ueber dessen package.json).
const componentByName = new Map()
for (const p of Object.keys(packages)) {
  const pj = join(p, 'package.json')
  if (existsSync(join(ROOT, pj))) componentByName.set(readJson(pj).name, p)
}

for (const dep of workspaceDeps) {
  const path = componentByName.get(dep)
  if (!path) {
    fail(`${dep} ist KEINE release-please-Komponente — ein Fix dort kaskadiert nicht auf die App`)
    continue
  }
  check(resolvedType(path) === 'node', `${dep} (${path}) ist node`, `aufgeloest: "${resolvedType(path)}"`)
}

console.log('\n== extra-files verdrahtet GENAU die Versionsdatei (package-relativ) ==')
// FAIL-CLOSED: es reicht NICHT, dass irgendein extra-files-Ziel existiert. Zeigte
// der Eintrag z.B. auf package.json (existiert ja), bliebe der Test gruen,
// waehrend version.properties nie gebumpt wird — der Tag stiege, die Datei nicht,
// und build-android.sh braeche an genau dieser Drift ab.
const VERSION_FILE_REL = 'android/version.properties' // app-relativ, NICHT root-relativ
const extras = packages[appPath]['extra-files']
check(Array.isArray(extras) && extras.length > 0, 'App hat extra-files')

// String-Kurzform und {type,path}-Objekt sind beide zulaessig — aber der Pfad
// muss ein String sein, sonst ignoriert release-please den Eintrag stillschweigend.
const relOf = (e) => (typeof e === 'string' ? e : e && typeof e.path === 'string' ? e.path : null)
for (const e of extras ?? []) {
  check(relOf(e) !== null, 'extra-files-Eintrag hat einen gueltigen String-Pfad', JSON.stringify(e))
}

const vpEntry = (extras ?? []).find((e) => relOf(e) === VERSION_FILE_REL)
check(
  !!vpEntry,
  `extra-files enthaelt exakt "${VERSION_FILE_REL}"`,
  `gefunden: ${JSON.stringify((extras ?? []).map(relOf))} — der Pfad muss RELATIV zur Komponente sein`,
)
check(
  !!vpEntry && (typeof vpEntry === 'string' || vpEntry.type === 'generic'),
  `Eintrag "${VERSION_FILE_REL}" hat type "generic"`,
  `type=${vpEntry && typeof vpEntry === 'object' ? vpEntry.type : '(fehlt)'}`,
)

console.log('\n== Versionen konsistent (Manifest / package.json / version.properties) ==')
// Driftet eins davon, bumpt release-please etwas anderes als gebaut/getaggt wird.
for (const [path, version] of Object.entries(manifest)) {
  const pjPath = join(path, 'package.json')
  if (!existsSync(join(ROOT, pjPath))) { fail(`${path}: package.json fehlt`); continue }
  const pj = readJson(pjPath)
  check(pj.version === version, `${path}: package.json ${pj.version} == Manifest ${version}`)
}

// FAIL-CLOSED und unbedingt: frueher hing dieser ganze Block an `if (vpRel)` —
// fehlte der Eintrag, entfiel die Pruefung stillschweigend.
const vpPath = join(appPath, VERSION_FILE_REL)
const vpExists = existsSync(join(ROOT, vpPath))
check(vpExists, `${vpPath} existiert`)

if (vpExists) {
  const lines = read(vpPath).split('\n')
  const versionIdx = lines.findIndex((l) => /^VERSION_NAME=/.test(l))
  check(versionIdx !== -1, 'version.properties enthaelt VERSION_NAME')

  // Die Blockmarker sind KEIN Kommentar-Schmuck: ohne sie findet der
  // Generic-Updater nichts zu ersetzen und laesst die Datei unveraendert — der
  // Tag stiege, VERSION_NAME bliebe stehen, build-android.sh braeche an der Drift
  // ab. Genau der App-Bump, den dieser Test schuetzen soll, fiele still aus.
  const startIdx = lines.findIndex((l) => l.includes('x-release-please-start-version'))
  const endIdx = lines.findIndex((l) => l.includes('x-release-please-end'))
  const inlineIdx = lines.findIndex((l) => /x-release-please-version\b/.test(l))
  const inBlock = startIdx !== -1 && endIdx !== -1 && versionIdx > startIdx && versionIdx < endIdx
  // Inline-Variante: Annotation auf derselben oder der direkt vorangehenden Zeile.
  const inline = inlineIdx !== -1 && (inlineIdx === versionIdx || inlineIdx === versionIdx - 1)
  check(
    inBlock || inline,
    'VERSION_NAME liegt in einem release-please-Marker (Block oder inline)',
    'ohne Marker bumpt der Generic-Updater die Datei NIE',
  )

  if (versionIdx !== -1) {
    const v = lines[versionIdx].slice('VERSION_NAME='.length).trim()
    check(v === manifest[appPath], `version.properties ${v} == Manifest ${manifest[appPath]}`)
    // Derselbe Vertrag wie build.gradle/build-android.sh: exakt major.minor.patch,
    // minor/patch < 100 (sonst kollidiert 0.1.100 mit 0.2.0).
    const sv = v.match(/^(\d+)\.(\d+)\.(\d+)$/)
    check(!!sv, `VERSION_NAME "${v}" ist exakt major.minor.patch`)
    if (sv) {
      check(
        Number(sv[2]) < 100 && Number(sv[3]) < 100,
        'versionCode-Formel gueltig (minor/patch < 100)',
      )
    }
  }
}

console.log(
  failed === 0
    ? '\nAlle Kaskaden-Invarianten erfuellt.'
    : `\n${failed} Verletzung(en) — die Package→App-Kaskade traegt so NICHT.`,
)
process.exit(failed === 0 ? 0 : 1)
