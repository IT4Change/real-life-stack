#!/usr/bin/env node
// Regressionstest fuer die Package→App-Releasekaskade (Issue #202).
//
// WARUM ES DEN GIBT: Play hat bewusst KEIN OTA. Ein Fix in einem Workspace-Paket
// erreicht Play daher nur, wenn er einen App-Release ausloest. Das haengt an
// einem Vertrag, den man beim Editieren der Config leicht bricht — genau das ist
// in PR #199 zweimal passiert:
//   1. App stand auf release-type "simple". Der offizielle node-workspace-Code
//      (NodeWorkspace.buildAllPackages/inScope) verwirft JEDE Komponente mit
//      releaseType !== "node", BEVOR er package.json liest. Die App war also nie
//      im Dependency-Graphen, die Kaskade lief ins Leere.
//   2. extra-files-Pfade sind RELATIV zur Komponente. "apps/reference/android/
//      version.properties" wurde zu "apps/reference/apps/reference/..." und
//      (createIfMissing: false) still uebersprungen — der Tag waere gestiegen,
//      die Datei nicht.
// Beide Fehler waren in der CI unsichtbar und haetten erst beim echten Release
// gekracht. Dieser Test macht sie sichtbar.
//
// Was er NICHT ist: ein End-to-End-release-please-Lauf (braucht Netz + Token und
// waere flaky). Er prueft die Invarianten, aus denen die Kaskade folgt. Der
// End-to-End-Nachweis wurde einmalig per Dry-Run gefuehrt (Baseline-Tag, danach
// nur ein Paket-Commit → App-Kandidat entsteht).
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

console.log('\n== extra-files zeigt auf die echte Versionsdatei (package-relativ!) ==')
// Blocker 2 aus #199: ein root-relativer Pfad wird mit dem Komponentenpfad
// praefigiert und laeuft dann ins Leere — der Tag stiege, die Datei nicht.
const extras = packages[appPath]['extra-files'] ?? []
check(extras.length > 0, 'App hat extra-files (version.properties)')
for (const extra of extras) {
  const rel = typeof extra === 'string' ? extra : extra.path
  const resolved = join(appPath, rel)
  check(
    existsSync(join(ROOT, resolved)),
    `extra-files "${rel}" loest auf ${resolved} auf und existiert`,
    'Pfad muss RELATIV zur Komponente sein (nicht nochmal den Komponentenpfad enthalten)',
  )
}

console.log('\n== Versionen konsistent (Manifest / package.json / version.properties) ==')
// Driftet eins davon, bumpt release-please etwas anderes als gebaut/getaggt wird.
for (const [path, version] of Object.entries(manifest)) {
  const pjPath = join(path, 'package.json')
  if (!existsSync(join(ROOT, pjPath))) { fail(`${path}: package.json fehlt`); continue }
  const pj = readJson(pjPath)
  check(pj.version === version, `${path}: package.json ${pj.version} == Manifest ${version}`)
}

const vpRel = (extras.map((e) => (typeof e === 'string' ? e : e.path)) ?? [])
  .find((p) => p.endsWith('version.properties'))
if (vpRel) {
  const vpPath = join(appPath, vpRel)
  if (existsSync(join(ROOT, vpPath))) {
    const m = read(vpPath).match(/^VERSION_NAME=(.+)$/m)
    check(!!m, 'version.properties enthaelt VERSION_NAME')
    if (m) {
      check(
        m[1].trim() === manifest[appPath],
        `version.properties ${m[1].trim()} == Manifest ${manifest[appPath]}`,
      )
      // Derselbe Vertrag wie build.gradle/build-android.sh: exakt major.minor.patch,
      // minor/patch < 100 (sonst kollidiert 0.1.100 mit 0.2.0).
      const sv = m[1].trim().match(/^(\d+)\.(\d+)\.(\d+)$/)
      check(!!sv, `VERSION_NAME "${m[1].trim()}" ist exakt major.minor.patch`)
      if (sv) {
        check(
          Number(sv[2]) < 100 && Number(sv[3]) < 100,
          'versionCode-Formel gueltig (minor/patch < 100)',
        )
      }
    }
  }
}

console.log(
  failed === 0
    ? '\nAlle Kaskaden-Invarianten erfuellt.'
    : `\n${failed} Verletzung(en) — die Package→App-Kaskade traegt so NICHT.`,
)
process.exit(failed === 0 ? 0 : 1)
