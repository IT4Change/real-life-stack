#!/usr/bin/env node
// Selbsttest fuer test-release-cascade.mjs — verankert die Negativfaelle.
//
// WARUM: Ein Waechter, der nur auf der heilen Konfiguration gruen ist, beweist
// nichts. Genau das war der Befund am ersten Wurf: der Checker lief auch bei
// falsch verdrahteten extra-files und fehlenden release-please-Markern durch. Die
// Mutationen wurden danach zwar von Hand nachgewiesen — von Hand heisst: beim
// naechsten Umbau prueft sie niemand mehr.
//
// Dieser Selbsttest baut ein minimales, gueltiges Fixture-Repo, laesst den
// Checker darauf los (muss GRUEN sein) und mutiert es dann pro Fall gezielt
// kaputt (muss jeweils ROT werden). Der Checker haengt dafuer per
// RELEASE_CASCADE_ROOT an den Fixture-Baum statt an dieses Repo.
//
// Aufruf:  node scripts/release/test-release-cascade.selftest.mjs
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const HERE = dirname(fileURLToPath(import.meta.url))
const CHECKER = join(HERE, 'test-release-cascade.mjs')

// --------------------------------------------------------------- Fixture-Bau
// Bewusst minimal, aber strukturgleich zum echten Repo: eine App-Komponente mit
// component "app", ein konsumiertes Workspace-Paket, Marker in der Versionsdatei.
const VALID = () => ({
  'release-please-config.json': {
    packages: {
      'packages/core': { 'package-name': '@scope/core' },
      'apps/demo': {
        'release-type': 'node',
        component: 'app',
        'include-component-in-tag': true,
        'extra-files': [{ type: 'generic', path: 'android/version.properties' }],
      },
    },
    plugins: ['node-workspace'],
  },
  '.release-please-manifest.json': { 'packages/core': '1.0.0', 'apps/demo': '0.2.7' },
  'apps/demo/package.json': {
    name: 'demo',
    private: true,
    version: '0.2.7',
    dependencies: { '@scope/core': 'workspace:*' },
  },
  'packages/core/package.json': { name: '@scope/core', version: '1.0.0' },
  'apps/demo/android/version.properties':
    '# x-release-please-start-version\nVERSION_NAME=0.2.7\n# x-release-please-end\n',
})

function buildFixture(mutate) {
  const files = VALID()
  if (mutate) mutate(files)
  const root = mkdtempSync(join(tmpdir(), 'cascade-fixture-'))
  for (const [rel, content] of Object.entries(files)) {
    if (content === null) continue // "Datei fehlt"-Faelle
    const abs = join(root, rel)
    mkdirSync(dirname(abs), { recursive: true })
    writeFileSync(abs, typeof content === 'string' ? content : JSON.stringify(content, null, 2))
  }
  return root
}

