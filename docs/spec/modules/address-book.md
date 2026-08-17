# Address Book Module

**Status:** Normativer Entwurf v0.1

Das Address Book Module ist ein Adressbuch-Modul für den Current Space. Es macht Kontaktdatensätze (Personen mit Namen, Firma, E-Mail, Telefon, Anschrift) sichtbar, sortier- und filterbar.

## Zweck

Das Adressbuch beantwortet im Current Space die Frage:

> Wen habe ich hier abgelegt, wie erreiche ich sie oder ihn, und in welchem Kontext steht die Person?

Es unterstützt:

- Anlegen neuer Kontakte mit strukturierten Feldern (Vor-/Nachname, Firma, Berufsbezeichnung, E-Mail-Liste, Telefon-Liste, Webseite, Anschrift),
- Sortieren nach Nachname, Vorname oder Firma,
- Filtern über Etiketten (Tags) und Freitext,
- Öffnen der Detailansicht mit allen gepflegten Angaben,
- Pflege wiederverwendbarer Etiketten mit Autocomplete aus bereits im Space vergebenen Tags.

## Einordnung

| Frage | Antwort |
|---|---|
| Space Module? | Ja |
| App-Shell-Fläche? | Nein — die vorhandene `contacts/`-Fläche im Toolkit betrifft WoT-Kontakte (Verifikation, Challenge). Das Adressbuch ist eine eigene, kuratierte Datenbasis pro Space. |
| Module Components | `ItemPreview` + Adornments, `ContentComposer` mit `title`, `text`, `tags`-Widget (Autocomplete), `ItemDetailPanel`, `ListView`, `FilterBar`, `TagChip`, `Avatar` |
| Primäre Datenbasis | Items (`type: "person"` mit `contact/v1`-Feldern) |
| Externe Semantik | keine |

## Datenmodell

Das Adressbuch liest Items mit `type: "person"`, deren `data` das `contact/v1`-Vokabular tragen. Aktivierung erfolgt über Feld-Präsenz `data.familyName` (nicht über `type` allein — Personen ohne Kontaktdaten bleiben im Modul unsichtbar).

Genutzte Vokabulare:

| Vokabular | Bedeutung im Modul |
|---|---|
| `base/v1` | `title`, `description` (Notizfeld), `tags` top-level, `createdAt`, `createdBy` |
| `person/v1` | `displayName` (wird automatisch als `familyName, givenName` gebildet), optional `avatarUrl` |
| `contact/v1` | Adressbuch-Felder (siehe [../schemas/vocab/contact/v1/schema.json](../schemas/vocab/contact/v1/schema.json)) |

Feld-Übersicht `contact/v1`:

| Feld | Muss? | Bedeutung im Modul |
|---|---:|---|
| `familyName` | ja | Nachname. Primärer Sortierschlüssel und Aktivierungsfeld. |
| `givenName` | nein | Vorname. Sekundärer Sortierschlüssel. |
| `organization` | nein | Firma. Tertiärer Sortierschlüssel. |
| `jobTitle` | nein | Rolle im Unternehmen. |
| `email` | nein | Liste. Erster Eintrag ist der primäre. |
| `phone` | nein | Liste. Erster Eintrag ist der primäre. |
| `website` | nein | URL. |
| `streetAddress`, `postalCode`, `city`, `country` | nein | Anschrift. |

Etiketten leben als top-level `tags[]` am Item (siehe [../07-tags.md](../07-tags.md)). Das Modul nutzt einfache String-Tags im Sinne von Spec 07 §Einfache Tags.

Relations, Confirmations: nicht genutzt in v0.1.

## Sortierung

Basissortierung ist aufsteigend nach `familyName`, dann `givenName`, dann `organization`. Nutzerinnen und Nutzer dürfen andere Sortierungen wählen (Erstellungsdatum, Firma). Die Sortierung ist keine Trust-, Prioritäts- oder Wahrheitsaussage.

## Capabilities

| Capability | Verhalten, wenn vorhanden | Verhalten, wenn fehlt |
|---|---|---|
| `DataInterface` | Kontakte lesen und beobachten | Modul kann nicht sinnvoll rendern |
| `ItemWriter` | Kontakte anlegen, bearbeiten, löschen | Composer und schreibende Aktionen ausblenden oder deaktivieren |
| `Authenticatable` | Current User und Autorinformationen auflösen | auf `createdBy` fallbacken |
| `ProfileCapable` | reichere Autorprofile anzeigen (wer hat den Kontakt gepflegt) | Name/Avatar fallbacken auf verfügbare Daten |
| `AuthorizationCapable` | Edit/Delete pro Kontakt nach Backend-Regel prüfen | Edit/Delete für alle Nutzer sichtbar; Backend akzeptiert oder lehnt beim Schreiben ab |

`RelationCapable`, `ConfirmationCapable`, `RelationCapable`, `ContactManager`, `EncounterVerificationCapable` werden vom Adressbuch nicht benötigt und dürfen fehlen.

## Aktionen

