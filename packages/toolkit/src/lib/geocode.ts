/**
 * Provider-agnostic geocoding for the location widget.
 *
 * Spec: docs/spec/modules/shared-components.md → Location-Widget. The provider
 * is injected (never hard-wired into the widget); Nominatim/OSM is the
 * reference implementation. Point the geocoder at a self-hosted Nominatim by
 * passing `endpoint` to `createNominatimGeocoder`.
 */

export interface GeocodeResult {
  /** Human-readable place label (e.g. Nominatim `display_name`). */
  label: string
  lat: number
  lng: number
}

export type Geocoder = (
  query: string,
  options?: { signal?: AbortSignal },
) => Promise<GeocodeResult[]>

export interface NominatimGeocoderOptions {
  /** Search endpoint. Defaults to the public OSM Nominatim instance. */
  endpoint?: string
  /** Max results. Default 5. */
  limit?: number
  /** `accept-language` value, e.g. "de". Omitted → server default. */
  language?: string
}

const DEFAULT_ENDPOINT = "https://nominatim.openstreetmap.org/search"

interface NominatimEntry {
  lat: string
  lon: string
  display_name: string
}

/**
 * Build a {@link Geocoder} backed by a Nominatim instance. Returns `[]` for a
 * blank query and forwards an AbortSignal so callers can cancel in-flight
 * requests (the location widget debounces and aborts superseded searches).
 */
export function createNominatimGeocoder(
  options: NominatimGeocoderOptions = {},
): Geocoder {
  const { endpoint = DEFAULT_ENDPOINT, limit = 5, language } = options
  return async (query, opts) => {
    const q = query.trim()
    if (!q) return []
    const params = new URLSearchParams({
      q,
      format: "jsonv2",
      limit: String(limit),
      addressdetails: "0",
    })
    if (language) params.set("accept-language", language)
    const res = await fetch(`${endpoint}?${params.toString()}`, {
      signal: opts?.signal,
      headers: { Accept: "application/json" },
    })
    if (!res.ok) throw new Error(`Geocoding failed: ${res.status}`)
    const data = (await res.json()) as NominatimEntry[]
    return data
      .map((e) => ({
        label: e.display_name,
        lat: Number.parseFloat(e.lat),
        lng: Number.parseFloat(e.lon),
      }))
      .filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lng))
  }
}

/**
 * Ready-to-use Nominatim geocoder against the **public OSM instance**.
 *
 * The OSM Nominatim usage policy expects an identifying Referer/contact and
 * forbids heavy or bulk use; a browser cannot set a User-Agent, so this default
 * is suitable for **local development / demos only**. For production, point
 * `createNominatimGeocoder({ endpoint })` at a self-hosted or proxied,
 * identified instance.
 */
export const nominatimGeocode: Geocoder = createNominatimGeocoder()

/** Resolve a coordinate to a human-readable address label, or null. */
export type ReverseGeocoder = (
  pos: { lat: number; lng: number },
  options?: { signal?: AbortSignal },
) => Promise<string | null>

export interface NominatimReverseOptions {
  /** Reverse endpoint. Defaults to the public OSM Nominatim instance. */
  endpoint?: string
  /** `accept-language` value, e.g. "de". Omitted → server default. */
  language?: string
}

const DEFAULT_REVERSE_ENDPOINT = "https://nominatim.openstreetmap.org/reverse"

/** Structured address from Nominatim (`addressdetails=1`). All fields optional. */
interface NominatimAddress {
  road?: string
  pedestrian?: string
  footway?: string
  path?: string
  house_number?: string
  city?: string
  town?: string
  village?: string
  municipality?: string
  suburb?: string
  city_district?: string
}

interface NominatimReverseEntry {
  /** Primary feature name, e.g. "Junges Museum Frankfurt" (empty for plain addresses). */
  name?: string
  display_name?: string
  address?: NominatimAddress
}

/**
 * Compact, two-segment label from a Nominatim reverse result: a named place
 * (or street + house number) followed by its town/city — e.g.
 * "Junges Museum Frankfurt, Frankfurt am Main" or "Saalhof 1, Frankfurt am Main".
 * Falls back to the raw `display_name` when the structured address is missing.
 */
export function formatShortAddress(entry: NominatimReverseEntry): string | null {
  const a = entry.address ?? {}
  const locality =
    a.city ?? a.town ?? a.village ?? a.municipality ?? a.suburb ?? a.city_district
  const street = a.road ?? a.pedestrian ?? a.footway ?? a.path
  const streetLine = street
    ? a.house_number
      ? `${street} ${a.house_number}`
      : street
    : undefined
  // Prefer a named POI when it adds information over the bare street name.
  const name = entry.name?.trim()
  const primary = name && name !== street ? name : streetLine
  const parts = [primary, locality].filter((p): p is string => Boolean(p))
  if (parts.length > 0) return parts.join(", ")
  return entry.display_name ?? null
}

/**
 * Build a {@link ReverseGeocoder} backed by a Nominatim instance. Returns a
 * compact "<place|street>, <city>" label (see {@link formatShortAddress}), or
 * null if none.
 */
export function createNominatimReverseGeocoder(
  options: NominatimReverseOptions = {},
): ReverseGeocoder {
  const { endpoint = DEFAULT_REVERSE_ENDPOINT, language } = options
  return async (pos, opts) => {
    const params = new URLSearchParams({
      lat: String(pos.lat),
      lon: String(pos.lng),
      format: "jsonv2",
      addressdetails: "1",
    })
    if (language) params.set("accept-language", language)
    const res = await fetch(`${endpoint}?${params.toString()}`, {
      signal: opts?.signal,
      headers: { Accept: "application/json" },
    })
    if (!res.ok) throw new Error(`Reverse geocoding failed: ${res.status}`)
    const data = (await res.json()) as NominatimReverseEntry
    return formatShortAddress(data)
  }
}

/**
 * Ready-to-use reverse geocoder against the **public OSM instance** (dev/demo
 * only; see {@link nominatimGeocode}).
 */
export const nominatimReverseGeocode: ReverseGeocoder = createNominatimReverseGeocoder()
