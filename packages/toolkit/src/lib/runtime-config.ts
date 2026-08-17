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

export interface BrandingColors {
  light?: Record<string, string>
  dark?: Record<string, string>
}

export interface Branding {
  /** Anzeigename; setzt zugleich den Dokumenttitel. */
  appName?: string
  faviconUrl?: string
  /** Farbtokens, direkt in der Konfiguration. */
  colors?: BrandingColors
  /**
   * Alternativ: Pfad auf eine Datei mit denselben Farbtokens. Sie wird
   * getrennt geladen, damit ein Fehler DARIN nur die Farben kostet und nicht
   * die uebrige Konfiguration mitreisst.
   */
  colorsUrl?: string
}

export interface RuntimeConfig {
  endpoints: RuntimeEndpoints
  /** Voreingestellter Connector; `?connector=` in der URL sticht ihn. */
  defaultConnector?: string
  branding?: Branding
}

/** Stufe 3 der Vorrangkette. Eine Instanz ohne jede Konfiguration startet hiermit. */
export const DEFAULT_RUNTIME_CONFIG: RuntimeConfig = Object.freeze({
  endpoints: Object.freeze({
    relayUrl: "wss://relay.web-of-trust.de",
    profilesUrl: "https://profiles.web-of-trust.de",
  }),
  defaultConnector: "wot",
}) as RuntimeConfig

