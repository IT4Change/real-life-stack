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

Der Zeitraum-Wechsel ist in allen Ansichten (Monat/Woche/Tag/Liste) auch per horizontalem **Swipe** möglich. Die Wochen-Ansicht zeigt alle sieben Tage gleichzeitig ohne horizontalen Scroll und wechselt darum über dasselbe Swipe-Karussell wie die übrigen Ansichten.

Mutationen laufen über Hooks oder Capability-Interfaces. Das Calendar Module darf keine backend-spezifischen Schreibpfade kennen.

## Mobile Event-Rendering (Monat + Woche)

Diese Regeln gelten für die mobile Darstellung (kein `md`-Breakpoint) von `MonthView` (`MonthCalendar`) und `WeekView` (`WeekCalendar`). Heute rendert die mobile Monatsansicht Events nur als farbige Punkte ohne Text und ohne eigenen Tap-Handler; zudem gibt es mobil keinen Overflow-Indikator (es werden bis zu vier Punkte via `slice(0, 4)` gezeigt, weitere Events fallen still weg). Die Regeln behandeln das als zu behebenden Zustand.

1. In mobiler Monats- **und** Wochenansicht MÜSSEN Events einzeln per Tap anklickbar sein.
2. Ein Tap auf ein Event MUSS dieselbe Detail-Route auslösen wie auf Desktop: `onEventClick(item)`, das in der Reference App das geteilte `ItemDetailPanel` im **Ebene-1-Content-Panel** öffnet (`useModulePanel().open({ kind: "detail" })`, siehe [01-app-composition.md](../01-app-composition.md)). Ein Event-Tap DARF KEINEN eigenen Dialog oder eine zweite gleichartige Fläche öffnen.
3. Ein mobiles Event-Element MUSS mindestens den Titel-Anfang zeigen (Titel-Truncate über eine Zeile). Eine reine Punkt- oder farblose Pill-Darstellung ohne Text erfüllt diese Regel nicht.
4. Bei mehr als der pro Tag darstellbaren Anzahl SOLL ein `+N weitere`-Element den Tag öffnen (mobil bevorzugt die Tagesansicht), analog zum Desktop-Verhalten der Monatsansicht.
5. Das Tap-Target SOLL mindestens etwa 44px in der Höhe der Touch-Trefferfläche erreichen; die sichtbare Event-Pill SOLL mindestens 24px hoch sein. Liegt die sichtbare Höhe darunter, SOLL die Trefferfläche über Padding auf das Mindestmaß vergrößert werden.
6. Die Event-Pill (`EventPill`) bleibt die geteilte Darstellung; Mobil unterscheidet sich nur in Dichte und Truncate, nicht in einem eigenen Komponenten-Pfad. Die Pill-Farbe folgt der einheitlichen Item-Farblogik (siehe unten). In der Wochenansicht steht die Uhrzeit bereits in der Zeit-Spalte, darum zeigt die Pill dort nur den Titel — identisch zu den Monats-Pills; ein Uhrzeit-Präfix entfällt.

## Wochenansicht ohne horizontalen Scroll

Die Wochenansicht zeigt alle sieben Tagesspalten gleichzeitig auf dem Bildschirm, ohne horizontalen Scroll. Eine schmale Zeit-Spalte plus sieben gleich breite, schrumpfende Tagesspalten (`minmax(0,1fr)`) teilen sich die verfügbare Breite — analog zur Monatsansicht.

1. Die Wochenansicht DARF KEIN eigenes horizontales Scroll-Raster (`overflow-x-auto` + feste Mindestbreite) verwenden; die sieben Tage MÜSSEN sich die Viewport-Breite teilen.
2. Weil kein innerer Horizontal-Scroll mehr mit der Geste konkurriert, nimmt die Woche am selben **Swipe-Karussell** der Zeitraum-Navigation teil wie Monat/Tag/Liste (Drei-Panel-Swipe, eingeführt mit #72, Schwelle `SWIPE_COMMIT_PX`). Ein horizontaler Swipe blättert die Woche um eine Woche vor/zurück.
3. Die vertikale Achse (Scroll durch die Stunden-Slots) bleibt frei; die Gesten-Abgrenzung folgt der Karussell-Konvention (`touch-action: pan-y`, Achsen-Erkennung über die horizontale Dominanz).
4. Die Pfeil-Navigation (`‹ ›`) bleibt als gleichwertige Alternative erhalten.

## Ganztägige und mehrtägige Events in der Wochenansicht

Ganztägige Events (Quelle ohne Uhrzeit, bare `YYYY-MM-DD`) und mehrtägige Events liegen im Zeitraster unterhalb des ersten Stunden-Slots und wären dort unsichtbar. Sie werden darum als spannende Leisten über dem Zeitraster gezeigt (Thunderbird-Stil).

1. Über dem Stunden-Raster der Woche MUSS eine eigene Ganztags-Zeile stehen, sobald mindestens ein ganztägiges oder mehrtägiges Event die sichtbare Woche überlappt.
2. Ein Event-Balken MUSS über die Tagesspalten spannen, die es innerhalb der Woche abdeckt (Start- bis End-Spalte, an den Wochenrändern abgeschnitten).
3. Die Balken nutzen dieselbe `EventPill`-Darstellung und dieselbe Item-Farblogik wie die übrigen Events.

## Item-Farblogik (modulübergreifend)

Kalender-Pills und Map-Marker leiten ihre Farbe nach derselben Präzedenz ab (`getItemColor`):

1. **Custom** — eine explizite Item-Farbe (`data.color`, Hex) hat Vorrang.
2. **Erster Tag** — sonst die Akzentfarbe des ersten Tags des Items.
3. **Ursprungsgruppe** — sonst die Primärfarbe der Gruppe, in der das Item erstellt wurde, NICHT der aktuell aktiven Gruppe. In aggregierten Ansichten (z. B. „Mein Netzwerk") MUSS die Farbe so die Herkunftsgruppe des Items signalisieren.

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
