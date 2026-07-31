/**
 * Dark-mode detection for consumers that cannot express their theme in CSS.
 *
 * RLS drives dark mode through a `dark` class on `document.documentElement`
 * (Tailwind's `@custom-variant dark (&:is(.dark *))`, toggled by the app shell).
 * Everything styled in CSS follows along for free. A WebGL map does not: its
 * vector style is JSON fetched at runtime, so it has to *read* the same signal.
 * That read lives here once instead of being re-sniffed per component.
 *
 * The class is deliberately the ONLY signal — `prefers-color-scheme` is not a
 * fallback. The app shell does not seed the class from the OS preference, so an
 * OS-dark user on a light-rendered app would otherwise get a dark map under a
 * light UI.
 */

export type ColorScheme = "light" | "dark"

/** `"auto"` follows the app's `dark` class; the explicit values pin the scheme. */
export type ColorSchemePreference = ColorScheme | "auto"

const DARK_CLASS = "dark"

/** Current scheme for a preference. `"auto"` resolves to `"light"` off-DOM (SSR). */
export function resolveColorScheme(preference: ColorSchemePreference = "auto"): ColorScheme {
  if (preference !== "auto") return preference
  if (typeof document === "undefined") return "light"
  return document.documentElement.classList.contains(DARK_CLASS) ? "dark" : "light"
}

/**
 * Call `callback` whenever the resolved `"auto"` scheme flips. Fires on change
 * only (never with the initial value) — callers already have that from
 * `resolveColorScheme()`. Returns an unsubscribe.
 *
 * Only the `class` attribute of `document.documentElement` is watched, matching
 * where the app shell toggles it. A `dark` class set on some inner wrapper
 * instead (a Storybook decorator, say) is not observed.
 */
export function observeColorScheme(callback: (scheme: ColorScheme) => void): () => void {
  if (typeof document === "undefined" || typeof MutationObserver === "undefined") {
    return () => {}
  }
  let last = resolveColorScheme("auto")
  const observer = new MutationObserver(() => {
    const next = resolveColorScheme("auto")
    if (next === last) return
    last = next
    callback(next)
  })
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] })
  return () => observer.disconnect()
}