function runChecker(root) {
  const r = spawnSync(process.execPath, [CHECKER], {
    env: { ...process.env, RELEASE_CASCADE_ROOT: root },
    encoding: 'utf8',
  })
  return { code: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` }
}

// ------------------------------------------------------------------ Faelle
// Jeder Fall bricht GENAU eine Invariante. Erwartung: der Checker wird rot.
const MUTATIONS = [
  ['App auf release-type simple (faellt aus dem node-workspace-Graphen)', (f) => {
    f['release-please-config.json'].packages['apps/demo']['release-type'] = 'simple'
  }],
  ['Plugin node-workspace entfernt', (f) => {
    delete f['release-please-config.json'].plugins
  }],
  ['Konsumiertes Paket ist keine Komponente', (f) => {
    delete f['release-please-config.json'].packages['packages/core']
    delete f['.release-please-manifest.json']['packages/core']
  }],
  ['extra-files zeigt auf package.json (existiert, aber falsches Ziel)', (f) => {
    f['release-please-config.json'].packages['apps/demo']['extra-files'] = [
      { type: 'generic', path: 'package.json' },
    ]
  }],
  ['extra-files ganz entfernt', (f) => {
    delete f['release-please-config.json'].packages['apps/demo']['extra-files']
  }],
  ['extra-files type ist nicht generic', (f) => {
    f['release-please-config.json'].packages['apps/demo']['extra-files'] = [
      { type: 'json', path: 'android/version.properties' },
    ]
  }],
  ['extra-files-Eintrag ohne String-Pfad', (f) => {
    f['release-please-config.json'].packages['apps/demo']['extra-files'] = [
      { type: 'generic' },
      { type: 'generic', path: 'android/version.properties' },
    ]
  }],
  ['release-please-Marker entfernt', (f) => {
    f['apps/demo/android/version.properties'] = 'VERSION_NAME=0.2.7\n'
  }],
  ['Blockmarker unvollstaendig (nur -end)', (f) => {
    f['apps/demo/android/version.properties'] = 'VERSION_NAME=0.2.7\n# x-release-please-end\n'
  }],
  ['VERSION_NAME liegt ausserhalb des Blocks', (f) => {
    f['apps/demo/android/version.properties'] =
      'VERSION_NAME=0.2.7\n# x-release-please-start-version\n# x-release-please-end\n'
  }],
  ['version.properties fehlt', (f) => {
    f['apps/demo/android/version.properties'] = null
  }],
  ['version.properties driftet vom Manifest', (f) => {
    f['apps/demo/android/version.properties'] =
      '# x-release-please-start-version\nVERSION_NAME=0.9.9\n# x-release-please-end\n'
  }],
  ['package.json driftet vom Manifest', (f) => {
    f['apps/demo/package.json'].version = '9.9.9'
  }],
  ['VERSION_NAME ist kein major.minor.patch', (f) => {
    f['apps/demo/android/version.properties'] =
      '# x-release-please-start-version\nVERSION_NAME=0.2\n# x-release-please-end\n'
    f['.release-please-manifest.json']['apps/demo'] = '0.2'
    f['apps/demo/package.json'].version = '0.2'
  }],
  ['versionCode-Formel gebrochen (minor >= 100)', (f) => {
    f['apps/demo/android/version.properties'] =
      '# x-release-please-start-version\nVERSION_NAME=0.100.0\n# x-release-please-end\n'
    f['.release-please-manifest.json']['apps/demo'] = '0.100.0'
    f['apps/demo/package.json'].version = '0.100.0'
  }],
  ['keine App-Komponente (component "app" fehlt)', (f) => {
    delete f['release-please-config.json'].packages['apps/demo'].component
  }],
]

let failed = 0
const roots = []
const cleanup = () => roots.forEach((r) => rmSync(r, { recursive: true, force: true }))
process.on('exit', cleanup)

console.log('== Positivfall: gueltiges Fixture muss GRUEN sein ==')
{
  const root = buildFixture(null)
  roots.push(root)
  const { code, out } = runChecker(root)
  if (code === 0) {
    console.log('  ok   gueltiges Fixture → Exit 0')
  } else {
    failed++
    console.log('  FAIL gueltiges Fixture wurde ROT — der Checker ist zu streng oder das Fixture falsch')
    console.log(out.split('\n').filter((l) => l.includes('FAIL')).map((l) => `       ${l}`).join('\n'))
  }
}

console.log('\n== Negativfaelle: jede Verletzung muss ROT werden ==')
for (const [label, mutate] of MUTATIONS) {
  const root = buildFixture(mutate)
  roots.push(root)
  const { code } = runChecker(root)
  if (code !== 0) {
    console.log(`  ok   ${label} → ROT`)
  } else {
    failed++
    console.log(`  FAIL ${label} → blieb GRUEN (fail-open!)`)
  }
}

console.log(
  failed === 0
    ? `\nSelbsttest bestanden: 1 Positiv- und ${MUTATIONS.length} Negativfaelle verhalten sich korrekt.`
    : `\n${failed} Fall/Faelle falsch — der Waechter schuetzt seinen Vertrag nicht zuverlaessig.`,
)
process.exit(failed === 0 ? 0 : 1)
