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
| Module Components | CalendarView, CalendarHeader, CalendarFilters, MonthView, WeekView, DayView, ListView; geteilt: ItemPreview + Adornments (ItemTypeBadge, ItemTimeRange) für die Listen-Card |
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
| `tags` | Top-level am Item, Themen oder Filter — siehe [07-tags.md](../07-tags.md) |
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
6. Es gibt keinen Alias-Mechanismus. Komponenten lesen ausschließlich `data.start` und `data.end`. Bestehende Prototypdaten in `startTime` / `endTime` werden einmalig migriert.

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

Der Zeitraum-Wechsel ist in Monat/Tag/Liste auch per horizontalem **Swipe** möglich; die Wochen-Ansicht scrollt horizontal durch die Tage, dort wechselt der Zeitraum über die Pfeile.

Mutationen laufen über Hooks oder Capability-Interfaces. Das Calendar Module darf keine backend-spezifischen Schreibpfade kennen.

## Mobile Event-Rendering (Monat + Woche)

Diese Regeln gelten für die mobile Darstellung (kein `md`-Breakpoint) von `MonthView` (`MonthCalendar`) und `WeekView` (`WeekCalendar`). Heute rendert die mobile Monatsansicht Events nur als farbige Punkte ohne Text und ohne eigenen Tap-Handler; die Regeln behandeln das als zu behebenden Zustand.

1. In mobiler Monats- **und** Wochenansicht MÜSSEN Events einzeln per Tap anklickbar sein.
2. Ein Tap auf ein Event MUSS dieselbe Detail-Route auslösen wie auf Desktop: `onEventClick(item)`, das in der Reference App das geteilte `ItemDetailPanel` im **Ebene-1-Content-Panel** öffnet (`useModulePanel().open({ kind: "detail" })`, siehe [01-app-composition.md](../01-app-composition.md)). Ein Event-Tap DARF KEINEN eigenen Dialog oder eine zweite gleichartige Fläche öffnen.
3. Ein mobiles Event-Element MUSS mindestens den Titel-Anfang zeigen (Titel-Truncate über eine Zeile). Eine reine Punkt- oder farblose Pill-Darstellung ohne Text erfüllt diese Regel nicht.
4. Bei mehr als der pro Tag darstellbaren Anzahl SOLL ein `+N weitere`-Element den Tag öffnen (mobil bevorzugt die Tagesansicht), analog zum Desktop-Verhalten der Monatsansicht.
5. Das Tap-Target SOLL mindestens etwa 44px in der Höhe der Touch-Trefferfläche erreichen; die sichtbare Event-Pill SOLL mindestens 24px hoch sein. Liegt die sichtbare Höhe darunter, SOLL die Trefferfläche über Padding auf das Mindestmaß vergrößert werden.
6. Die Event-Pill (`EventPill`) bleibt die geteilte Darstellung; Mobil unterscheidet sich nur in Dichte und Truncate, nicht in einem eigenen Komponenten-Pfad. Typ-Farbe und Uhrzeit-Präfix folgen derselben Logik wie Desktop.

## Wochen-Overscroll-Paging (geplant, KANN)

Die Wochenansicht scrollt ihr Tagesraster horizontal (`overflow-x-auto`, `min-w-[760px]`), um abseits liegende Tage zu erreichen. Deshalb ist sie aus dem Swipe-Karussell der Zeitraum-Navigation (Monat/Tag/Liste, eingeführt mit #72) ausgenommen: Ein horizontaler Swipe dort würde mit dem inneren Scroll kollidieren, und `touch-action: pan-y` auf der Karussell-Spur würde diesen Scroll abschalten. Die Woche wechselt den Zeitraum heute nur über die Pfeile (`‹ ›`).

Als KANN-Erweiterung ist Overscroll-to-Paginate für die Woche vorgesehen, damit horizontales Scrollen **und** Wochenwechsel auf derselben Geste koexistieren:

1. Am linken bzw. rechten Ende des horizontalen Scrollbereichs KANN ein fortgesetztes Ziehen über das Scroll-Ende hinaus die Woche um eine Woche zurück bzw. vor blättern (Overscroll-to-Paginate).
2. Solange das Tagesraster noch in Scrollrichtung scrollbar ist, MUSS die Geste der inneren Horizontal-Scroll-Position gehören; ein Wochenwechsel DARF erst auslösen, wenn der Scroll das Ende erreicht hat und zusätzlicher Overscroll-Weg über eine Schwelle hinaus zurückgelegt wurde.
3. Die Schwelle SOLL der Karussell-Konvention folgen (heute `SWIPE_COMMIT_PX`, ~60px Overscroll-Weg über das Scroll-Ende hinaus), damit sich Wochen- und Monatswechsel gleich anfühlen.
4. Gesten-Abgrenzung zum Monats-Karussell: Die Woche bleibt aus dem bestehenden Drei-Panel-Swipe-Karussell ausgenommen; das Paging entsteht ausschließlich aus dem Overscroll des eigenen Scrollcontainers, nicht aus einer parallel laufenden `pan-y`-Spur. Die vertikale Achse (Scroll durch die Stunden-Slots) bleibt frei.
5. Diese Erweiterung ist KEINE sofortige MUSS-Regel. Bis sie umgesetzt ist, bleibt der Wochenwechsel über die Pfeile die normative Pflichtinteraktion.

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
