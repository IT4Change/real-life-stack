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
