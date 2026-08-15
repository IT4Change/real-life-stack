import { test, expect } from '@playwright/test'
import { createFreshContext, createIdentity, recoverIdentity, waitForRelayConnected } from './helpers/common'
import { navigateToKanban } from './helpers/kanban'
import { resetServerState } from './helpers/reset-servers'

/**
 * Erstsynchronisation auf einem neuen Gerät (rls#265).
 *
 * Gemessen vor dem Fix: zwischen abgeschlossenem Login und dem ersten
 * sichtbaren Item vergingen bei 10 Spaces mit 100 Items rund 10 Sekunden
 * (lokaler Relay, ohne Netzlatenz) — die App zeigte in dieser Zeit eine leere
 * Oberfläche ohne jeden Hinweis. Dieser Test hält fest, dass sie es jetzt sagt.
 */

const SPACES = 2
const ITEMS = 2

/** Aufgabe über den FAB anlegen (der „Task"-Button aus helpers/kanban ist Altbestand). */
async function seedTask(page: import('@playwright/test').Page, title: string): Promise<void> {
  await page.getByRole('button', { name: 'Aufgabe erstellen' }).click()
  const titleInput = page.getByPlaceholder('Titel')
  await titleInput.waitFor({ timeout: 15_000 })
  await titleInput.fill(title)
  await page.getByRole('button', { name: 'Erstellen', exact: true }).click()
  await page.waitForTimeout(500)
}

async function createGroupNamed(page: import('@playwright/test').Page, name: string): Promise<void> {
  await page.getByRole('button').filter({ hasText: /Mein Netzwerk|Gruppe \d+|Space wählen/ }).first().click()
  await page.getByText('Neue Gruppe erstellen').click()
  const nameInput = page.getByPlaceholder('z.B. Nachbarschaft, Projekt-Team...')
  await nameInput.waitFor({ timeout: 10_000 })
  await nameInput.fill(name)
  await page.getByRole('button', { name: /Erstellen/ }).click()
  await page.waitForTimeout(1500)
}

test.describe('Erstsynchronisation (#265)', () => {
  test.use({ actionTimeout: 20_000 })
  test.beforeEach(async () => { await resetServerState() })

  test('das neue Gerät zeigt an, dass die Gruppen noch unterwegs sind', async ({ browser }) => {
    test.setTimeout(10 * 60_000)

    const { context: d1Ctx, page: d1 } = await createFreshContext(browser)
    const { context: d2Ctx, page: d2 } = await createFreshContext(browser)

    try {
      const { mnemonic } = await createIdentity(d1, { name: 'Alice', passphrase: 'alice123pw' })
      await waitForRelayConnected(d1)

      for (let i = 1; i <= SPACES; i++) {
        await createGroupNamed(d1, `Gruppe ${i}`)
        await navigateToKanban(d1)
        for (let j = 1; j <= ITEMS; j++) await seedTask(d1, `G${i}-T${j}`)
      }
      await d1.waitForTimeout(10_000)

      // Gerät 2: gleiche Identität, leerer Speicher.
      //
      // Der Hinweis ist FLÜCHTIG: bei diesem kleinen Bestand und lokalem Relay
      // kann er zwischen zwei Playwright-Abfragen wieder verschwinden. Ein
      // `toBeVisible` würde also die Datenmenge testen, nicht das Verhalten.
      // Deshalb hält ein MutationObserver im Dokument fest, OB er je da war.
      // Ein MutationObserver wäre der elegantere Weg, läuft hier aber am
      // Dokumentanfang, wo `document.documentElement` noch fehlen kann — dann
      // stirbt das Init-Script still und die Fahne bleibt falsch. Ein
      // Intervall kann nicht danebengreifen.
      await d2.addInitScript(() => {
        const flag = window as unknown as { __syncNoticeSeen?: boolean }
        flag.__syncNoticeSeen = false
        setInterval(() => {
          if (document.querySelector('[aria-label="Gruppen werden geladen"]')) flag.__syncNoticeSeen = true
        }, 50)
      })
      const syncNotice = d2.locator('[aria-label="Gruppen werden geladen"]')
      await recoverIdentity(d2, { mnemonic, passphrase: 'alice-d2-pw' })

      // Er muss VOR den Inhalten dagewesen sein — genau das Fenster, in dem
      // die App vorher „keine Gruppen" suggerierte.
      await expect
        .poll(() => d2.evaluate(() => (window as unknown as { __syncNoticeSeen?: boolean }).__syncNoticeSeen === true),
          { timeout: 30_000 })
        .toBe(true)

      // …und wieder verschwinden, sobald nichts mehr nachkommt.
      await expect(syncNotice).toBeHidden({ timeout: 90_000 })

      await d2.getByRole('button').filter({ hasText: /Mein Netzwerk|Gruppe \d+|Space wählen/ }).first().click()
      await d2.getByRole('menuitem', { name: /Mein Netzwerk/ }).click()
      await d2.getByRole('button', { name: 'Kanban' }).click()
      await expect(d2.getByText('G1-T1')).toBeVisible({ timeout: 30_000 })
      await expect(d2.getByText(`G${SPACES}-T${ITEMS}`)).toBeVisible({ timeout: 30_000 })
    } finally {
      await d1Ctx.close()
      await d2Ctx.close()
    }
  })
})
