/**
 * Runtime-Konfiguration einer RLS-Instanz.
 *
 * Spec: docs/spec/11-runtime-config-und-branding.md
 *
 * Vite kompiliert `import.meta.env.VITE_*` beim Bauen in das Bundle — ein so
 * gebautes Artefakt gehoert damit genau einer Instanz. Fuer Self-Hosting ist
 * das die falsche Grenze: Eine Gemeinschaft soll ein fertiges Artefakt
 * beziehen und konfigurieren, nicht bauen muessen. Was sich pro Instanz
 * unterscheidet, wird darum hier zur Laufzeit gelesen.
 *
 * Reihenfolge: config.json -> Build-Zeit-Werte -> Standardwerte, feldweise.
 *
 * Die Datei geht an jeden Browser. Sie traegt KEINE Geheimnisse.
 */

export interface RuntimeEndpoints {
  relayUrl?: string
  profilesUrl?: string
  supabaseUrl?: string
  /** Der anonyme Key ist per Definition oeffentlich — der Service-Role-Key gehoert NIE hierher. */
  supabaseAnonKey?: string
}

export interface Branding {
  /** Anzeigename; setzt zugleich den Dokumenttitel. */
  appName?: string
  /** Pfade relativ zum Auslieferungsstamm. */
  logoUrl?: string
  faviconUrl?: string
  /** Farbtokens je Schema; Werte sind CSS-Farben. */
  colors?: {
    light?: Record<string, string>
    dark?: Record<string, string>
  }
}

export interface RuntimeConfig {
  endpoints: RuntimeEndpoints
  /** Voreingestellter Connector; `?connector=` in der URL sticht ihn. */
  defaultConnector?: string
  branding?: Branding
}

/** Stufe 3 der Vorrangkette. Eine Instanz ohne jede Konfiguration startet hiermit. */
export const DEFAULT_RUNTIME_CONFIG: RuntimeConfig = {
  endpoints: {
    relayUrl: "wss://relay.web-of-trust.de",
    profilesUrl: "https://profiles.web-of-trust.de",
  },
  defaultConnector: "wot",
}

export interface LoadOptions {
  /** Fuer Tests; sonst `globalThis.fetch`. */
  fetchImpl?: typeof fetch
  /** Auslieferungsstamm, endet mit `/`. Sonst `import.meta.env.BASE_URL`. */
  baseUrl?: string
  /** Einkompilierte Werte (Stufe 2). Die App reicht ihre `VITE_*` hier herein. */
  buildTimeEnv?: RuntimeEndpoints & { defaultConnector?: string }
}

let loaded: RuntimeConfig | null = null
let inFlight: Promise<RuntimeConfig> | null = null

/** Nur fuer Tests — im Betrieb ist die Konfiguration fuer die Seitenlaufzeit unveraenderlich. */
export function resetRuntimeConfigForTests(): void {
  loaded = null
  inFlight = null
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v)
}

/** Uebernimmt nur gesetzte Felder — ein fehlendes faellt durch, ein leeres Objekt aendert nichts. */
function mergeDefined<T extends object>(base: T, overlay: Partial<T> | undefined): T {
  if (!overlay) return base
  const out = { ...base }
  for (const [k, v] of Object.entries(overlay)) {
    if (v !== undefined && v !== null && v !== "") (out as Record<string, unknown>)[k] = v
  }
  return out
}

/**
 * Laedt die Instanz-Konfiguration. MUSS vor dem ersten Render abgeschlossen
 * sein: Eine App, die erst mit Standardwerten rendert und dann umschaltet,
 * zeigt fremdes Branding und verbindet sich mit falschen Diensten.
 *
 * Scheitert das Laden, startet die App mit Build-Zeit- und Standardwerten —
 * ein Konfigurationsfehler darf nie zu einer weissen Seite fuehren.
 */
