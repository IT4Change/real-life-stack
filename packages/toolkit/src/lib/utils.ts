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
