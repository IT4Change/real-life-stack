# Map Module

**Status:** Normativer Entwurf v0.1

Das Map Module ist die räumliche Projektion von Items im Current Space. Es macht sichtbar, welche Orte, Events, Personen oder andere Items mit geografischem Bezug in einem Ausschnitt relevant sind.

## Zweck

Das Modul beantwortet im Current Space die Frage:

> Was ist wo?

Es unterstützt:

- schnelles Erkunden eines geografischen Ausschnitts,
- Anzeigen aller räumlich verorteten Items,
- Öffnen verorteter Items in Detailansichten oder anderen Space Modules,
- Wiederverwenden derselben Items in Feed, Kanban oder Calendar, wenn passende Felder vorhanden sind.

## Einordnung

| Frage | Antwort |
|---|---|
| Space Module? | Ja |
| App-Shell-Fläche? | Nein |
| Module Components | MapView, MapMarker, MapPopup, MapLegend, ItemPreview; Filter über generische `ItemFilters`-Komponente |
| Primäre Datenbasis | Items |
| Externe Semantik | optional RLNP/Game/WoT-Projektionen, aber nicht durch Map definiert |

Die Karte rendert **full-bleed** — sie füllt den Space randlos, ohne zentrierten Container und (auf Mobile) ohne BottomNav-Abstand. Andere Module nutzen den zentrierten Container-Füllmodus; siehe [01-app-composition.md → Content-Bereich](../01-app-composition.md).

## Datenmodell

Das Map Module liest Items im Current Space, die eine geografische Position tragen. Es ist damit **feldbasiert, nicht typbasiert**.

Typische map-fähige Item-Typen:

```text
place, event, person, project, resource, task, quest, campaign-stop
```

Diese Liste ist offen. Entscheidend ist, ob ein Item räumlich darstellbar ist — siehe [06-schema-composition.md](../06-schema-composition.md).

