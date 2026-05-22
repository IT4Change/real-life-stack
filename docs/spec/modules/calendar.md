# Calendar Module

**Status:** Normativer Entwurf v0.1

Das Calendar Module ist die zeitliche Projektion von Items im Current Space. Es macht sichtbar, welche Events, Aufgaben, Quests oder anderen zeitgebundenen Items in einem Zeitraum relevant sind.

## Zweck

Das Modul beantwortet im Current Space die Frage:

> Was passiert wann?

Es unterstützt:

- schnelles Scannen eines Monats oder Zeitraums,
- Anzeigen anstehender Events,
- Öffnen zeitgebundener Items in Detailansichten oder anderen Space Modules,
- Wiederverwenden derselben Items in Feed, Kanban oder Map, wenn passende Felder vorhanden sind.

## Einordnung

| Frage | Antwort |
|---|---|
| Space Module? | Ja |
| App-Shell-Fläche? | Nein |
| Module Components | CalendarView, CalendarHeader, CalendarFilters, MonthView, WeekView, DayView, ListView, EventPreview |
| Primäre Datenbasis | Items |
| Externe Semantik | optional RLNP/Game/WoT-Projektionen, aber nicht durch Calendar definiert |

## Datenmodell

Das Calendar Module liest Items im Current Space, die ein kalendarisches Startdatum tragen. Es ist damit feldbasiert, nicht primär typbasiert.

Typische calendar-fähige Item-Typen:

```text
event, task, quest, quest-run, campaign-phase, project
```

Diese Liste ist offen. Entscheidend ist, ob ein Item zeitlich darstellbar ist.

| Feld | Bedeutung im Calendar |
|---|---|
| `data.title` / `data.name` | Event- oder Item-Titel |
| `data.start` | Startzeitpunkt; macht ein Item calendar-fähig |
| `data.end` | optionaler Endzeitpunkt |
| `data.location` / `data.address` | räumlicher Kontext |
| `data.description` / `data.content` | Kurzbeschreibung oder Detailtext |
| `data.tags` | Themen, Filter oder Hinweise |
| `createdAt` | Erstellzeitpunkt, nicht Terminzeitpunkt |
| `createdBy` | Ursprung oder Autor |

Projektionen:

| Projektion | Muss? | Quelle | Bedeutung im Modul |
|---|---:|---|---|
| Items | ja | `DataInterface` | zeitgebundene Items anzeigen |
| Relations | nein | `RelationCapable` | Teilnehmer, zugehörige Tasks oder Kontextbezüge anzeigen |
| Confirmations | nein | `ConfirmationCapable` | bestätigte Teilnahme oder bestätigte Durchführung anzeigen |
| Groups/Spaces | nein | `GroupManager` / App Shell | Current Space und ggf. sichtbare Kalenderquellen auswählen |

Regeln:

1. Ein Item erscheint im Calendar, wenn es ein parsebares `data.start` besitzt.
2. `data.end` darf Dauer oder Ende ausdrücken, ist aber optional.
3. `createdAt` darf nicht als Terminzeitpunkt interpretiert werden.
4. Ein Calendar-Event ist keine Teilnahmebestätigung und keine Completion.
5. Teilnahme, Durchführung, Zusage oder Verifikation werden über Relations oder Confirmations sichtbar, nicht aus dem bloßen Kalendereintrag erfunden.
6. Legacy- oder Prototypdaten wie `startTime` / `endTime` müssen durch Adapter auf `data.start` / `data.end` normalisiert werden. Toolkit-Komponenten dürfen solche Aliase lesen, aber die Spec-Felder bleiben `data.start` und `data.end`.

## Capabilities

| Capability | Verhalten, wenn vorhanden | Verhalten, wenn fehlt |
|---|---|---|
| `DataInterface` | zeitgebundene Items lesen und beobachten | Calendar kann nicht sinnvoll rendern |
| `ItemWriter` | Events erstellen, bearbeiten oder löschen | Calendar read-only anzeigen; Create/Edit/Delete ausblenden oder deaktivieren |
| `RelationCapable` | Teilnehmer, Kommentare, verknüpfte Tasks oder Kontextbezüge laden | relationale Details ausblenden oder nur eingebettete `item.relations[]` anzeigen |
| `GroupManager` | Space-Kontext, Mitglieder oder Kalenderquellen laden | Current Space und Filter müssen von App Shell oder Props kommen |
| `Authenticatable` | Current User für neue Events oder Teilnahmeaktionen nutzen | nutzerbezogene Aktionen ausblenden oder auf vorhandene IDs fallbacken |
| `ProfileCapable` | Teilnehmer oder Autorprofile anzeigen | IDs oder einfache User-Daten anzeigen |
| `ConfirmationCapable` | bestätigte Teilnahme, Durchführung oder Trust-Hinweise anzeigen | Confirmation-bezogene Anzeigen ausblenden |
| `ConfirmationWriterCapable` | Teilnahme oder Durchführung bestätigen, wenn fachlich erlaubt | Bestätigungsaktionen ausblenden |

