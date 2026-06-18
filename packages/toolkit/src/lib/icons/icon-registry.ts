import { MARKER_ICON_SET } from "./marker-icon-set"

/**
 * Drawable glyph data: an SVG `viewBox` plus inner markup (paths etc.). Curated
 * icons use `currentColor` so they take the marker/tag colour.
 */
export interface IconData {
  viewBox: string
  body: string
  /**
   * Whether the glyph is monochrome and may be recoloured to the marker's
   * contrast colour. Emoji glyphs set this to `false` to keep their own
   * colours. Defaults to `true`.
   */
  monochrome?: boolean
}

const registry = new Map<string, IconData>(Object.entries(MARKER_ICON_SET))

// Bumped whenever the registry mutates, so marker adapters can fold it into
// their appearance cache key and re-render icons that were re-registered.
let registryVersion = 0

/** A counter that changes whenever {@link registerIcon} mutates the registry. */
export function iconRegistryVersion(): number {
  return registryVersion
}

/** Fallback glyph (a filled dot) when no icon resolves — Utopia's no-icon marker. */
export const DEFAULT_ICON: IconData = {
  viewBox: "0 0 24 24",
  body: '<circle cx="12" cy="12" r="6.5"/>',
}

/** All curated icon names currently registered (sorted) — useful for an icon picker. */
export function iconNames(): string[] {
  return [...registry.keys()].sort()
}

/**
 * Look up a curated icon by name only — no inline-SVG / emoji parsing. Returns
 * registry content (bundled or {@link registerIcon}'d). A registered icon's SVG
 * is NOT assumed trusted, so consumers MUST render the body through a sandboxed
 * `<img>` (see {@link iconToDataUrl}) — never inline it with
 * `dangerouslySetInnerHTML`.
 */
export function getIcon(name: string): IconData | undefined {
  return registry.get(name)
}

/**
 * Register or override a curated icon at runtime — e.g. a space's custom or
 * uploaded marker SVG. The SVG is NOT assumed trusted: it is only ever rendered
 * through a sandboxed `<img>` (markers via the data-URL pin, tags via
 * {@link iconToDataUrl}), where scripts and event handlers never execute.
 */
export function registerIcon(name: string, icon: IconData): void {
  registry.set(name, icon)
  registryVersion++
}

/**
 * Render a single glyph as a coloured SVG `data:` URL, for `<img src>` use.
 * `<img>`-embedded SVG renders in a sandbox (no scripts or event handlers run),
 * so this is safe even for untrusted / custom icons. Used by `TagChip`; the
 * marker layer renders its pin + glyph through the same data-URL mechanism.
 */
export function iconToDataUrl(icon: IconData, color: string): string {
  const mono = icon.monochrome !== false
  const body = mono ? icon.body.replace(/currentColor/g, color) : icon.body
  const fill = mono ? ` fill="${color}"` : ""
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${icon.viewBox}"${fill}>${body}</svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

const EMOJI_RE = /\p{Extended_Pictographic}/u

/**
 * Resolve an `icon` string to drawable glyph data. Shared by the marker layer
 * and `TagChip` so a tag's icon and its markers look identical. Forms, tried in
 * order:
 * - a curated set name (`"garden"`, `"cafe"`, …)
 * - an inline `<svg …>` string or `data:image/svg+xml` URL (custom / brand)
 * - an emoji (`"🌱"`)
 *
 * Returns `null` for an empty/unknown value; callers fall back to {@link DEFAULT_ICON}.
 */
export function resolveIcon(icon: string | null | undefined): IconData | null {
  if (!icon) return null
  const named = registry.get(icon)
  if (named) return named
  const svg = parseInlineSvg(icon)
  if (svg) return svg
  if (!icon.includes("<") && EMOJI_RE.test(icon)) {
    return {
      viewBox: "0 0 24 24",
      monochrome: false,
      body: `<text x="12" y="13" font-size="20" text-anchor="middle" dominant-baseline="central">${icon}</text>`,
    }
  }
  return null
}

function parseInlineSvg(value: string): IconData | null {
  let raw = value.trim()
  if (raw.startsWith("data:image/svg+xml")) {
    const comma = raw.indexOf(",")
    if (comma === -1) return null
    const payload = raw.slice(comma + 1)
    try {
      raw = raw.includes(";base64,") ? atob(payload) : decodeURIComponent(payload)
    } catch {
      return null
    }
    raw = raw.trim()
  }
  if (!raw.startsWith("<svg")) return null
  const viewBox = /viewBox\s*=\s*["']([^"']+)["']/.exec(raw)?.[1] ?? "0 0 24 24"
  const body = raw
    .replace(/^[\s\S]*?<svg[^>]*>/, "")
    .replace(/<\/svg>\s*$/, "")
    .trim()
  return { viewBox, body }
}