| Feld | Bedeutung im Map |
|---|---|
| `data.title` / `data.name` | Marker-Label und Popup-Titel |
| `data.position` | GeoJSON-Geometry (mindestens `Point`); macht ein Item map-fähig |
| `data.address` | optionaler menschlicher Adresstext |
| `data.locationName` | optionaler benannter Ort (z.B. „Markthalle 7") |
| `data.description` / `data.content` | Kurzbeschreibung oder Detailtext |
| `tags` | Top-level am Item, Themen oder Filter — siehe [07-tags.md](../07-tags.md) |
| `data.icon` / `data.color` | optionale Marker-Hints (UI-Defaults gelten, wenn fehlt) |
| `createdAt` | Erstellzeitpunkt, nicht Ortszeitpunkt |
| `createdBy` | Ursprung oder Autor |

Projektionen:

| Projektion | Muss? | Quelle | Bedeutung im Modul |
|---|---:|---|---|
| Items | ja | `DataInterface` | räumlich verortete Items anzeigen |
| Relations | nein | `RelationCapable` | verknüpfte Items, Teilnehmer, übergeordnete Orte anzeigen |
| Confirmations | nein | `ConfirmationCapable` | bestätigte Existenz oder Verifikation eines Orts/Items anzeigen |
| Groups/Spaces | nein | `GroupManager` / App Shell | Current Space und ggf. sichtbare Map-Quellen auswählen |

Regeln:

1. Ein Item erscheint auf der Map, wenn es ein parsebares `data.position` (GeoJSON-Geometry) besitzt.
2. `data.position` ist eine GeoJSON-Geometry. Für v0.1 ist mindestens `Point` zu unterstützen; `Polygon` und `LineString` sind erlaubt, aber optional.
3. `createdAt` darf nicht als geografische Aussage interpretiert werden.
4. Ein Map-Marker ist keine Anwesenheits-Bestätigung und keine Standort-Verifikation.
5. Anwesenheit, Verifikation oder offizielle Anerkennung eines Orts werden über Relations oder Confirmations sichtbar, nicht aus dem bloßen Map-Eintrag erfunden.
6. Es gibt keinen Alias-Mechanismus. Komponenten lesen ausschließlich `data.position`, `data.address`, `data.locationName`. Bestehende Prototypdaten in `data.location`, `data.geo`, `data.lat`/`data.lng` werden einmalig migriert.

## Capabilities

| Capability | Verhalten, wenn vorhanden | Verhalten, wenn fehlt |
|---|---|---|
| `DataInterface` | räumlich verortete Items lesen und beobachten | Map kann nicht sinnvoll rendern |
| `ItemWriter` | Orte/Marker erstellen, bearbeiten, löschen | Map read-only anzeigen; Create/Edit/Delete ausblenden oder deaktivieren |
| `RelationCapable` | übergeordnete Orte, Teilnehmer, verknüpfte Items laden | relationale Details ausblenden oder nur eingebettete `item.relations[]` anzeigen |
| `GroupManager` | Space-Kontext, Mitglieder oder Map-Quellen laden | Current Space und Filter müssen von App Shell oder Props kommen |
| `Authenticatable` | Current User für neue Orte oder Anwesenheitsaktionen nutzen | nutzerbezogene Aktionen ausblenden oder auf vorhandene IDs fallbacken |
| `ProfileCapable` | Autor- oder Teilnehmerprofile in Popups anzeigen | IDs oder einfache User-Daten anzeigen |
| `ConfirmationCapable` | bestätigte Existenz, Verifikation oder Trust-Hinweise anzeigen | Confirmation-bezogene Anzeigen ausblenden |
| `ConfirmationWriterCapable` | Ort oder Anwesenheit bestätigen, wenn fachlich erlaubt | Bestätigungsaktionen ausblenden |

## Aktionen

| Aktion | Voraussetzung | Effekt |
|---|---|---|
| Map lesen | `DataInterface` | Items mit `data.position` im Current Space anzeigen |
| Pan / Zoom | UI-Zustand | sichtbaren Ausschnitt wechseln |
| Filtern | UI-Zustand, optional Current User | nach Typ, Tag, Schema, eigenen Items, Bounding-Box filtern |
| Item öffnen | Item vorhanden | Popup oder Detailansicht öffnen, ggf. in Zielmodul wechseln |
| Item erstellen | `ItemWriter`, ggf. `Authenticatable` | Item mit `data.position` (per Click oder Adress-Suche) erstellen |
| Item bearbeiten | `ItemWriter` | Position, Titel, Adresse, Tags oder Beschreibung aktualisieren |
| Item löschen | `ItemWriter` | Item löschen, wenn die App diese Aktion erlaubt |
| Cluster aufklappen | UI-Zustand | dichte Marker-Gruppen interaktiv expandieren |
| Verifikation anzeigen | `RelationCapable` oder `ConfirmationCapable` | Verifikation eines Orts oder einer Präsenz sichtbar machen |

Mutationen laufen über Hooks oder Capability-Interfaces. Das Map Module darf keine backend-spezifischen Schreibpfade kennen.

## Cross-Module-Verhalten

Das Map Module darf Items aus anderen Space Modules anzeigen oder dorthin öffnen, ohne deren Semantik zu besitzen.

Beispiele:

- Ein Event mit `data.position` erscheint auf der Map und gleichzeitig im Calendar.
- Ein Task mit Bearbeitungsort erscheint auf der Map und bleibt im Kanban.
- Eine Person mit Heim-/Aktionsort erscheint auf der Map und im Contacts/Profile-Bereich.
- Eine Quest mit Stopps erscheint auf der Map und behält ihre Quest-Semantik (Game-Layer ist nicht Map-Verantwortung).
- Ein Projekt mit Standorten erscheint auf der Map ohne dass Map Project-Lifecycle definiert.

Die konkrete Navigation ist App- oder Shell-Verantwortung.

## Karten-Library-Adapter

Das Map Module ist **Library-agnostisch**. Konkrete Karten-Engines (Leaflet, MapLibre GL, Google Maps, OpenLayers, …) werden über einen Adapter angebunden. Komponenten und Hooks dürfen keine library-spezifischen Typen oder APIs leaken.

### Adapter-Vertrag

```ts
interface MapAdapter {
  /** Karte in einem Container mounten */
  mount(container: HTMLElement, options: MapMountOptions): Promise<void>

  /** Aufräumen */
  unmount(): Promise<void>

  /** Marker-Set deklarativ setzen; Adapter berechnet Diff intern */
  setMarkers(markers: MapMarkerSpec[]): void

  /** Karten-Ausschnitt setzen */
  setView(view: MapViewState): void

  /** Aktuellen Ausschnitt abfragen oder beobachten */
  getView(): MapViewState
  observeView(callback: (view: MapViewState) => void): Unsubscribe

  /** Click- und Marker-Events */
  observeClicks(callback: (event: MapClickEvent) => void): Unsubscribe
  observeMarkerClicks(callback: (markerId: string) => void): Unsubscribe

  /** Optional: zeichnen, messen, custom Layer — als Capability-Erweiterungen */
}
```

Mit Hilfstypen:

```ts
interface MapMountOptions {
  center: [number, number]   // [lng, lat]
  zoom: number
  tileSource?: string         // optional, Adapter darf Default wählen
}

interface MapMarkerSpec {
  id: string                  // entspricht Item-ID
  position: [number, number]  // [lng, lat]
  label?: string
  icon?: string
  color?: string
}

interface MapViewState {
  center: [number, number]
  zoom: number
  bounds: { north: number; east: number; south: number; west: number }
}

interface MapClickEvent {
  position: [number, number]
  originalEvent?: unknown     // adapter-spezifisch, UI-Code darf nicht typen
}
```

Regeln:

1. Der Adapter ist die einzige Stelle, an der library-spezifischer Code lebt. UI-Komponenten importieren ausschließlich `MapAdapter`-Typen.
2. Koordinaten im Adapter-API sind durchgängig `[lng, lat]` (GeoJSON-Konvention). Wenn die Library intern `[lat, lng]` nutzt (z.B. Leaflet), übersetzt der Adapter.
3. Marker-Updates erfolgen deklarativ via `setMarkers(...)`. Der Adapter berechnet Diff (add/remove/update) selbst, damit React-Code idempotent ist.
4. Tile-Quellen sind Adapter-Detail. Wenn die App eine spezifische Tile-URL braucht, kommt sie via `MapMountOptions.tileSource`.
5. Erweiterte Funktionen (Heatmaps, GeoJSON-Polygone, Routing) sind **nicht Teil des v0.1-Adapter-Vertrags**. Sie werden bei Bedarf als optionale Capability-Erweiterungen ergänzt.

Der obige Block ist illustrativ. Die **normative** Contract-Quelle ist `packages/toolkit/src/components/map/adapter.ts`. Reale Abweichungen vom Skizzen-Block: `setView` nimmt `MapViewPatch` (`{ center?, zoom? }`), `mount` kennt zusätzlich `attribution`, und die Hilfstypen heißen `LngLat`, `MapBounds`, `MapViewState`, `MapViewPatch`, `MapClickEvent`, `Unsubscribe`. Bei Drift gilt der Code, siehe Abschnitt „Austauschbarkeit: Raster-Adapter und Vektor-Adapter".

### Bereitgestellte Adapter

Adapter werden über dedizierte Subpath-Entries des Toolkits bereitgestellt, damit Consumer ohne den jeweiligen Adapter dessen Library nicht bündeln müssen:

- `LeafletMapAdapter` — vorhanden, importiert via `@real-life-stack/toolkit/leaflet`; Raster-Tiles (OSM-Default), geringe Komplexität
- `MapLibreMapAdapter` — implementiert, via `@real-life-stack/toolkit/maplibre`; Vektorkarte (MapLibre GL), performant bei vielen Markern, Custom-Styling

Weitere Adapter (Google, OpenLayers, MapboxGL) sind möglich, sind aber nicht Teil von v0.1.

### Austauschbarkeit: Raster-Adapter und Vektor-Adapter

Der heutige `LeafletMapAdapter` (Raster-Tiles) und ein `MapLibreMapAdapter` (Vektorkarte, MapLibre GL) sind zwei **austauschbare Implementierungen desselben `MapAdapter`-Contracts**. Sie unterscheiden sich nur in der Tile-/Style-Quelle und im internen Rendering, nicht in der vom Map Module konsumierten Schnittstelle.

Der reale Contract lebt in `packages/toolkit/src/components/map/adapter.ts` und ist die normative Quelle. Beide Adapter MÜSSEN ihn vollständig erfüllen.

Regeln:

1. Beide Adapter implementieren `MapAdapter` identisch. `MapView` (bzw. die Reference-`MapView` in `apps/reference/src/views/map-view.tsx`) konsumiert ausschließlich `MapAdapter`-Typen aus dem Toolkit-Barrel `@real-life-stack/toolkit`; konkrete Adapter werden über dedizierte Subpath-Entries geladen (`@real-life-stack/toolkit/leaflet` und `@real-life-stack/toolkit/maplibre`).
2. Die Auswahl Raster vs. Vektor ist eine reine Adapter-Substitution: dieselben Marker (`setMarkers`), dieselben Viewport-Operationen (`setView`/`getView`/`observeView`), dieselben Click-Pfade (`observeClicks`/`observeMarkerClicks`). Modul- und UI-Code dürfen nicht zwischen Raster- und Vektor-Adapter unterscheiden.
3. Koordinaten bleiben durchgängig `[lng, lat]` (GeoJSON, Typ `LngLat`). MapLibre GL nutzt intern bereits `[lng, lat]`; Leaflet nutzt `[lat, lng]` und übersetzt im Adapter. Diese Übersetzung ist Adapter-Detail und nie sichtbar im Contract.

#### Tile-/Style-Quelle als austauschbarer Parameter

1. Die Karten-Quelle ist ein **Parameter**, kein im Adapter fest verdrahteter Provider. Beim Raster-Adapter ist das `MapMountOptions.tileSource` (Tile-URL-Template) plus `MapMountOptions.attribution`. Beim Vektor-Adapter ist `tileSource` die **Style-/PMTiles-Quelle** (Style-URL, Style-JSON-URL oder PMTiles-URL).
2. Fehlt `tileSource`, wählt der Adapter einen sinnvollen Default (Leaflet: OSM-Standard-Tiles). Ein Vektor-Adapter SOLL analog einen Default-Style wählen.
3. Diese Spec nagelt **keinen Provider normativ fest**. Protomaps/PMTiles, MapTiler und OpenFreeMap sind nur Beispiele möglicher Style-/Tile-Quellen für einen Vektor-Adapter; die konkrete Wahl ist App- oder Space-Konfiguration, nicht Teil des Contracts.

#### Viewport-State und Events

1. Der Viewport-State ist `MapViewState` mit `center` (`LngLat`), `zoom` (number) und `bounds` (`MapBounds`: `north`/`east`/`south`/`west`). `bounds` ist ein **abgeleiteter Wert** aus dem Viewport und kein Eingabe-Parameter.
2. Programmatische Viewport-Änderung erfolgt über `setView(view: MapViewPatch)` mit optionalem `center` und/oder `zoom`. `bounds` ist bewusst nicht Teil des Patch.
3. Viewport-Änderungen durch Pan/Zoom werden über `observeView(callback)` gemeldet. Der reale Leaflet-Adapter feuert auf `moveend`/`zoomend`; ein Vektor-Adapter MUSS dasselbe `onMoveEnd`-Verhalten liefern (Event nach Abschluss der Bewegung, nicht pro Frame). `getView()` liefert den aktuellen `MapViewState` synchron.

#### Marker-Render-Hook und Click→Item

1. Marker werden deklarativ über `setMarkers(markers: MapMarkerSpec[])` gesetzt. Der Adapter berechnet den Diff (add/remove/update) gegen sein aktuelles Set selbst, sodass der Aufrufer pro Render die vollständige Marker-Liste übergeben kann (idempotent).
2. Ein `MapMarkerSpec` trägt `id` (entspricht `Item.id`), `position` (`LngLat`), optional `label`, `icon`, `color`. Das **Rendering** dieser Primitive ist Adapter- bzw. Marker-Library-Sache (siehe Abschnitt „Item→Marker-Mapping"), nicht Modul-Sache.
3. Marker-Click wird über `observeMarkerClicks(callback)` gemeldet und liefert nur die `markerId`. Das Map Module schlägt darüber das `Item` nach (heute `itemsById`-Lookup in `MapView`) und öffnet die Detailansicht. Click→Item ist damit ein zweistufiger Pfad: Adapter meldet `id`, Modul mappt `id`→`Item`.
4. Freie Klicks auf die Karte (z.B. zum Setzen einer neuen Position) werden über `observeClicks(callback)` mit `MapClickEvent` gemeldet; `originalEvent` ist adapter-spezifisch und UI-Code DARF nicht auf dessen Form bauen.

#### Clustering (optional)

1. Clustering ist **nicht Teil des v0.1-Contracts** und wird bei Bedarf als optionale Capability-Erweiterung ergänzt, nicht als Pflicht-Methode jedes Adapters.
2. Ein Vektor-Adapter KANN Clustering nativ (z.B. GL-Layer-Cluster) anbieten, ein Raster-Adapter KANN es über eine Marker-Cluster-Erweiterung anbieten. In beiden Fällen bleibt die Marker-Eingabe `MapMarkerSpec[]`; Cluster-Aggregation ist Adapter-intern und leakt nicht in den Contract.

## Item→Marker-Mapping

Das Map Module besitzt **nicht** das Marker-Rendering. Es besitzt nur das **Mapping von Item nach `MapMarkerSpec`**. Die visuellen Marker-Primitive (Pin-Formen, Icons) liefert eine **engine-agnostische Marker-Schicht**.

### Marker-Primitive (engine-agnostisch)

1. Die Marker-Primitive — Pin-Shapes (`circle`/`square`), die geteilte Icon-Registry und `renderMarkerSvg` / `markerDataUrl` — leben framework-unabhängig im Toolkit (`packages/toolkit/src/components/map/markers/`, `packages/toolkit/src/lib/icons/`), abgeleitet aus den Utopia-Map-Markern. Eine spätere Extraktion in ein eigenes `real-life-org`-Repo ist geplant, sobald stabil (vgl. A2).
2. RLS hält das Mapping `Item → MapMarkerSpec`. Die Marker-Schicht ist die Quelle der Primitive; deren Implementierungsdetails gehören **nicht** in diese Spec.
3. Adapter (Leaflet, MapLibre) rendern den Marker als SVG-`data:`-URL (`markerDataUrl`) und mounten ihn (Leaflet `icon({ iconUrl })`, MapLibre `<img>`). Das Map Module sieht weder Renderer- noch Adapter-Details.

### Mapping-Vertrag

Das Map Module leitet aus jedem map-fähigen Item ein `MapMarkerSpec` ab. Welche Item-Felder welche Marker-Eigenschaft steuern:

| Marker-Eigenschaft | Quelle am Item | Regel |
|---|---|---|
| `position` | `data.position` (GeoJSON-Geometry) | Pflicht. Für v0.1 wird `Point` zu `[lng, lat]` gelesen (`data.position.coordinates`). Ohne parsebaren Point entsteht kein Marker. |
| `id` | `Item.id` | Stabile Marker-Identität; Grundlage des Click→Item-Lookups. |
| `label` | `data.title` (Fallback `Item.id`) | Marker-Label / Tooltip. |
| `color` | `getTagAccentColor(tags[0])` | Farbe aus dem ersten Tag (deterministische Palette). Fehlt ein Tag, KÖNNEN Marker die Space-`primaryColor` als Default verwenden (Tag-Akzent hat Vorrang; siehe `04-items-relations-groups-spaces.md` → Space-Primärfarbe); andernfalls nutzt der Adapter seinen Default-Pin. |
| `icon` | `data.icon` (optional), sonst erster Tag-Name | Glyph-Hint; aufgelöst über die geteilte Icon-Registry (kuratierter Name \| inline-SVG \| Emoji), Fallback Dot. **Aktiv** emittiert (`MapView`) und konsumiert (beide Adapter rendern den Pin via `renderMarkerSvg`). |
| `shape` / `selected` | optional | Pin-Form (`circle`/`square`, Default `circle`) und Auswahl-Zustand; vom Marker-Renderer gezeichnet. Clustering bleibt v0.1-extern (Adapter-intern, aus Marker-Dichte). |

Regeln:

1. Das Mapping ist **getrennt vom Marker-Rendering**. RLS produziert `MapMarkerSpec`; der engine-agnostische Marker-Renderer (`renderMarkerSvg`) erzeugt daraus den sichtbaren Pin (Form, Glyph, Schatten). Cluster-Darstellung bleibt Adapter-Sache.
2. Farbe kommt heute aus `getTagAccentColor(tags[0])` (CSS-Color-Accent der geteilten Tag-Palette, vgl. `packages/toolkit/src/lib/utils.ts`). `getTagColor` (Tailwind-Chip-Klassen) ist hier **nicht** zu verwenden, da Marker keine Tailwind-Flächen sind.
3. Die Position kommt ausschließlich aus `data.position`. Es gibt keinen Alias-Mechanismus (siehe Datenmodell-Regel 6).
4. Das Mapping DARF keine library- oder adapter-spezifischen Typen produzieren; sein einziger Output-Typ ist `MapMarkerSpec` aus dem Adapter-Contract.

## Layout

Das Map Module füllt den verfügbaren Space-Bereich vollständig aus. Es hat **keinen eigenen Header**: Pan, Zoom und Ausschnittwechsel passieren direkt in der Karte. Sekundäre UI (Suche, Filter, Item-Details, Composer) wird als **Overlay** über der Karte gerendert (Floating-Sheet, Drawer, Popup), nicht als separater Header- oder Sidebar-Bereich.

## Filter

Map nutzt die generische `ItemFilters`-Komponente, die modulübergreifend die gleiche Filter-UX liefert (gleiche Pills, gleicher Composer-Dialog). Filter sind in zwei Klassen:

- **Generische Filter** (aus `ItemFilters`): `type`, `tag`, `schema`, `createdBy`, freie Suche.
- **Map-spezifische Filter** (vom Map Module ergänzt): `bounds` (nur Items im sichtbaren Ausschnitt), `withinRadius`, `hasPosition`, `geometryType`.

Die Kombination wird in den `ItemFilter` der `DataInterface`-Observable abgebildet (siehe [02-data-interface.md](../02-data-interface.md), [06-schema-composition.md](../06-schema-composition.md) und [07-tags.md](../07-tags.md)). Map-spezifische Filter, die `ItemFilter` nicht direkt kennt (z.B. `bounds`), werden vom Map Module nach dem `observe()` clientseitig angewendet.

## Komponenten

| Komponente | Rolle | Wiederverwendbar? |
|---|---|---|
| `MapView` | Container für Adapter, Ausschnitt und Projektion (Vollbild im Space-Bereich) | ja |
| `MapMarker` | Marker-Konfiguration (Icon, Color, Label) pro Item | ja |
| `MapPopup` | kompakte Darstellung eines Items im Karten-Overlay | ja |
| `MapLegend` | optionale Erklärung der Marker-Klassen oder Layer | ja |
| `ItemPreview` | gleiche Vorschau wie in Feed/Calendar; im Map-Popup wiederverwendet | ja |
| `ItemFilters` | generische, modulübergreifende Filter-Komponente mit Map-spezifischer Konfiguration | ja, cross-modul |
| `ContentComposer` | Erstellung oder Bearbeitung eines verorteten Items | ja, aber als Shell-/Composer-Integration |

## Nicht-Ziele

Das Map Module definiert nicht:

- eine globale Ortswahrheit oder Geocoding-Authoritäten,
- Anwesenheits-, Check-in- oder Verifikations-Semantik,
- Routing oder Navigation zwischen Orten,
- Offline-Map-Strategien,
- Indoor-/3D-Map-Konzepte,
- RLNP-Quest-Regeln oder Game-Stopps,
- WoT-Ort-Attestation-Formate,
- backend-spezifische Tabellen, Queries oder Mutations,
- konkrete Karten-Library — siehe Adapter-Vertrag,
- Marker-Rendering-Primitive (Pin-Formen, Cluster-Glyphen) — Sache der externen, framework-unabhängigen Marker-Library (eigenes Repo unter `real-life-org`); siehe Abschnitt „Item→Marker-Mapping".

## Implementierungsreferenzen

- `packages/toolkit/src/components/map/` (aktuell Stub)
- `apps/prototype/` — geplante Map-View neben Calendar-View

## Offene Punkte

1. Wo lebt die Library-Adapter-Auswahl: pro App, pro Space, pro Modul-Konfiguration?
2. Wie wird der Default-Ausschnitt eines Space festgelegt (per Space-Config, oder berechnet aus Items)?
3. Wie wird Clustering konfiguriert (im Adapter, im Modul, oder als optionale Capability)?
4. Wie werden Items mit `Polygon`-/`LineString`-Position dargestellt — als überlagerter Layer oder als reiche Marker?
5. Welche Tile-Quellen sind Default in der Reference App (OSM-Standard, eigene Tile-Server, themed Tiles)?
6. Soll der Adapter eine Möglichkeit haben, Karten-spezifische Custom-Controls zu hosten (Layer-Switcher, Zeichenwerkzeuge), oder bleibt die Map-UI im React-Layer?
7. Die generische `ItemFilters`-Komponente gehört konzeptionell in eine Cross-Modul-Spec (App Composition oder eigenes Dokument). Der Vertrag, wie Module ihre modulspezifischen Filter registrieren, ist noch offen.
8. **Marker-Click-Flow: Popup vs. Detail-Panel.** Aktuell öffnet ein Marker-Click direkt das `ItemDetailPanel` im `AdaptivePanel` — konsistent mit Feed, Kanban und Calendar.

   Diskussion mit Sebastian offen, drei mögliche Varianten:

   - **A — Direkt-Detail (heutiger Stand):** Marker-Klick öffnet `ItemDetailPanel` als Sidebar. Pro: identisch zu allen anderen Modulen, volles Comment-Threading + Reaktionen sofort verfügbar. Contra: Map verschwindet visuell teilweise hinter dem Panel, User verliert räumlichen Kontext.
   - **B — Popup-Zwischenstation:** Marker-Klick öffnet ein Leaflet/MapLibre-Popup mit der `ItemPreview` inline; ein „Details öffnen"-Action im Popup wechselt dann zum `ItemDetailPanel`. Pro: Map bleibt voll sichtbar, schnelles Peek. Contra: zwei Klicks bis zum Detail, weicht vom Modul-übergreifenden Pattern ab, Popup-Styling muss separat gepflegt werden.
   - **C — Hybrid:** Klick öffnet Popup mit `ItemPreview`; ein Hover oder Long-Press öffnet direkt das Detail-Panel. Pro: beides bedienbar. Contra: zwei verschiedene Interaktionen für sehr ähnliches Verhalten, Discoverability auf Touch unklar.

   Open Question für Sebastian: Welche Variante passt zu seinem UX-Modell für ortsbasierte Discovery? Insbesondere ob Map-Kontext-Erhalt wichtiger ist als Modul-Konsistenz.
