import { test } from '@playwright/test'
import { createFreshContext, createIdentity, recoverIdentity, waitForRelayConnected } from './helpers/common'
import { navigateToKanban } from './helpers/kanban'
import { resetServerState } from './helpers/reset-servers'

/**
 * Messlauf für #265 — Erstsynchronisation auf einem neuen Gerät.
 *
 * Kein Assertion-Test: der Lauf seedet N Spaces mit je M Items auf Gerät 1,
 * meldet sich mit demselben Seed auf Gerät 2 an und protokolliert, wann was
 * ankommt. Ausgabe ist eine Zeitleiste auf stdout.
 *
 *   MEASURE_SPACES=5 MEASURE_ITEMS=5 pnpm exec playwright test first-sync-measure
 */

const SPACES = Number(process.env.MEASURE_SPACES ?? 5)
const ITEMS = Number(process.env.MEASURE_ITEMS ?? 5)
const POLL_MS = 250
const OBSERVE_MS = Number(process.env.MEASURE_OBSERVE_MS ?? 90_000)

interface Sample {
  t: number
  relay: boolean
  /** Spaces, die die PersonalDoc kennt (Metadaten). */
  metaSpaces: number
  /** Space-Dokumente, für die der Adapter schon einen Ladevorgang gemeldet hat. */
  loadedSpaces: number
  docBytes: number
  /** Im DOM sichtbare geseedete Items. */
  visibleItems: number
}

/**
 * Eine Aufgabe über den FAB anlegen. Der Kanban-Helper in helpers/kanban.ts
 * klickt noch einen "Task"-Button, den es seit dem Composer-Umbau nicht mehr
 * gibt — hier der aktuelle Weg (FAB → Composer → Erstellen).
 */
async function seedTask(page: import('@playwright/test').Page, title: string): Promise<void> {
  await page.getByRole('button', { name: 'Aufgabe erstellen' }).click()
  const titleInput = page.getByPlaceholder('Titel')
  await titleInput.waitFor({ timeout: 15_000 })
  await titleInput.fill(title)
  await page.getByRole('button', { name: 'Erstellen', exact: true }).click()
  await page.waitForTimeout(500)
}

async function sample(page: import('@playwright/test').Page): Promise<Sample | null> {
  return page.evaluate(() => {
    const fn = (window as unknown as { wotDebug?: () => unknown }).wotDebug
    if (typeof fn !== 'function') return null
    const d = fn() as {
      spaces: { spaceId: string; name: string | null; loadSource: string | null; loadTimeMs: number | null; docSizeBytes: number }[]
      sync: { relay: { connected: boolean } }
      automerge: { docStats: { spaces: number } }
    }
    const text = document.body.innerText
    return {
      t: Date.now(),
      relay: d.sync.relay.connected,
      metaSpaces: d.automerge.docStats.spaces,
      loadedSpaces: d.spaces.length,
      docBytes: d.spaces.reduce((sum, s) => sum + (s.docSizeBytes ?? 0), 0),
      visibleItems: (text.match(/G\d+-T\d+/g) ?? []).length,
    }
  })
}

