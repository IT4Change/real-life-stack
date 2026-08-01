import { Capacitor } from "@capacitor/core"
import { LiveUpdate } from "@capawesome/capacitor-live-update"

/** Sentinel channel for builds that must never self-update (Play Store). */
export const NO_UPDATE_CHANNEL = '__local__'

/**
 * Which update channel this bundle belongs to.
 *
 * `buildChannel` is `VITE_UPDATE_CHANNEL`, baked in at build time — so it is a
 * property of the *running bundle*, not of the installed app. After an OTA
 * reload the running bundle is the DOWNLOADED one, and it only knows its
 * channel if it was built with the variable set.
 *
 * The platform fallback is a last resort and silently correct for two of three
 * channels: `ios` and `android` happen to be spelled like their platform.
 * `android-foss` is not — an F-Droid install whose bundle lacks the variable
 * resolves to `android` and starts polling the Play channel. That was #193;
 * the fix is that every OTA bundle is built with its own channel, see
 * `.github/workflows/deploy-prototypes.yml`.
 */
export function resolveUpdateChannel(
  buildChannel: string | undefined,
  platform: string,
): string {
  return buildChannel || platform
}

/**
 * Checks for OTA updates on app startup.
 * Only runs on native platforms (iOS/Android), no-op in browser.
 *
 * Channel URLs (set VITE_UPDATE_SERVER_URL + VITE_UPDATE_CHANNEL at build time):
 *   https://real-life-stack.de/updates/ios/latest.json
 *   https://real-life-stack.de/updates/android/latest.json
 *   https://real-life-stack.de/updates/android-foss/latest.json
 */
export async function checkForLiveUpdate(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return

  const channel = resolveUpdateChannel(
    import.meta.env.VITE_UPDATE_CHANNEL,
    Capacitor.getPlatform(),
  )

  if (channel === NO_UPDATE_CHANNEL) {
    await LiveUpdate.reset().catch(() => {})
    return
  }

  const serverUrl = import.meta.env.VITE_UPDATE_SERVER_URL ?? 'https://real-life-stack.de'

  try {
    console.info(`[LiveUpdate] checking ${serverUrl}/updates/${channel}/latest.json`)
    const response = await fetch(`${serverUrl}/updates/${channel}/latest.json`)
    if (!response.ok) {
      console.warn(`[LiveUpdate] latest.json not reachable (${response.status})`)
      return
    }

    // Note: latest.json also carries a `sha256`, but we intentionally do
    // not pass it as `downloadBundle({ checksum })`. The WoT demo app —
    // the reference implementation that updates reliably — omits it, and
    // passing it added the one behavioural difference between the two
    // apps. Integrity is covered by HTTPS + GitHub-release hosting;
    // proper authenticity would need `signature`, a separate feature.
    const { bundleId, url } = (await response.json()) as {
      bundleId: string
      url: string
    }

    const { bundleId: currentBundleId } = await LiveUpdate.getCurrentBundle()
    console.info(`[LiveUpdate] current=${currentBundleId} latest=${bundleId}`)
    if (currentBundleId === bundleId) return

    console.info(`[LiveUpdate] downloading bundle ${bundleId} from ${url}`)
    await LiveUpdate.downloadBundle({ bundleId, url })
    await LiveUpdate.setNextBundle({ bundleId })
    console.info(`[LiveUpdate] bundle ${bundleId} ready — reloading`)
    await LiveUpdate.reload()
  } catch (err) {
    // Update failures must never crash the app
    console.warn("[LiveUpdate] Update check failed:", err)
  }
}
