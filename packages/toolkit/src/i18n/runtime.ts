/**
 * i18n-Laufzeit des Toolkits — eine dünne Schicht über `Intl`.
 *
 * **Warum kein i18next:** das Toolkit ist eine Bibliothek. Es besitzt die
 * Texte, die es selbst rendert, und darf dafür keine Initialisierung der
 * Host-App voraussetzen — die App, die sie vergisst, zeigt sonst rohe
 * Schlüssel. Plural entscheidet `Intl.PluralRules`, Datum und Zeit formatiert
 * `Intl.DateTimeFormat`; was hier liegt, ist nur Nachschlagen, Platzhalter und
 * der Sprachzustand. Die Wörterbücher sind 1:1 nach JSON übersetzbar, damit
 * ein späterer Wechsel zu einem Übersetzungswerkzeug den Bestand behält.
 *
 * **Vorrangkette der Sprache:** Nutzerwahl (localStorage) → Instanz-Vorgabe
 * (`config.json`, siehe {@link applyLanguageConfig}) → Browsersprache → `de`.
 *
 * **Vorrangkette je Text:** Instanz-Override → App-Erweiterung → Toolkit-
 * Wörterbuch → deutsche Referenz. Die Instanz-Ebene ist kein Randfall,
 * sondern der White-Label-Kern: eine Instanz muss „Gruppe" in „Kreis"
 * umbenennen können, ohne einen Build anzufassen.
 */
import { de, type Message, type MessageKey } from "./de"
import { en } from "./en"

export type { Message, MessageKey }

export type Language = "de" | "en"

export const SUPPORTED_LANGUAGES: readonly Language[] = ["de", "en"]

const STORAGE_KEY = "rls.language"

const builtin: Record<Language, Record<string, Message>> = { de, en }

/** App-Erweiterungen ({@link extendMessages}) — unter dem Instanz-Override. */
const extensions: Record<Language, Record<string, Message>> = { de: {}, en: {} }

/** Instanz-Overrides ({@link applyLanguageConfig}) — oberste Ebene. */
const overrides: Record<Language, Record<string, Message>> = { de: {}, en: {} }

function isLanguage(value: unknown): value is Language {
  return typeof value === "string" && (SUPPORTED_LANGUAGES as readonly string[]).includes(value)
}

function storedLanguage(): Language | null {
  try {
    const raw = typeof localStorage === "undefined" ? null : localStorage.getItem(STORAGE_KEY)
    return isLanguage(raw) ? raw : null
  } catch {
    return null // Safari-Privatmodus u.ä. — Zugriff darf die App nie kosten.
  }
}

function browserLanguage(): Language | null {
  if (typeof navigator === "undefined") return null
  // Nur der primäre Subtag zählt: `en-US` und `en-GB` sind beide unser `en`.
  const primary = (navigator.language ?? "").toLowerCase().split("-")[0]
  return isLanguage(primary) ? primary : null
}

/** Instanz-Vorgabe aus der Runtime-Config; `null` bis {@link applyLanguageConfig}. */
let instanceDefault: Language | null = null

let current: Language = storedLanguage() ?? browserLanguage() ?? "de"

const listeners = new Set<() => void>()

function notify(): void {
  for (const listener of listeners) listener()
}

export function getLanguage(): Language {
  return current
}

/** Nutzerwahl — persistiert und ab sofort ranghöchste Stufe. */
export function setLanguage(language: Language): void {
  if (!isLanguage(language) || language === current) return
  current = language
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(STORAGE_KEY, language)
  } catch {
    /* nicht persistierbar — für die laufende Sitzung gilt die Wahl trotzdem */
  }
  notify()
}

