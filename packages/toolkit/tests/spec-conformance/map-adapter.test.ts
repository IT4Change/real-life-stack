/**
 * Stub-Conformance: MapAdapter contract.
 *
 * Spec: docs/spec/modules/map.md → "Karten-Library-Adapter" → interface MapAdapter
 *
 * Purpose (per docs/spec/README.md, Stufe 2): assert that the contract the
 * spec promises actually exists in the code. If someone deletes a method from
 * the MapAdapter interface or from the LeafletMapAdapter implementation, this
 * test fails and points at the spec section that defines the missing piece.
 */

import { describe, it, expect } from "vitest"
import type { MapAdapter, MapMarkerSpec, MapViewPatch, MapMountOptions, Unsubscribe } from "../../src/components/map/adapter"
import { LeafletMapAdapter } from "../../src/components/map/adapters/leaflet"

// Method names exactly as the spec lists them.
// Update this list ONLY when docs/spec/modules/map.md changes the contract.
const SPEC_METHODS = [
  "mount",
  "unmount",
  "setMarkers",
  "setView",
  "getView",
  "observeView",
  "observeClicks",
  "observeMarkerClicks",
] as const

const SPEC_LINK = "docs/spec/modules/map.md → §Karten-Library-Adapter"

describe(`MapAdapter contract — ${SPEC_LINK}`, () => {
  it("a structural MapAdapter satisfies every method named in the spec", () => {
    // Type-level proof: this object literal must be assignable to MapAdapter,
    // so TypeScript errors if the interface drops or renames any method below.
    const stub: MapAdapter = {
      mount: async (_container: HTMLElement, _options: MapMountOptions) => {},
      unmount: async () => {},
      setMarkers: (_markers: MapMarkerSpec[]) => {},
      setView: (_view: MapViewPatch) => {},
      getView: () => ({
        center: [0, 0],
        zoom: 0,
        bounds: { north: 0, east: 0, south: 0, west: 0 },
      }),
      observeView: ((): Unsubscribe => () => {}) as MapAdapter["observeView"],
      observeClicks: ((): Unsubscribe => () => {}) as MapAdapter["observeClicks"],
      observeMarkerClicks: ((): Unsubscribe => () => {}) as MapAdapter["observeMarkerClicks"],
    }
    for (const name of SPEC_METHODS) {
      expect(
        typeof (stub as unknown as Record<string, unknown>)[name],
        `MapAdapter.${name} missing — ${SPEC_LINK}`,
      ).toBe("function")
    }
  })

  it("LeafletMapAdapter implements every spec method", () => {
    // Constructor is sync and does NOT load leaflet — that happens lazily in
    // mount(). Safe to instantiate in a Node test environment without DOM.
    const adapter = new LeafletMapAdapter()
    for (const name of SPEC_METHODS) {
      expect(
        typeof (adapter as unknown as Record<string, unknown>)[name],
        `LeafletMapAdapter.${name} missing — ${SPEC_LINK}`,
      ).toBe("function")
    }
  })

  it("LeafletMapAdapter is assignable to MapAdapter", () => {
    // Pure type-level check: forces structural compatibility at compile time.
    const adapter: MapAdapter = new LeafletMapAdapter()
    expect(adapter).toBeDefined()
  })
})
