// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  t,
  getLanguage,
  setLanguage,
  getLocale,
  subscribeLanguage,
  applyLanguageConfig,
  extendMessages,
  resetI18nForTests,
  formatRelativeTime,
  formatFullDateTime,
} from "../src/i18n"


/**
 * Die i18n-Laufzeit ist eine dünne Schicht über `Intl` — getestet werden die
 * Regeln, die NICHT von Intl kommen: die Vorrangketten (Sprache und Text),
 * Platzhalter, Plural-Auswahl und der Sprachzustand.
 */
describe("i18n-Laufzeit", () => {
  beforeEach(() => {
    resetI18nForTests()
    setLanguage("de")
    vi.spyOn(console, "warn").mockImplementation(() => {})
  })

  afterEach(() => {
    resetI18nForTests()
    vi.restoreAllMocks()
    // fakeBrowserLanguages legt eine eigene Instanz-Eigenschaft an (configurable),
    // die die jsdom-Vorgabe am Prototyp nur ÜBERDECKT — löschen stellt sie wieder her.
    delete (navigator as unknown as Record<string, unknown>).languages
  })

  describe("Sprachzustand", () => {
    it("wechselt die Sprache und benachrichtigt Abonnenten", () => {
      const listener = vi.fn()
      subscribeLanguage(listener)

      setLanguage("en")

      expect(getLanguage()).toBe("en")
      expect(listener).toHaveBeenCalledTimes(1)
      expect(t("userMenu.contacts")).toBe("Contacts")
    })

    it("persistiert die Nutzerwahl", () => {
      setLanguage("en")
      expect(localStorage.getItem("rls.language")).toBe("en")
    })

    it("benachrichtigt nicht, wenn sich nichts ändert", () => {
      const listener = vi.fn()
      subscribeLanguage(listener)
      setLanguage("de")
      expect(listener).not.toHaveBeenCalled()
    })
  })

  describe("Instanz-Konfiguration", () => {
    it("übernimmt die Instanz-Vorgabe, solange der Nutzer nie gewählt hat", () => {
      resetI18nForTests() // verwirft auch die localStorage-Wahl aus beforeEach
      applyLanguageConfig({ defaultLanguage: "en" })
      expect(getLanguage()).toBe("en")
    })

    it("lässt die Instanz-Vorgabe NICHT über die Nutzerwahl gewinnen", () => {
      // setLanguage("de") in beforeEach ist eine persistierte Nutzerwahl.
      setLanguage("en")
      applyLanguageConfig({ defaultLanguage: "de" })
      expect(getLanguage()).toBe("en")
    })

    it("Instanz-Override schlägt Toolkit-Wörterbuch — der White-Label-Kern", () => {
      applyLanguageConfig({ strings: { de: { "userMenu.contacts": "Vertraute" } } })
      expect(t("userMenu.contacts")).toBe("Vertraute")
      // ... aber nur in der Sprache, für die er gilt.
      setLanguage("en")
      expect(t("userMenu.contacts")).toBe("Contacts")
    })

    it("Instanz-Override schlägt auch App-Erweiterungen", () => {
      extendMessages({ de: { "app.greeting": "Hallo" } })
      applyLanguageConfig({ strings: { de: { "app.greeting": "Moin" } } })
      expect(t("app.greeting")).toBe("Moin")
    })

    it("ignoriert eine unbekannte Sprache in der Vorgabe", () => {
      applyLanguageConfig({ defaultLanguage: "fr" })
      expect(getLanguage()).toBe("de")
    })

    it("übernimmt nur String-Werte aus strings — ein Objekt verdeckt sonst den Rückfall", () => {
      // config.json ist ungeprüftes JSON: ein Objekt an dieser Stelle wäre für
      // t() ein „vorhandener" Eintrag, den es nicht rendern kann — der Rückfall
      // aufs Wörterbuch käme nie zum Zug.
      applyLanguageConfig({
        strings: {
          de: { "userMenu.contacts": { nested: "kaputt" }, "userMenu.profile": "Steckbrief" },
          fr: { "userMenu.contacts": "Contacts" },
        } as unknown as Record<string, Record<string, string>>,
      })

      expect(t("userMenu.contacts")).toBe("Kontakte") // Wörterbuch, nicht das Objekt
      expect(t("userMenu.profile")).toBe("Steckbrief") // der gültige Nachbar gilt trotzdem
      expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("userMenu.contacts"))
    })
  })

  describe("Formatierungs-Locale ≠ Nachrichtensprache", () => {
    function fakeBrowserLanguages(languages: string[]) {
      Object.defineProperty(navigator, "languages", { value: languages, configurable: true })
    }

    it("behält die regionale Locale des Browsers, wenn sie zur Sprache passt", () => {
      // en-GB-Nutzer: Wörterbuch „en", aber Datum 18/08/2026 — nicht 8/18/26.
      fakeBrowserLanguages(["en-GB", "de-DE"])
      setLanguage("en")
      expect(getLocale()).toBe("en-GB")
      expect(formatFullDateTime(new Date("2026-08-18T14:32:00"))).toContain("18 August")
    })

    it("fällt auf die nackte Sprache zurück, wenn keine Browser-Locale passt", () => {
      fakeBrowserLanguages(["de-DE"])
      setLanguage("en")
      expect(getLocale()).toBe("en")
    })

    it("nimmt die passende Locale auch von hinterer Position", () => {
      fakeBrowserLanguages(["en-US", "de-AT"])
      setLanguage("de")
      expect(getLocale()).toBe("de-AT")
    })
  })

  describe("Textauflösung", () => {
    it("fällt für App-Schlüssel ohne Übersetzung auf die deutsche Referenz zurück", () => {
      extendMessages({ de: { "app.only": "Nur deutsch" } })
      setLanguage("en")
      expect(t("app.only")).toBe("Nur deutsch")
    })

    it("gibt bei gänzlich fehlendem Schlüssel den Schlüssel zurück und warnt", () => {
      expect(t("gibt.es.nicht")).toBe("gibt.es.nicht")
      expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("gibt.es.nicht"))
    })

    it("ersetzt Platzhalter", () => {
      expect(t("item.editedBy", { name: "Timo", date: "18. Aug." })).toBe(
        "Bearbeitet von Timo am 18. Aug.",
      )
    })

    it("lässt einen fehlenden Parameter sichtbar stehen", () => {
      // Ein sichtbarer Platzhalter ist ein auffindbarer Fehler, eine still
      // verschluckte Lücke nicht.
      expect(t("item.editedBy", { name: "Timo" })).toBe("Bearbeitet von Timo am {date}")
    })
  })

  describe("Plural", () => {
    it("wählt die Kategorie über Intl.PluralRules der aktiven Sprache", () => {
      extendMessages({
        de: { "app.groups": { one: "{count} Gruppe", other: "{count} Gruppen" } },
        en: { "app.groups": { one: "{count} group", other: "{count} groups" } },
      })

      expect(t("app.groups", { count: 1 })).toBe("1 Gruppe")
      expect(t("app.groups", { count: 7 })).toBe("7 Gruppen")
      setLanguage("en")
      expect(t("app.groups", { count: 1 })).toBe("1 group")
    })

    it("fällt ohne count auf `other` zurück und warnt", () => {
      extendMessages({ de: { "app.groups": { one: "{count} Gruppe", other: "Gruppen" } } })
      expect(t("app.groups")).toBe("Gruppen")
      expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("app.groups"))
    })
  })

  describe("Zeitformatierung über die aktive Sprache", () => {
    it("formatiert relative Zeit je Sprache", () => {
      const threeHoursAgo = new Date(Date.now() - 3 * 3600_000)
      expect(formatRelativeTime(threeHoursAgo)).toContain("vor 3")
      setLanguage("en")
      expect(formatRelativeTime(threeHoursAgo)).toContain("3 hr")
    })

    it("zeigt Zukunftszeiten als Zukunft, nicht als „gerade eben“", () => {
      // Mit Vorzeichen-Schwellen fiel JEDE Zukunftszeit in den ersten Ast:
      // ein Termin in drei Stunden hieß „gerade eben".
      const inThreeHours = new Date(Date.now() + 3 * 3600_000)
      expect(formatRelativeTime(inThreeHours)).toContain("in 3")
      setLanguage("en")
      expect(formatRelativeTime(inThreeHours)).toContain("in 3 hr")
    })

    it("sagt „morgen“ für den nächsten Tag", () => {
      const tomorrow = new Date(Date.now() + 25 * 3600_000)
      expect(formatRelativeTime(tomorrow)).toBe("morgen")
      setLanguage("en")
      expect(formatRelativeTime(tomorrow)).toBe("tomorrow")
    })

    it("sagt „gestern“ in der Sprache des Nutzers", () => {
      const yesterday = new Date(Date.now() - 25 * 3600_000)
      expect(formatRelativeTime(yesterday)).toBe("gestern")
      setLanguage("en")
      expect(formatRelativeTime(yesterday)).toBe("yesterday")
    })

    it("formatiert den vollen Zeitstempel je Sprache", () => {
      const date = new Date("2026-08-18T14:32:00")
      expect(formatFullDateTime(date)).toContain("August")
      expect(formatFullDateTime(date)).toContain("14:32")
      setLanguage("en")
      expect(formatFullDateTime(date)).toMatch(/2:32|14:32/)
    })
  })
})
