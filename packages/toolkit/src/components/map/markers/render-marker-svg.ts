import { getReadableTextColor } from "../../../lib/utils"
import type { ColorScheme } from "../../../lib/color-scheme"
import { resolveIcon, DEFAULT_ICON, type IconData } from "../../../lib/icons/icon-registry"
import {
  markerShapeBody,
  DEFAULT_SHAPE,
  PIN_VIEWBOX,
  PIN_SIZE,
  GLYPH_CENTER,
  type MarkerShape,
} from "./marker-shapes"

/** Glyph box size in pin viewBox units (standardised — no per-icon size tuning). */
const GLYPH_TARGET = 17
/** Subtle default outline, like Utopia's marker border. */
const BORDER_LIGHT = "rgba(20,20,20,0.18)"
/**
 * On a dark map both of the pin's depth cues stop working: the drop shadow is
 * black on a near-black background, and so is this rim. The pin collapses into
 * a flat patch of colour. A light rim gives it its edge back — the same
 * "cut-out sticker" separation the shadow provides on a light map.
 */
const BORDER_DARK = "rgba(255,255,255,0.8)"
/**
 * Accent colours are chosen to read on a light surface; on near-black they
 * glare. Pulling the fill toward the map's own darkness keeps the hue
 * recognisable while taking the harshness off — this does more for the
 * "cheap neon" look than the rim does.
 */
const DARK_FILL_MIX = 0.32
const DARK_BACKDROP = "#111111"

export interface RenderMarkerOptions {
  /** Marker colour (`#rrggbb`) — fills the pin; the glyph uses a readable contrast colour. */
  color: string
  /** Icon string (curated name | inline SVG | emoji). Falls back to a dot. */
  icon?: string | null
  shape?: MarkerShape
  /** Map style the pin is drawn onto. Changes the rim and mutes the fill. */
  colorScheme?: ColorScheme
}

/** Blend `hex` toward `toward` by `amount` (0…1). Both must be `#rrggbb`. */
function mixHex(hex: string, toward: string, amount: number): string {
  if (!/^#[0-9a-f]{6}$/i.test(hex) || !/^#[0-9a-f]{6}$/i.test(toward)) return hex
  const a = parseInt(hex.slice(1), 16)
  const b = parseInt(toward.slice(1), 16)
  const channel = (shift: number) => {
    const from = (a >> shift) & 255
    const to = (b >> shift) & 255
    return Math.round(from + (to - from) * amount)
  }
  const out = (channel(16) << 16) | (channel(8) << 8) | channel(0)
  return `#${out.toString(16).padStart(6, "0")}`
}

/**
 * Render a map marker as one self-contained SVG string: a coloured pin (Utopia's
 * shape) with a centred glyph. Engine-agnostic — Leaflet mounts it in a
 * `DivIcon`, MapLibre in a custom marker element. The glyph takes a readable
 * contrast colour via {@link getReadableTextColor}. Selection is shown by the
 * adapter as a soft colour glow (CSS filter), not by changing the pin outline.
 */
export function renderMarkerSvg({
  color,
  icon,
  shape = DEFAULT_SHAPE,
  colorScheme = "light",
}: RenderMarkerOptions): string {
  const dark = colorScheme === "dark"
  const fill = dark ? mixHex(color, DARK_BACKDROP, DARK_FILL_MIX) : color
  const glyphColor = getReadableTextColor(fill)
  const pin = markerShapeBody(shape, fill, dark ? BORDER_DARK : BORDER_LIGHT)
  const glyph = placeGlyph(resolveIcon(icon) ?? DEFAULT_ICON, glyphColor)
  // The drop shadow is applied by the adapters via the `.rls-marker-shadow` CSS
  // class (a CSS `filter: drop-shadow`), which is reliable for `<img>`-embedded
  // SVG across browsers — an in-SVG `feDropShadow` is not.
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${PIN_VIEWBOX}" width="${PIN_SIZE.width}" height="${PIN_SIZE.height}">${pin}${glyph}</svg>`
}

/**
 * The marker as an SVG `data:` URL — safe for `<img src>` (MapLibre) and Leaflet's
 * `icon({ iconUrl })`. Using an image (not inline DOM) means a custom/brand icon
 * SVG can never inject script or markup into the page.
 */
export function markerDataUrl(opts: RenderMarkerOptions): string {
  return `data:image/svg+xml,${encodeURIComponent(renderMarkerSvg(opts))}`
}

/** Centre a glyph in the pin's slot, scaled to a uniform size by its viewBox. */
function placeGlyph(data: IconData, color: string): string {
  const [minX, minY, w, h] = data.viewBox.split(/\s+/).map(Number)
  const scale = GLYPH_TARGET / Math.max(w, h)
  const tx = round(GLYPH_CENTER.x - (w * scale) / 2 - minX * scale)
  const ty = round(GLYPH_CENTER.y - (h * scale) / 2 - minY * scale)
  // Monochrome glyphs take the contrast colour. The marker renders inside an
  // `<img>` (markerDataUrl), where `currentColor` has no document context — so we
  // bake the colour into `currentColor` paths AND set `fill` for bare paths.
  // Emoji keep their own colours.
  const mono = data.monochrome !== false
  const body = mono ? data.body.replace(/currentColor/g, color) : data.body
  const paint = mono ? ` fill="${color}"` : ""
  return `<g${paint} transform="translate(${tx},${ty}) scale(${round(scale, 4)})">${body}</g>`
}

const round = (n: number, precision = 2): number => Number(n.toFixed(precision))