export interface LoadOptions {
  /** Fuer Tests; sonst `globalThis.fetch`. */
  fetchImpl?: typeof fetch
  /**
   * Auslieferungsstamm, unter dem `config.json` liegt. Ohne Angabe `"/"` —
   * eine App unter einem Unterpfad MUSS ihren Basispfad hereinreichen
   * (`import.meta.env.BASE_URL` kennt nur sie selbst, nicht das Toolkit).
   */
  baseUrl?: string
  /** Einkompilierte Werte (Stufe 2). Die App reicht ihre `VITE_*` hier herein. */
  buildTimeEnv?: RuntimeEndpoints & { defaultConnector?: string }
  /**
   * Connector-Ids, die diese App kennt. Ein Wert ausserhalb wird verworfen,
   * statt stillschweigend durchgereicht zu werden: Ein Tippfehler wuerde
   * sonst am Ende im Mock-Connector landen und der Instanz Demo-Daten
   * statt ihres Netzwerks zeigen.
   */
  allowedConnectors?: readonly string[]
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

/** Endpunkte muessen URLs mit erwartetem Schema sein — sonst scheitert erst die Verbindung. */
const SCHEMES: Record<keyof RuntimeEndpoints, readonly string[] | null> = {
  relayUrl: ["ws:", "wss:"],
  profilesUrl: ["http:", "https:"],
  supabaseUrl: ["http:", "https:"],
  supabaseAnonKey: null, // keine URL
}

/** Ist der Wert als Endpunkt brauchbar? Sonst faellt er durch. */
function endpointOk(key: keyof RuntimeEndpoints, value: unknown, quelle: string): value is string {
  if (value === undefined || value === null || value === "") return false
  if (typeof value !== "string") {
    console.warn(`[rls] ${key} aus ${quelle} ist kein Text (${typeof value}) — uebersprungen.`)
    return false
  }
  const schemes = SCHEMES[key]
  if (!schemes) return true
  try {
    if (schemes.includes(new URL(value).protocol)) return true
  } catch {
    /* faellt unten durch */
  }
  console.warn(`[rls] ${key}="${value}" aus ${quelle} ist keine ${schemes.join("/")}-URL — uebersprungen.`)
  return false
}

/**
 * Nimmt den ersten BRAUCHBAREN Wert der Vorrangkette.
 *
 * Die Pruefung gehoert in die Kette, nicht dahinter: Wer erst zusammenfuehrt
 * und danach Ungueltiges loescht, verliert das Feld ganz — der Wert aus der
 * naechsten Stufe kommt nie zum Zug, obwohl er gueltig waere. Ein Tippfehler
 * in config.json nahm der Instanz so ihren Build-Zeit- oder Standardwert.
 */
function pickEndpoint(
  key: keyof RuntimeEndpoints,
  stufen: readonly { quelle: string; wert: unknown }[],
): string | undefined {
  for (const { quelle, wert } of stufen) {
    if (endpointOk(key, wert, quelle)) return wert
  }
  return undefined
}

async function fetchJson(
  fetchImpl: typeof fetch | undefined,
  url: string,
  what: string,
): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetchImpl?.(url, { cache: "no-store" })
    if (!res) return null
    if (!res.ok) {
      // Kein Fehlerfall: eine Instanz ohne diese Datei ist zulaessig.
      console.info(`[rls] Keine ${url} (${res.status}) — ${what} bleibt bei den Vorgaben.`)
      return null
    }
    const parsed: unknown = await res.json()
    if (isPlainObject(parsed)) return parsed
    console.warn(`[rls] ${url} ist kein Objekt — ignoriert.`)
    return null
  } catch (err) {
    console.warn(`[rls] ${url} nicht lesbar — ${what} bleibt bei den Vorgaben.`, err)
    return null
  }
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
  const rawBase = opts.baseUrl ?? "/"
  const base = rawBase.endsWith("/") ? rawBase : rawBase + "/"

  inFlight = (async () => {
    const fromFile = (await fetchJson(fetchImpl, `${base}config.json`, "die Konfiguration")) ?? {}

    const env = opts.buildTimeEnv ?? {}
    const fileEndpoints = isPlainObject(fromFile.endpoints)
      ? (fromFile.endpoints as Record<string, unknown>)
      : {}

    const endpoints: RuntimeEndpoints = {}
    for (const key of Object.keys(SCHEMES) as (keyof RuntimeEndpoints)[]) {
      const value = pickEndpoint(key, [
        { quelle: "config.json", wert: fileEndpoints[key] },
        { quelle: "Build-Zeit", wert: env[key] },
        { quelle: "Standard", wert: DEFAULT_RUNTIME_CONFIG.endpoints[key] },
      ])
      if (value !== undefined) endpoints[key] = value
    }

    // Auch der Connector laeuft die Kette entlang: Ein unbekannter Name in
    // config.json darf nicht die Build-Zeit-Vorgabe ueberspringen.
    const connectorOk = (v: unknown, quelle: string): v is string => {
      if (v === undefined || v === null || v === "") return false
      if (typeof v !== "string") {
        console.warn(`[rls] defaultConnector aus ${quelle} ist kein Text — uebersprungen.`)
        return false
      }
      if (opts.allowedConnectors && !opts.allowedConnectors.includes(v)) {
        console.warn(
          `[rls] defaultConnector="${v}" aus ${quelle} ist unbekannt ` +
            `(erlaubt: ${opts.allowedConnectors.join(", ")}) — uebersprungen.`,
        )
        return false
      }
      return true
    }
    let connector: string | undefined
    for (const { quelle, wert } of [
      { quelle: "config.json", wert: fromFile.defaultConnector },
      { quelle: "Build-Zeit", wert: env.defaultConnector },
      { quelle: "Standard", wert: DEFAULT_RUNTIME_CONFIG.defaultConnector },
    ]) {
      if (connectorOk(wert, quelle)) {
        connector = wert
        break
      }
    }

    let branding = isPlainObject(fromFile.branding) ? (fromFile.branding as Branding) : undefined

    // Farben aus einer eigenen Datei: getrennt geladen, damit ein Fehler dort
    // nur die Farben kostet.
    if (branding?.colorsUrl) {
      const colors = await fetchJson(fetchImpl, branding.colorsUrl, "die Farben")
      if (colors) branding = { ...branding, colors: colors as BrandingColors }
    }

    loaded = Object.freeze({
      endpoints: Object.freeze(endpoints),
      defaultConnector: connector,
      branding: branding ? freezeBranding(branding) : undefined,
    }) as RuntimeConfig
    return loaded
  })()

  return inFlight
}