| Aktion | Voraussetzung | Effekt |
|---|---|---|
| Kontakte anzeigen | `DataInterface` | Liste aller `type: "person"` mit `data.familyName` im Current Space |
| Kontakt öffnen | Item vorhanden | Detailansicht im `ItemDetailPanel` |
| Kontakt anlegen | `ItemWriter` | Neues `type: "person"` mit `contact/v1`-Feldern. `data.displayName` wird beim Speichern aus `familyName, givenName` gebildet, wenn nicht explizit gesetzt. |
| Kontakt bearbeiten | `ItemWriter`, ggf. `AuthorizationCapable` | Felder ändern; `displayName` wird bei jedem Speichern neu abgeleitet, falls nicht explizit überschrieben |
| Kontakt löschen | `ItemWriter`, ggf. `AuthorizationCapable` | Item entfernen |
| Filtern nach Etikett | `DataInterface` (`hasTag`-Filter) | Nur Kontakte mit den gewählten Tags anzeigen |
| Freitext-Suche | `DataInterface` | Clientseitige Filterung über die geladene Menge nach `familyName`, `givenName`, `organization` |

Alle Mutationen laufen über Hooks (`useMutations`, `useItemEditor`).

## Tag-Autocomplete

Das Composer-Widget `tags` (`packages/toolkit/src/components/composer/widgets/tags-widget.tsx`) bietet über seine `suggestions`-Prop bereits Autocomplete. Das Adressbuch füttert diese Prop mit der Menge aller bereits im Current Space vergebenen Tags — abgeleitet aus den geladenen Items via `Set(items.flatMap(i => i.tags ?? []))`. Kein neuer Widget-Code.

## Cross-Module-Verhalten

Das Adressbuch darf Kontakte an andere Module übergeben, ohne diese zu importieren:

- Ein Kontakt mit `data.streetAddress` und `data.city` kann in der Map geöffnet werden, sobald ein Kontakt zusätzlich eine `position` (aus `place/v1`) erhält. Das Adressbuch geokodiert nicht.
- Ein Kontakt mit `data.email` kann als Empfänger in einem Composer-Feld erscheinen, sobald ein anderes Modul das anbietet.

Die Navigation ist App- oder Shell-Verantwortung.

## Komponenten

| Komponente | Rolle | Wiederverwendbar? |
|---|---|---|
| `ItemPreview` + Adornments | Karten- oder Zeilen-Anzeige eines Kontakts | ja, shared |
| `ListView` | Linsen-Layout für die Kontaktliste | ja, shared |
| `ContentComposer` mit Widgets `title`, `text`, `tags` | Kontakt-Formular | ja |
| `ItemDetailPanel` | Detailansicht | ja |
| `FilterBar` + `applyItemListFilter` | Filter über Tags und Freitext | ja |
| `TagChip` | Etikett-Anzeige | ja |
| `Avatar` | Profilbild (aus `person/v1.avatarUrl`) | ja |
| `EmptyState` | Leerer Zustand | ja |
| `CreateFab` | Einstieg zum Anlegen | ja |

Alle Komponenten aus dem Bestand. Das Modul selbst bringt nur die Verdrahtung (View, Aktivierungsregel im Vocab-Modul, Type-Presentation).

## Nicht-Ziele

Das Address Book Module definiert nicht:

- Sales-Pipeline mit Stages, Deal-Werten oder Vertriebs-Metriken (V2 als Erweiterung oder als eigenes Modul auf denselben Items),
- Erinnerungen oder zeitgesteuerte Aktionen ("melde dich in zwei Wochen") — kein Server im Modul-Vertrag,
- Import aus vCard, CardDAV, Outlook oder Google Contacts (V2),
- Duplikat-Erkennung und Merge (V2),
- Detail-Reiter (Übersicht / Details / Anschrift) auf gestapelten Overlay-Flächen — es gibt eine Detail-Fläche pro Ebene,
- Aggregate wie "wie viele Kontakte pro Firma" — nicht im DataInterface-Vertrag,
- WoT-Verifikation, Challenge oder Attestation — dafür ist die App-Shell-Fläche `contacts/` zuständig,
- Geokodierung von Anschriften.

## Implementierungsreferenzen

Vokabular: [../schemas/vocab/contact/v1/](../schemas/vocab/contact/v1/)
Aktivierungsregel: `packages/data-interface/src/vocab.ts` — neuer Zweig für `contact/v1` bei Feld-Präsenz `data.familyName`.
Typ-Manifest: `packages/data-interface/src/type-manifest.ts` — bestehender `type: "person"` bleibt unverändert.
View: `apps/reference/src/views/address-book-view.tsx` (neu) bzw. Register in `apps/reference/src/hooks/use-workspace-routing.ts` als `VALID_MODULES`-Eintrag `address-book`.

## Offene Punkte

1. Soll `data.displayName` beim Editieren immer aus `familyName, givenName` neu abgeleitet werden, oder darf ein manuell gesetzter `displayName` gewinnen? V1 leitet ab, wenn der Nutzer das Feld leer lässt.
2. Ist `data.email` als `format: "email"` streng zu validieren, oder reicht ein string? V1 setzt `format: "email"` — Ajv-Standard-Validierung.
3. Land als Freitext oder ISO-3166-Code? V1: Freitext, weil das Adressbuch heute rein anzeigend ist.
4. Wie geht das Modul mit Personen ohne `familyName` um (z.B. Firmenkontakte ohne Ansprechperson)? V1: sie erscheinen nicht — sie sollen als eigener Kontakt-Typ oder mit einem Ersatz-Namen angelegt werden. V2 kann die Aktivierungsregel auf `familyName || organization` erweitern.