test.describe('Erstsync-Messung (#265)', () => {
  // Werkzeug, kein Wächter: nur auf Zuruf, sonst kostet jeder E2E-Lauf die
  // volle Seed-Zeit für Zahlen, die niemand liest.
  test.skip(!process.env.MEASURE_FIRST_SYNC, 'Messlauf — mit MEASURE_FIRST_SYNC=1 starten')
  // Ohne Action-Timeout hängt ein danebengreifender Klick bis zum Test-Timeout.
  test.use({ actionTimeout: 20_000 })
  test.beforeEach(async () => { await resetServerState() })

  test(`Zeitleiste: ${SPACES} Spaces x ${ITEMS} Items auf einem neuen Gerät`, async ({ browser }) => {
    test.setTimeout(20 * 60_000)

    const { context: d1Ctx, page: d1 } = await createFreshContext(browser)
    const { context: d2Ctx, page: d2 } = await createFreshContext(browser)

    try {
      const seedStart = Date.now()
      const step = (msg: string) => console.log(`[mess ${Math.round((Date.now() - seedStart) / 1000)}s] ${msg}`)
      d1.on('pageerror', (e) => console.log(`[d1 pageerror] ${e.message}`))
      step('Identität wird angelegt')
      const { mnemonic } = await createIdentity(d1, { name: 'Mess-Alice', passphrase: 'alice123pw' })
      step('Identität steht')
      await waitForRelayConnected(d1)

      for (let i = 1; i <= SPACES; i++) {
        step(`Gruppe ${i} wird angelegt`)
        // Eigener Switcher-Griff: der Kanban-Helper kennt nur "Mein Netzwerk"
        // als Trigger-Text, ab der zweiten Gruppe steht dort ein Gruppenname.
        const trigger = d1.getByRole('button').filter({ hasText: /Mein Netzwerk|Gruppe \d+|Space wählen/ }).first()
        await trigger.click({ timeout: 20_000 })
        await d1.getByText('Neue Gruppe erstellen').click({ timeout: 20_000 })
        const nameInput = d1.getByPlaceholder('z.B. Nachbarschaft, Projekt-Team...')
        await nameInput.waitFor({ timeout: 10_000 })
        await nameInput.fill(`Gruppe ${i}`)
        await d1.getByRole('button', { name: /Erstellen/ }).click()
        await d1.waitForTimeout(1500)

        await navigateToKanban(d1)
        for (let j = 1; j <= ITEMS; j++) {
          await seedTask(d1, `G${i}-T${j}`)
        }
        step(`Gruppe ${i} fertig geseedet`)
      }
      // Log-Sync + Compact-Flush abwarten
      await d1.waitForTimeout(10_000)
      const seedMs = Date.now() - seedStart
      const seedSnapshot = await sample(d1)

      // ---- Gerät 2 ----------------------------------------------------------
      const timeline: Sample[] = []
      const events: string[] = []
      const t0 = Date.now()
      d2.on('console', (m) => {
        const text = m.text()
        if (/persistence|catch|sync|space|blocked|key/i.test(text)) {
          events.push(`+${Date.now() - t0}ms ${text}`)
        }
      })

      await recoverIdentity(d2, { mnemonic, passphrase: 'alice-d2-pw' })
      const tRecovered = Date.now() - t0
      console.log(`\n[mess] Login abgeschlossen nach ${tRecovered}ms`)

      // In die Übersicht ("Mein Netzwerk") + Kanban wechseln: dort laufen die
      // Items aller Spaces zusammen, das ist der ehrlichste Inhalts-Indikator.
      await d2.getByRole('button').filter({ hasText: /Mein Netzwerk|Gruppe \d+|Space wählen/ }).first().click()
      await d2.getByRole('menuitem', { name: /Mein Netzwerk/ }).click()
      await d2.getByRole('button', { name: 'Kanban' }).click()
      const tOverview = Date.now() - t0
      console.log(`[mess] Übersicht/Kanban offen nach ${tOverview}ms`)

      const deadline = Date.now() + OBSERVE_MS
      let last = ''
      while (Date.now() < deadline) {
        const s = await sample(d2)
        if (s) {
          timeline.push({ ...s, t: s.t - t0 })
          const key = `${s.relay}|${s.metaSpaces}|${s.loadedSpaces}|${s.visibleItems}`
          if (key !== last) {
            last = key
            console.log(
              `[mess] +${String(s.t - t0).padStart(6)}ms  relay=${s.relay ? 'ja ' : 'nein'}` +
              `  meta=${s.metaSpaces}/${SPACES}  docs=${s.loadedSpaces}/${SPACES}` +
              `  bytes=${s.docBytes}  items=${s.visibleItems}/${SPACES * ITEMS}`,
            )
          }
          if (s.visibleItems >= SPACES * ITEMS) break
        }
        await d2.waitForTimeout(POLL_MS)
      }

      const detail = await d2.evaluate(() => {
        const fn = (window as unknown as { wotDebug?: () => unknown }).wotDebug
        return typeof fn === 'function' ? (fn() as { spaces: unknown[] }).spaces : []
      })

      console.log('\n===== Erstsync-Messung #265 =====')
      console.log(`Seed: ${SPACES} Spaces x ${ITEMS} Items in ${Math.round(seedMs / 1000)}s (Gerät 1)`)
      console.log(`Gerät 1 nach dem Seeden:`, JSON.stringify(seedSnapshot))
      console.log(`Gerät 2 Login fertig: +${tRecovered}ms`)
      const firstMeta = timeline.find((s) => s.metaSpaces > 0)
      const allMeta = timeline.find((s) => s.metaSpaces >= SPACES)
      const firstItem = timeline.find((s) => s.visibleItems > 0)
      const allItems = timeline.find((s) => s.visibleItems >= SPACES * ITEMS)
      console.log(`erste Space-Metadaten: ${firstMeta ? '+' + firstMeta.t + 'ms' : 'nie'}`)
      console.log(`alle Space-Metadaten:  ${allMeta ? '+' + allMeta.t + 'ms' : 'nie'}`)
      console.log(`erstes Item sichtbar:  ${firstItem ? '+' + firstItem.t + 'ms' : 'nie'}`)
      console.log(`alle Items sichtbar:   ${allItems ? '+' + allItems.t + 'ms' : 'nie'}`)
      console.log('Space-Details:', JSON.stringify(detail, null, 2))
      const restoreRuns = events.filter((e) => e.includes('restoreSpacesFromMetadata')).length
      const blocked = events.filter((e) => e.includes('remains blocked')).length
      console.log(`restoreSpacesFromMetadata-Läufe: ${restoreRuns}`)
      console.log(`capability-blockierte Catch-ups:  ${blocked}`)
      console.log('--- Adapter-Ereignisse ---')
      for (const e of events) console.log(e)
      console.log('=================================\n')
    } finally {
      await d1Ctx.close()
      await d2Ctx.close()
    }
  })
})