/** Tief einfrieren — sonst bleiben `colors.light` und `colors.dark` mutierbar. */
function freezeBranding(b: Branding): Branding {
  if (b.colors) {
    if (b.colors.light) Object.freeze(b.colors.light)
    if (b.colors.dark) Object.freeze(b.colors.dark)
    Object.freeze(b.colors)
  }
  return Object.freeze(b)
}

/** Die geladene Konfiguration. Vor `loadRuntimeConfig` sind es die Standardwerte. */
export function getRuntimeConfig(): RuntimeConfig {
  return loaded ?? DEFAULT_RUNTIME_CONFIG
}

// Tokennamen und -werte stammen aus einer Datei, die der Betreiber schreibt.
// Sie landen in einem Style-Attribut, also wird beides eng gehalten: Namen
// nur als schlichte Bezeichner, Werte ohne alles, was die Deklaration
// verlassen oder etwas nachladen koennte. Klammern bleiben erlaubt — die
// Tokens des Toolkits sind oklch(), und rgb()/hsl() sind ebenso legitim.
const TOKEN_NAME = /^[a-z0-9-]+$/i
const UNSAFE_VALUE = /[;{}<>\\@]|url\s*\(|expression\s*\(|\/\*/i

function valueOk(v: unknown): v is string {
  return typeof v === "string" && v.length > 0 && v.length <= 128 && !UNSAFE_VALUE.test(v)
}

/**
 * Namen der Tokens, die das Toolkit tatsaechlich definiert — zur Laufzeit aus
 * den geladenen Stylesheets abgeleitet statt als Liste gepflegt (es sind ueber
 * hundert, und eine zweite Liste liefe der ersten davon).
 *
 * Liefert `null`, wenn sich nichts ermitteln laesst (kein CSS geladen). Dann
 * wird NICHT gefiltert: lieber ein wirkungsloses Token setzen, als bei einem
 * frueh laufenden Aufruf das ganze Branding zu verwerfen.
 */
function knownTokens(doc: Document): Set<string> | null {
  const found = new Set<string>()
  for (const sheet of Array.from(doc.styleSheets)) {
    let rules: CSSRule[]
    try {
      rules = Array.from(sheet.cssRules)
    } catch {
      continue // fremde Herkunft — nicht lesbar, kein Fehler
    }
    for (const rule of rules) {
      const style = (rule as CSSStyleRule).style
      if (!style) continue
      for (const name of Array.from(style)) {
        if (name.startsWith("--")) found.add(name.slice(2))
      }
    }
  }
  return found.size > 0 ? found : null
}

function filterTokens(
  tokens: Record<string, string> | undefined,
  known: Set<string> | null,
): [string, string][] {
  if (!tokens) return []
  const out: [string, string][] = []
  for (const [name, value] of Object.entries(tokens)) {
    if (!TOKEN_NAME.test(name)) {
      console.warn(`[rls] Branding-Token "${name}" ignoriert — unzulaessiger Name.`)
      continue
    }
    if (!valueOk(value)) {
      console.warn(`[rls] Branding-Token "${name}" ignoriert — unzulaessiger Wert.`)
      continue
    }
    if (known && !known.has(name)) {
      console.warn(`[rls] Branding-Token "${name}" ignoriert — kein Token des Toolkits.`)
      continue
    }
    out.push([name, value])
  }
  return out
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

  const known = knownTokens(doc)

  for (const [name, value] of filterTokens(branding.colors?.light, known)) {
    doc.documentElement.style.setProperty(`--${name}`, value)
  }

  const dark = filterTokens(branding.colors?.dark, known)
  if (dark.length > 0) {
    const styleId = "rls-branding-dark"
    const style =
      doc.getElementById(styleId) ??
      doc.head.appendChild(Object.assign(doc.createElement("style"), { id: styleId }))
    style.textContent = `.dark { ${dark.map(([n, v]) => `--${n}: ${v};`).join(" ")} }`
  }
}
