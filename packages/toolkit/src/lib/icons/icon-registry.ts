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
 * Look up a curated icon by name only — no inline-SVG / emoji parsing, so the
 * returned body is always trusted registry content and safe to inline-render
 * (e.g. in `TagChip`). Markers use {@link resolveIcon} (rendered as an image).
 */
export function getIcon(name: string): IconData | undefined {
  return registry.get(name)
}

/**
 * Register or override a curated icon at runtime — e.g. a space's custom marker
 * SVG, mirroring Utopia's uploaded marker icons.
 */
export function registerIcon(name: string, icon: IconData): void {
  registry.set(name, icon)
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
  const viewBox = /viewBox="([^"]+)"/.exec(raw)?.[1] ?? "0 0 24 24"
  const body = raw
    .replace(/^[\s\S]*?<svg[^>]*>/, "")
    .replace(/<\/svg>\s*$/, "")
    .trim()
  return { viewBox, body }
}