## Aktionen

| Aktion | Voraussetzung | Effekt |
|---|---|---|
| Calendar lesen | `DataInterface` | Items mit `data.start` im Current Space anzeigen |
| Ansicht wechseln | UI-Zustand | Monat, Woche, Tag oder Liste anzeigen |
| Zeitraum wechseln | UI-Zustand | sichtbaren Monat, sichtbare Woche oder sichtbaren Tag wechseln |
| Filtern | UI-Zustand, optional Current User | nach Typ, Ort und eigenen Items filtern |
| Event öffnen | Item vorhanden | Detailansicht oder Zielmodul öffnen |
| Event erstellen | `ItemWriter`, ggf. `Authenticatable` | Item mit `data.start` und optional `data.end` erstellen |
| Event bearbeiten | `ItemWriter` | Zeit, Titel, Ort, Tags oder Beschreibung aktualisieren |
| Event löschen | `ItemWriter` | Item löschen, wenn die App diese Aktion erlaubt |
| Teilnahme anzeigen | `RelationCapable` oder `ConfirmationCapable` | Teilnehmer oder bestätigte Teilnahme sichtbar machen |

Mutationen laufen über Hooks oder Capability-Interfaces. Das Calendar Module darf keine backend-spezifischen Schreibpfade kennen.

## Cross-Module-Verhalten

Das Calendar Module darf Items aus anderen Space Modules anzeigen oder dorthin öffnen, ohne deren Semantik zu besitzen.

Beispiele:

- Ein Event kann im Feed erscheinen, wenn es feed-fähige Felder besitzt.
- Ein Event mit `location` oder `address` kann in der Map geöffnet werden.
- Ein Task mit `data.start` kann im Calendar erscheinen und gleichzeitig im Kanban bleiben.
- Eine Quest oder ein QuestRun mit Termin kann im Calendar erscheinen, ohne dass Calendar die Quest-Completion definiert.
- Campaign-Phasen können als zeitliche Projektionen erscheinen, ohne dass Calendar die Game-Regeln besitzt.

Die konkrete Navigation ist App- oder Shell-Verantwortung.

## Komponenten

| Komponente | Rolle | Wiederverwendbar? |
|---|---|---|
| `CalendarView` | Container für Zeitraum, Ansicht, Filter und Projektion | ja |
| `CalendarHeader` / DateNavigation | Wechsel zwischen Zeitraum und Ansicht | ja |
| `CalendarFilters` | Filter nach Typ, Ort und eigenen Items | ja |
| `MonthView` | Monatsraster mit Event-Pills pro Tag | ja |
| `WeekView` | Wochenraster mit Zeitslots | ja |
| `DayView` | Tagesraster mit Zeitslots | ja |
| `ListView` | gruppierte Terminliste im sichtbaren Zeitraum | ja |
| `EventPreview` | kompakte Darstellung eines zeitgebundenen Items | ja |
| `ContentComposer` | Event-Erstellung oder Bearbeitung | ja, aber als Shell-/Composer-Integration |

## Nicht-Ziele

Das Calendar Module definiert nicht:

- eine globale Terminwahrheit,
- Teilnahme-, RSVP- oder Completion-Semantik,
- pädagogische Bewertung,
- RLNP-Quest-Regeln,
- Game-Campaign-Regeln,
- WoT-Attestation-Formate,
- Zeitzonen- oder Kalender-Sync-Protokolle,
- backend-spezifische Tabellen, Queries oder Mutations.

## Implementierungsreferenzen

- `packages/toolkit/src/components/calendar/`
- `packages/toolkit/src/components/calendar/calendar-view.tsx`
- `packages/toolkit/src/components/calendar/calendar-module.stories.tsx`
- `apps/prototype/src/components/views/CalendarView.tsx`
- `apps/prototype/src/components/calendar/`
- UI-Prototyp: `https://real-life-stack.de/edge/` -> oben auf `Kalender` klicken

## Offene Punkte

1. Wo liegt langfristig die Calendar-Konfiguration: App-Konfiguration, `Group.data.modules` oder eigenes Item?
2. Wie werden Teilnehmer, Zusagen und bestätigte Teilnahme backend-agnostisch angezeigt?
3. Wie werden Zeitzonen und ganztägige Events modelliert?
4. Welche Item-Typen sollen in der Reference App standardmäßig calendar-fähig sein?
5. Welche Calendar-Filter gehören ins Modul selbst und welche in die App Shell?
