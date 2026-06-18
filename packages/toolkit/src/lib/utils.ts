import type { CSSProperties } from "react"
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Shared deterministic tag-color palette. Each entry pairs the chip
// classes (Tailwind, for HTML cards) with a CSS-color accent (for
// surfaces that can't read Tailwind — Leaflet markers, canvas, etc.).
// `getTagColor` returns the chip classes (kept stable for existing
// callers); `getTagAccentColor` returns the matching CSS color.
const TAG_PALETTE: Array<{ chip: string; accent: string }> = [
  { chip: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300", accent: "#2563eb" },
  { chip: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300", accent: "#16a34a" },
  { chip: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300", accent: "#d97706" },
  { chip: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300", accent: "#9333ea" },
  { chip: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300", accent: "#e11d48" },
]

function paletteEntry(tag: string) {
  let hash = 0
  for (let i = 0; i < tag.length; i++) hash = tag.charCodeAt(i) + ((hash << 5) - hash)
  return TAG_PALETTE[Math.abs(hash) % TAG_PALETTE.length]
}

/** Deterministic Tailwind chip classes for a tag string. */
export function getTagColor(tag: string): string {
  return paletteEntry(tag).chip
}

/**
 * Deterministic CSS-color accent for a tag string, paired with the
 * palette `getTagColor` uses. Suitable for non-Tailwind surfaces
 * (Leaflet markers, canvas, inline SVG …).
 */
export function getTagAccentColor(tag: string): string {
  return paletteEntry(tag).accent
}

const HEX6 = /^#[0-9a-fA-F]{6}$/

/**
 * The accent color for a space. Returns the cached `primaryColor` when it is a
 * valid `#rrggbb` value, otherwise a deterministic color derived from the
 * space id (same palette as tags; stable across devices and sessions, never
 * random). Read surfaces use this so they stay robust when `primaryColor` is
 * absent. Spec: docs/spec/04-items-relations-groups-spaces.md → Space-Primärfarbe.
 */
export function getSpacePrimaryColor(id: string, explicit?: string | null): string {
  if (explicit && HEX6.test(explicit)) return explicit
  return paletteEntry(id).accent
}

/**
 * Soft "glow" for the item currently open in the shared panel, in the colour of
 * its (origin) group. A thin colour edge keeps it defined on busy backgrounds;
 * the blurred halo does the highlighting without a hard, heavy ring. `color`
 * must be a `#rrggbb` value (e.g. from `getSpacePrimaryColor`); the 2-digit
 * alpha suffixes make the 8-digit `#rrggbbaa` form.
 */
export function getActivePanelGlow(color: string): CSSProperties {
  if (!HEX6.test(color)) return {}
  return { boxShadow: `0 0 0 1px ${color}, 0 0 8px 2px ${color}80` }
}

/**
 * Readable text color (`#000000` / `#ffffff`) for text on a colored accent
 * surface, chosen by perceived luminance so it works for light and dark
 * accents alike.
 */
export function getReadableTextColor(hex: string): string {
  if (!HEX6.test(hex)) return "#ffffff"
  const n = parseInt(hex.slice(1), 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.6 ? "#000000" : "#ffffff"
}

/**
 * Unified accent color for an item across all modules (map markers, calendar
 * events, …). Precedence, highest first:
 * 1. a custom item color (`data.color`, a `#rrggbb` value),
 * 2. the first tag's deterministic accent (`getTagAccentColor`),
 * 3. the group/space color (passed in by the caller).
 *
 * The caller supplies `groupColor` (e.g. `getSpacePrimaryColor(...)` for the
 * active space) so the same precedence holds everywhere. Pair with
 * `getReadableTextColor` for text/glyph contrast.
 */
export function getItemColor(
  item: { data?: Record<string, unknown> | null; tags?: string[] },
  options: { groupColor: string },
): string {
  const custom = item.data?.color
  if (typeof custom === "string" && HEX6.test(custom)) return custom
  const firstTag = item.tags?.[0]
  if (firstTag) return getTagAccentColor(firstTag)
  return options.groupColor
}

/**
 * Resolve a possibly app-rooted asset URL against Vite's `BASE_URL`.
 *
 * - External URLs (`http(s):`, `data:`, `blob:`) are returned unchanged.
 * - Bare absolute paths (`/personas/anton.png`) get the deployment's
 *   base path prepended. Without this the asset 404s as soon as the
 *   app ships under a subpath (e.g. `/app/`, `/real-life-stack/`).
 * - Already-prefixed paths are detected and returned untouched.
 * - Relative paths and empty values are returned unchanged.
 *
 * Used by `AvatarImage` automatically and exported for any other
 * `<img src>` that consumes a stored asset path (logos, badges, …).
 */
export function resolveAssetUrl(url: string | undefined): string | undefined {
  if (!url) return url
  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(url)) return url
  if (!url.startsWith("/")) return url
  const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? "/"
  const trimmed = base.endsWith("/") ? base.slice(0, -1) : base
  if (!trimmed) return url
  if (url === trimmed || url.startsWith(`${trimmed}/`)) return url
  return `${trimmed}${url}`
}
