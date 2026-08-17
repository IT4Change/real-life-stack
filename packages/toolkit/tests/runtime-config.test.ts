// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest"
import {
  loadRuntimeConfig,
  getRuntimeConfig,
  resetRuntimeConfigForTests,
  applyBranding,
  DEFAULT_RUNTIME_CONFIG,
  type RuntimeConfig,
} from "../src/lib/runtime-config"

/** Stub für einen fetch, der eine config.json liefert (oder scheitert). */
function stubFetch(result: { ok: boolean; json?: unknown; throws?: boolean }) {
  return vi.fn(async () => {
    if (result.throws) throw new Error("network down")
    return {
      ok: result.ok,
      status: result.ok ? 200 : 404,
      json: async () => result.json,
    } as unknown as Response
  })
}

describe("loadRuntimeConfig", () => {
  beforeEach(() => resetRuntimeConfigForTests())
  afterEach(() => vi.restoreAllMocks())

  it("falls back to defaults when no config.json is served", async () => {
    const cfg = await loadRuntimeConfig({ fetchImpl: stubFetch({ ok: false }) })
    expect(cfg.endpoints.relayUrl).toBe(DEFAULT_RUNTIME_CONFIG.endpoints.relayUrl)
  })

  it("starts with defaults when the fetch itself throws", async () => {
    const cfg = await loadRuntimeConfig({ fetchImpl: stubFetch({ ok: true, throws: true }) })
    expect(cfg.endpoints.relayUrl).toBe(DEFAULT_RUNTIME_CONFIG.endpoints.relayUrl)
  })

  it("starts with defaults when config.json is not valid JSON", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError("Unexpected token")
      },
    }) as unknown as Response)
    const cfg = await loadRuntimeConfig({ fetchImpl })
    expect(cfg.endpoints.relayUrl).toBe(DEFAULT_RUNTIME_CONFIG.endpoints.relayUrl)
  })

  it("ignores a config.json that is not an object", async () => {
    const cfg = await loadRuntimeConfig({ fetchImpl: stubFetch({ ok: true, json: ["nope"] }) })
    expect(cfg.endpoints.relayUrl).toBe(DEFAULT_RUNTIME_CONFIG.endpoints.relayUrl)
  })

  it("merges field by field — a set field wins, a missing one falls through", async () => {
    const cfg = await loadRuntimeConfig({
      fetchImpl: stubFetch({ ok: true, json: { endpoints: { relayUrl: "wss://relay.example.org" } } }),
      buildTimeEnv: { profilesUrl: "https://profiles.build-time.example" },
    })
    expect(cfg.endpoints.relayUrl).toBe("wss://relay.example.org")
    // nicht in config.json gesetzt -> Build-Zeit-Wert traegt
    expect(cfg.endpoints.profilesUrl).toBe("https://profiles.build-time.example")
  })

  it("lets an empty config.json change nothing", async () => {
    const cfg = await loadRuntimeConfig({
      fetchImpl: stubFetch({ ok: true, json: {} }),
      buildTimeEnv: { relayUrl: "wss://relay.build-time.example" },
    })
    expect(cfg.endpoints.relayUrl).toBe("wss://relay.build-time.example")
  })

  it("prefers config.json over the build-time value", async () => {
    const cfg = await loadRuntimeConfig({
      fetchImpl: stubFetch({ ok: true, json: { endpoints: { relayUrl: "wss://runtime.example" } } }),
      buildTimeEnv: { relayUrl: "wss://build.example" },
    })
    expect(cfg.endpoints.relayUrl).toBe("wss://runtime.example")
  })

  it("carries branding through", async () => {
    const cfg = await loadRuntimeConfig({
      fetchImpl: stubFetch({
        ok: true,
        json: { branding: { appName: "Waldgarten", colors: { light: { primary: "#2f6b3a" } } } },
      }),
    })
    expect(cfg.branding?.appName).toBe("Waldgarten")
    expect(cfg.branding?.colors?.light?.primary).toBe("#2f6b3a")
  })

  it("exposes the loaded config via getRuntimeConfig", async () => {
    await loadRuntimeConfig({ fetchImpl: stubFetch({ ok: true, json: { defaultConnector: "wot" } }) })
    expect(getRuntimeConfig().defaultConnector).toBe("wot")
  })

  it("returns defaults from getRuntimeConfig before loading", () => {
    expect(getRuntimeConfig().endpoints.relayUrl).toBe(DEFAULT_RUNTIME_CONFIG.endpoints.relayUrl)
  })

  it("loads only once — a second call returns the first result", async () => {
    const fetchImpl = stubFetch({ ok: true, json: { defaultConnector: "wot" } })
    await loadRuntimeConfig({ fetchImpl })
    await loadRuntimeConfig({ fetchImpl })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it("requests config.json relative to the base path", async () => {
    const fetchImpl = stubFetch({ ok: true, json: {} })
    await loadRuntimeConfig({ fetchImpl, baseUrl: "/app/" })
    expect(fetchImpl).toHaveBeenCalledWith("/app/config.json", expect.anything())
  })
})

describe("applyBranding", () => {
  beforeEach(() => {
    resetRuntimeConfigForTests()
    document.documentElement.removeAttribute("style")
    document.title = ""
  })

  it("sets the document title from appName", () => {
    applyBranding({ appName: "Waldgarten" })
    expect(document.title).toBe("Waldgarten")
  })

  it("leaves the title alone when appName is absent", () => {
    document.title = "unveraendert"
    applyBranding({ colors: { light: { primary: "#123456" } } })
    expect(document.title).toBe("unveraendert")
  })

  it("writes light colors as custom properties on the root element", () => {
    applyBranding({ colors: { light: { primary: "#2f6b3a" } } })
    expect(document.documentElement.style.getPropertyValue("--primary")).toBe("#2f6b3a")
  })

  it("ignores token names that are not plain identifiers", () => {
    applyBranding({ colors: { light: { "primary; background: url(x)": "#000" } } })
    expect(document.documentElement.getAttribute("style") ?? "").not.toContain("url(")
  })

  it("ignores colour values containing CSS escapes", () => {
    applyBranding({ colors: { light: { primary: "red; --injected: bad" } } })
    expect(document.documentElement.style.getPropertyValue("--injected")).toBe("")
  })

  it("does nothing without branding", () => {
    expect(() => applyBranding(undefined)).not.toThrow()
  })
})

describe("the config carries no secrets", () => {
  it("has no field that would hold one", () => {
    // Absicht festhalten: config.json geht an jeden Browser. Ein Feld wie
    // `serviceRoleKey` waere hier ein Fehler, kein Feature.
    const forbidden = ["serviceRoleKey", "secret", "password", "privateKey"]
    const cfg: RuntimeConfig = DEFAULT_RUNTIME_CONFIG
    const flat = JSON.stringify(cfg).toLowerCase()
    for (const f of forbidden) expect(flat).not.toContain(f.toLowerCase())
  })
})
