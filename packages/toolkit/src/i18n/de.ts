/**
 * Deutsches Wörterbuch — die REFERENZ für alle Schlüssel.
 *
 * `MessageKey` wird aus dieser Datei abgeleitet; `en.ts` ist dagegen getypt.
 * Ein Schlüssel, der hier fehlt, ist ein Compilerfehler beim Aufrufer; einer,
 * der in `en.ts` fehlt, ein Compilerfehler dort. Es gibt keinen Zustand, in dem
 * eine Sprache still hinterherhinkt.
 *
 * Flache Schlüssel (`bereich.name`), Werte sind Strings oder Plural-Objekte
 * nach den Kategorien von `Intl.PluralRules` (`one`/`other` reicht für DE/EN;
 * weitere Sprachen bringen ihre Kategorien mit, ohne dass sich das Format
 * ändert). Platzhalter in geschweiften Klammern: `{name}`, `{count}`.
 *
 * Bewusst 1:1 nach JSON übersetzbar: sollte später ein Übersetzungswerkzeug
 * oder i18next andocken, sind diese Dateien der Bestand — nur die Laufzeit
 * würde getauscht.
 */
export const de = {
  // --- Nutzermenü ---
  "userMenu.profile": "Profil",
  "userMenu.contacts": "Kontakte",
  "userMenu.verify": "Verifizieren",
  "userMenu.settings": "Einstellungen",
  "userMenu.logout": "Abmelden",
  "userMenu.language": "Sprache",

  // --- Zeit ---
  "time.justNow": "gerade eben",
  "time.until": "bis",
  "time.allDay": "Ganztägig",

  // --- Item-Karte ---
  "item.editedBy": "Bearbeitet von {name} am {date}",
  "item.edited": "bearbeitet",
} as const

/** Ein Eintrag: fester Text oder Plural-Formen nach `Intl.PluralRules`. */
export type Message = string | (Partial<Record<Intl.LDMLPluralRule, string>> & { other: string })

export type MessageKey = keyof typeof de