/** Benachrichtigt bei jedem Sprachwechsel. Rückgabe: abbestellen. */
export function subscribeLanguage(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/**
 * Instanz-Konfiguration übernehmen — dieselbe Stelle im App-Start wie
 * `applyBranding` (Spec 11). Die Vorgabe greift nur, solange der Nutzer noch
 * nie gewählt hat: eine gespeicherte Wahl übersteuert die Instanz, nicht
 * umgekehrt.
 */
export function applyLanguageConfig(config: {
  defaultLanguage?: string
  strings?: Record<string, Record<string, string>>
}): void {
  if (isLanguage(config.defaultLanguage)) {
    instanceDefault = config.defaultLanguage
    if (storedLanguage() === null && current !== instanceDefault) {
      current = instanceDefault
      notify()
    }
  }
  if (config.strings) {
    for (const [lang, messages] of Object.entries(config.strings)) {
      if (!isLanguage(lang)) continue
      Object.assign(overrides[lang], messages)
    }
    notify()
  }
}

/**
 * App-eigene Schlüssel nachtragen (unterhalb der Instanz-Overrides).
 * Für Texte, die nur die App kennt — Modul-Labels, App-Dialoge.
 */
export function extendMessages(messages: Partial<Record<Language, Record<string, Message>>>): void {
  for (const [lang, entries] of Object.entries(messages)) {
    if (!isLanguage(lang) || !entries) continue
    Object.assign(extensions[lang], entries)
  }
  notify()
}

/** Nur für Tests — setzt Sprache, Overrides und Erweiterungen zurück. */
export function resetI18nForTests(): void {
  try {
    if (typeof localStorage !== "undefined") localStorage.removeItem(STORAGE_KEY)
  } catch { /* egal */ }
  instanceDefault = null
  current = browserLanguage() ?? "de"
  for (const lang of SUPPORTED_LANGUAGES) {
    extensions[lang] = {}
    overrides[lang] = {}
  }
  listeners.clear()
}

export type MessageParams = Record<string, string | number>

function lookup(language: Language, key: string): Message | undefined {
  return overrides[language][key] ?? extensions[language][key] ?? builtin[language][key]
}

/**
 * Platzhalter ersetzen. Ein fehlender Parameter bleibt als `{name}` sichtbar
 * stehen — ein sichtbarer Platzhalter ist ein auffindbarer Fehler, eine still
 * verschluckte Lücke nicht.
 */
function interpolate(template: string, params?: MessageParams): string {
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  )
}

/**
 * Text zur aktiven Sprache.
 *
 * Plural-Einträge brauchen `count` in den Parametern; die Kategorie wählt
 * `Intl.PluralRules` der aktiven Sprache. Fehlt ein Schlüssel in der aktiven
 * Sprache, greift die deutsche Referenz; fehlt er ganz (nur bei App- oder
 * Override-Schlüsseln möglich — Toolkit-Schlüssel prüft der Compiler), kommt
 * der Schlüssel selbst zurück und die Konsole meldet es.
 */
export function t(key: MessageKey | (string & {}), params?: MessageParams): string {
  const message = lookup(current, key) ?? lookup("de", key)
  if (message === undefined) {
    console.warn(`[i18n] fehlender Schlüssel: ${key}`)
    return key
  }
  if (typeof message === "string") return interpolate(message, params)

  const count = typeof params?.count === "number" ? params.count : undefined
  if (count === undefined) {
    console.warn(`[i18n] Plural-Schlüssel ohne count: ${key}`)
    return interpolate(message.other, params)
  }
  const category = new Intl.PluralRules(current).select(count)
  return interpolate(message[category] ?? message.other, params)
}

// --- Datum und Zeit — immer über die aktive Sprache ---

export function formatDate(date: string | Date, options?: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(current, options ?? { day: "numeric", month: "short" }).format(new Date(date))
}

export function formatTime(date: string | Date): string {
  return new Intl.DateTimeFormat(current, { hour: "2-digit", minute: "2-digit" }).format(new Date(date))
}

/** Voller Zeitstempel für Tooltips („18. August 2026 um 14:32"). */
export function formatFullDateTime(date: string | Date): string {
  return new Intl.DateTimeFormat(current, { dateStyle: "long", timeStyle: "short" }).format(new Date(date))
}

/**
 * Relative Zeit („vor 3 Std." / „3 hr. ago"), jenseits einer Woche das Datum.
 *
 * `numeric: "auto"` liefert „gestern"/„yesterday" statt „vor 1 Tag" — das
 * entspricht dem bisherigen deutschen Verhalten, nur jetzt aus `Intl` statt
 * aus selbst zusammengesetzten Wörtern.
 */
export function formatRelativeTime(date: string | Date): string {
  const then = new Date(date)
  const diffMs = Date.now() - then.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  const diffH = Math.floor(diffMin / 60)
  const diffD = Math.floor(diffH / 24)

  if (diffMin < 1) return t("time.justNow")
  const short = new Intl.RelativeTimeFormat(current, { numeric: "always", style: "short" })
  if (diffMin < 60) return short.format(-diffMin, "minute")
  if (diffH < 24) return short.format(-diffH, "hour")
  if (diffD < 7) {
    return new Intl.RelativeTimeFormat(current, { numeric: "auto" }).format(-diffD, "day")
  }

  const sameYear = then.getFullYear() === new Date().getFullYear()
  return new Intl.DateTimeFormat(current, {
    day: "numeric",
    month: "long",
    ...(sameYear ? {} : { year: "numeric" }),
  }).format(then)
}
