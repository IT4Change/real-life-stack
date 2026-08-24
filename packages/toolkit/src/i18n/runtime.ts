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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
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

/**
 * Formatierungs-Locale ≠ Nachrichtensprache (rls#289).
 *
 * `en` wählt das Wörterbuch — aber ein `en-GB`-Browser erwartet `18/08/2026`,
 * kein `8/18/26`. Für `Intl` bleibt deshalb die volle regionale Locale des
 * Browsers erhalten, sofern ihr primärer Subtag zur gewählten Sprache passt;
 * erst wenn keine passt (deutscher Browser, englisch gewählt), fällt die
 * Formatierung auf die nackte Sprache zurück.
 */
function resolveLocale(language: Language): string {
  if (typeof navigator !== "undefined") {
    const candidates = navigator.languages ?? [navigator.language]
    for (const tag of candidates) {
      if (typeof tag === "string" && tag.toLowerCase().split("-")[0] === language) return tag
    }
  }
  return language
}

/** Die Locale, mit der `Intl` formatiert — regional, nicht nur die Sprache. */
export function getLocale(): string {
  return resolveLocale(current)
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
  if (isRecord(config.strings)) {
    for (const [lang, messages] of Object.entries(config.strings)) {
      if (!isLanguage(lang)) {
        console.warn(`[i18n] strings["${lang}"] aus config.json: unbekannte Sprache — übersprungen.`)
        continue
      }
      if (!isRecord(messages)) {
        console.warn(`[i18n] strings["${lang}"] aus config.json ist kein Objekt — übersprungen.`)
        continue
      }
      // Nur Strings übernehmen: ein Objekt oder eine Zahl an dieser Stelle
      // würde den Rückfall auf das Wörterbuch VERDECKEN statt übersteuern —
      // t() fände einen Eintrag, könnte ihn aber nicht rendern.
      for (const [key, value] of Object.entries(messages)) {
        if (typeof value === "string") {
          overrides[lang][key] = value
        } else {
          console.warn(`[i18n] strings["${lang}"]["${key}"] ist kein Text — übersprungen.`)
        }
      }
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

/**
 * Übersetzung + Formatierung als EIN Bündel (rls#290).
 *
 * In React kommt es ausschliesslich aus `useI18n()` — wer `t` hat, hat damit
 * zwangsläufig auch das Abo auf den Sprachwechsel. Die frühere Gestalt („`t()`
 * importieren und zusätzlich an einen scheinbar ungenutzten Hook denken")
 * konnte lautlos kaputtgehen: ohne den Hook war nur der Live-Wechsel defekt,
 * ohne Typfehler. String-Helfer ausserhalb von Komponenten nehmen das Bündel
 * als Parameter und zwingen so ihren Aufrufer, es zu besitzen.
 */
export interface I18n {
  language: Language
  /** Regionale Formatierungs-Locale — kann feiner sein als `language`. */
  locale: string
  setLanguage: typeof setLanguage
  t: typeof t
  formatDate: typeof formatDate
  formatTime: typeof formatTime
  formatFullDateTime: typeof formatFullDateTime
  formatRelativeTime: typeof formatRelativeTime
}

/**
 * Schnappschuss für Code AUSSERHALB von React (Tests, Nicht-React-Aufrufer
 * der String-Helfer). In Komponenten stattdessen `useI18n()` — dieser
 * Schnappschuss abonniert nichts.
 */
export function getI18n(): I18n {
  return {
    language: current,
    locale: getLocale(),
    setLanguage,
    t,
    formatDate,
    formatTime,
    formatFullDateTime,
    formatRelativeTime,
  }
}

// --- Datum und Zeit — über die REGIONALE Locale, nicht die Sprache (rls#289) ---

export function formatDate(date: string | Date, options?: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(getLocale(), options ?? { day: "numeric", month: "short" }).format(new Date(date))
}

export function formatTime(date: string | Date): string {
  return new Intl.DateTimeFormat(getLocale(), { hour: "2-digit", minute: "2-digit" }).format(new Date(date))
}

/** Voller Zeitstempel für Tooltips („18. August 2026 um 14:32"). */
export function formatFullDateTime(date: string | Date): string {
  return new Intl.DateTimeFormat(getLocale(), { dateStyle: "long", timeStyle: "short" }).format(new Date(date))
}

/**
 * Relative Zeit („vor 3 Std." / „3 hr. ago"), jenseits einer Woche das Datum.
 *
 * Trägt beide Richtungen: ein Termin in drei Stunden ist „in 3 Std.", nicht
 * „gerade eben" — mit Vorzeichen-Schwellen fielen alle Zukunftszeiten in den
 * ersten Ast. `numeric: "auto"` liefert „gestern"/„morgen" statt „vor 1 Tag".
 */
export function formatRelativeTime(date: string | Date): string {
  const then = new Date(date)
  const diffMs = Date.now() - then.getTime() // > 0 = Vergangenheit, < 0 = Zukunft
  // Runden, nicht stutzen: „in 3 Stunden" liegt 2:59:59,9 in der Zukunft —
  // trunc machte daraus −179 Minuten und damit „in 2 Std.".
  const minutes = Math.round(diffMs / 60000)
  const hours = Math.trunc(minutes / 60)
  const days = Math.trunc(hours / 24)

  if (Math.abs(minutes) < 1) return t("time.justNow")
  const short = new Intl.RelativeTimeFormat(getLocale(), { numeric: "always", style: "short" })
  if (Math.abs(minutes) < 60) return short.format(-minutes, "minute")
  if (Math.abs(hours) < 24) return short.format(-hours, "hour")
  if (Math.abs(days) < 7) {
    return new Intl.RelativeTimeFormat(getLocale(), { numeric: "auto" }).format(-days, "day")
  }

  const sameYear = then.getFullYear() === new Date().getFullYear()
  return new Intl.DateTimeFormat(getLocale(), {
    day: "numeric",
    month: "long",
    ...(sameYear ? {} : { year: "numeric" }),
  }).format(then)
}