export async function loadRuntimeConfig(opts: LoadOptions = {}): Promise<RuntimeConfig> {
  if (loaded) return loaded
  if (inFlight) return inFlight

  const fetchImpl = opts.fetchImpl ?? globalThis.fetch?.bind(globalThis)
  const baseUrl = opts.baseUrl ?? "/"
  const url = `${baseUrl.endsWith("/") ? baseUrl : baseUrl + "/"}config.json`

  inFlight = (async () => {
    let fromFile: Record<string, unknown> = {}
    try {
      const res = await fetchImpl?.(url, { cache: "no-store" })
      if (res?.ok) {
        const parsed: unknown = await res.json()
        if (isPlainObject(parsed)) fromFile = parsed
        else console.warn(`[rls] ${url} ist kein Objekt — wird ignoriert.`)
      } else if (res) {
        // Kein Fehlerfall: eine Instanz ohne config.json ist zulaessig.
        console.info(`[rls] Keine ${url} (${res.status}) — Build-Zeit- und Standardwerte.`)
      }
    } catch (err) {
      console.warn(`[rls] ${url} nicht lesbar — Build-Zeit- und Standardwerte.`, err)
    }

    const env = opts.buildTimeEnv ?? {}
    const fileEndpoints = isPlainObject(fromFile.endpoints)
      ? (fromFile.endpoints as RuntimeEndpoints)
      : undefined

    const cfg: RuntimeConfig = {
      endpoints: mergeDefined(
        mergeDefined(DEFAULT_RUNTIME_CONFIG.endpoints, {
          relayUrl: env.relayUrl,
          profilesUrl: env.profilesUrl,
          supabaseUrl: env.supabaseUrl,
          supabaseAnonKey: env.supabaseAnonKey,
        }),
        fileEndpoints,
      ),
      defaultConnector:
        (typeof fromFile.defaultConnector === "string" ? fromFile.defaultConnector : undefined) ??
        env.defaultConnector ??
        DEFAULT_RUNTIME_CONFIG.defaultConnector,
      branding: isPlainObject(fromFile.branding) ? (fromFile.branding as Branding) : undefined,
    }

    loaded = Object.freeze(cfg)
    return loaded
  })()

  return inFlight
}

/** Die geladene Konfiguration. Vor `loadRuntimeConfig` sind es die Standardwerte. */
export function getRuntimeConfig(): RuntimeConfig {
  return loaded ?? DEFAULT_RUNTIME_CONFIG
}

// Tokennamen und -werte stammen aus einer Datei, die der Betreiber schreibt.
// Sie landen in einem Style-Attribut, also wird beides eng gehalten: Namen
// nur als schlichte Bezeichner, Werte ohne alles, was die Deklaration
// verlassen koennte.
const TOKEN_NAME = /^[a-z0-9-]+$/i
const UNSAFE_VALUE = /[;{}<>()\\]/

function setTokens(el: HTMLElement, tokens: Record<string, string> | undefined) {
  if (!tokens) return
  for (const [name, value] of Object.entries(tokens)) {
    if (!TOKEN_NAME.test(name)) {
      console.warn(`[rls] Branding-Token "${name}" ignoriert — unzulaessiger Name.`)
      continue
    }
    if (typeof value !== "string" || UNSAFE_VALUE.test(value)) {
      console.warn(`[rls] Branding-Token "${name}" ignoriert — unzulaessiger Wert.`)
      continue
    }
    el.style.setProperty(`--${name}`, value)
  }
}

/**
 * Legt das Branding auf das Dokument. Wird von App-Shell-Flaechen aufgerufen,
 * nie von einem Space Module (Spec 11, Regel 4).
 *
 * Dark-Tokens werden unter `.dark` wirksam — die App schaltet dieselbe Klasse,
 * die auch das Toolkit-Theme steuert (siehe color-scheme.ts).
 */
export function applyBranding(branding: Branding | undefined, doc: Document = document): void {
  if (!branding) return

  if (branding.appName) doc.title = branding.appName

  if (branding.faviconUrl) {
    const link =
      doc.querySelector<HTMLLinkElement>('link[rel="icon"]') ??
      doc.head.appendChild(Object.assign(doc.createElement("link"), { rel: "icon" }))
    link.href = branding.faviconUrl
  }

  setTokens(doc.documentElement, branding.colors?.light)

  const dark = branding.colors?.dark
  if (dark) {
    const styleId = "rls-branding-dark"
    const decls = Object.entries(dark)
      .filter(([n, v]) => TOKEN_NAME.test(n) && typeof v === "string" && !UNSAFE_VALUE.test(v))
      .map(([n, v]) => `--${n}: ${v};`)
      .join(" ")
    if (decls) {
      const style = doc.getElementById(styleId) ?? doc.head.appendChild(
        Object.assign(doc.createElement("style"), { id: styleId }),
      )
      style.textContent = `.dark { ${decls} }`
    }
  }
}
