# Map Module

**Status:** Normativer Entwurf v0.2

Das Map Module ist die räumliche Projektion von Items im Current Space. Es macht sichtbar, welche Orte, Events, Personen oder andere Items mit geografischem Bezug in einem Ausschnitt relevant sind.

> **v0.2-Änderung:** Der Karten-Adapter ist jetzt **capability-basiert** (analog zu den `DataInterface`-Connectoren): ein Basis-Contract, den jede Engine erfüllt, plus optionale Capabilities (`ClusterCapable`, `GlobeCapable`), die nicht jede Engine anbietet. Damit bleiben unterschiedliche Mapping-Frameworks kompatibel — inklusive **nativer Maps auf iOS/Android** — während fortgeschrittene Funktionen (WebGL-Cluster, Globe) dort genutzt werden, wo die Engine sie bietet, und das Modul sonst degradiert.

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

## Toolkit MapView und MapLens

`MapView` aus `@real-life-stack/toolkit` ist das vollständige, props-getriebene
Space-Modul. Es besitzt die lokale FilterBar, bbox-Inventar-Akkumulation,
Location-Pick-UI, Mount-Recovery und das Create-Gate. Die App bleibt Eigentümerin
der bbox-Abfrage, URL-/Panel-Selektion und Composer-Callback.

`viewportMode: "bbox-module"` startet ausschließlich mit dem von der App
gelieferten `initialView`; es führt keinen Auto-Fit aus und meldet Bounds für
die begrenzte Abfrage. `viewportMode: "lens-auto-fit"` ist der P3-Linsenvertrag:
erstes nicht-leeres Marker-Inventar fitten, Selektion zuerst, und bei
`inventoryKey` neu arming. Jeder Modus hat genau einen Viewport-Owner.

`MapLens` bleibt dagegen der filterlose presentationale Kern: supplied Point-
Items, Marker, Selection-Gate, Inset und Adapter-Mount. Es bietet weder Filter
noch Create/Pick oder bbox-Laden. Beide Flächen schließen `type: "relation"`
aus. Clustering wird ausschließlich als Adapter-Capability via
`setClusterConfig` gesetzt; Cluster-Klick/Zoom ist Adapter-Verhalten.

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
| Cluster aufklappen | `ClusterCapable` | dichte Marker-Gruppen interaktiv expandieren (Klick zoomt rein bis zum Aufbruch) |
| Projection umschalten | `GlobeCapable` | Karte zwischen Mercator und Globe wechseln |
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

Das Map Module ist **engine-agnostisch und capability-basiert** — nach demselben Muster wie die `DataInterface`-Connectoren (siehe [02-data-interface.md](../02-data-interface.md)). Konkrete Karten-Engines (MapLibre GL, Leaflet, Google/Apple-Maps nativ via Capacitor, OpenLayers, …) werden über einen Adapter angebunden. Komponenten und Hooks dürfen keine library-spezifischen Typen oder APIs leaken.

Es gibt zwei Ebenen:

1. **Basis-Contract `MapAdapter`** — den **jeder** Adapter vollständig erfüllt (Mount, Marker, Viewport, Clicks). Modul- und UI-Code laufen ausschließlich gegen diesen Contract.
2. **Optionale Capabilities** — die ein Adapter anbieten KANN, aber nicht MUSS (`ClusterCapable`, `GlobeCapable`, …). Das Modul erkennt sie per Feature-Detection (`hasCluster(adapter)`, `hasGlobe(adapter)` — analog zu `hasItemGroups(connector)`) und **degradiert**, wenn sie fehlen: kein Globe-Toggle ohne `GlobeCapable`, viewport-begrenzte Einzel-Marker statt Cluster ohne `ClusterCapable`.

Das **Marker-Rendering** ist Adapter-intern: derselbe `MapMarkerSpec` wird je nach Engine als DOM-Element (Leaflet), WebGL-Symbol-Layer (MapLibre, skaliert auf zehntausende Marker) oder native Annotation (iOS/Android) gezeichnet. Wie ein Adapter intern rendert, ist nie Teil des Contracts.

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

  /** Karten-Ausschnitt auf eine Bounding-Box einpassen */
  fitBounds(bounds: MapBounds): void

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
  tileSourceDark?: string     // optional, Quelle im Dark Mode
  colorScheme?: "light" | "dark" | "auto"  // Default "auto"
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

### Capabilities (optional)

Capabilities sind separate Interfaces, die ein Adapter zusätzlich zu `MapAdapter` implementieren KANN. Das Modul prüft sie per Type-Guard und degradiert, wenn sie fehlen.

```ts
interface ClusterCapable {
  /** Marker-Dichte zusammenfassen; null/undefined deaktiviert Clustering. */
  setClusterConfig(config: { radius?: number } | null): void
  /** Klick auf einen Cluster (statt einzelnen Marker). */
  observeClusterClicks(callback: (cluster: { id: string; count: number; position: LngLat }) => void): Unsubscribe
}

interface GlobeCapable {
  setProjection(projection: "mercator" | "globe"): void
}

function hasCluster(a: MapAdapter): a is MapAdapter & ClusterCapable
function hasGlobe(a: MapAdapter): a is MapAdapter & GlobeCapable
```

Regeln:

1. Der Basis-Contract `MapAdapter` ist Pflicht; jede Capability ist optional. Modul-/UI-Code MUSS Capabilities per Feature-Detection prüfen und bei Abwesenheit degradieren — niemals annehmen, dass ein Adapter sie hat.
2. **Clustering-Degradation:** ohne `ClusterCapable` zeigt das Modul die viewport-begrenzte Einzel-Marker-Menge (siehe Datenquelle), nicht alle Marker global. Mit `ClusterCapable` werden Cluster nativ/Plugin-seitig aus der gesetzten Marker-Menge gebildet.
3. **Globe-Degradation:** ohne `GlobeCapable` entfällt der Projection-Toggle; die Karte bleibt 2D (Mercator).
4. Capabilities leaken keine library-spezifischen Typen; ihre Signaturen nutzen nur Contract-Typen (`LngLat`, `Unsubscribe`, …).

### Bereitgestellte Adapter

Adapter werden über dedizierte Subpath-Entries des Toolkits bereitgestellt, damit Consumer ohne den jeweiligen Adapter dessen Library nicht bündeln müssen. Welche Capabilities ein Adapter erfüllt:

| Adapter | Import | Basis | `ClusterCapable` | `GlobeCapable` | Rendering (intern) |
|---|---|---|---|---|---|
| `MapLibreMapAdapter` | `@real-life-stack/toolkit/maplibre` | ✅ | ✅ nativ (GL) | ✅ | GeoJSON-Source + WebGL-Layer; skaliert auf zehntausende Marker |
| `LeafletMapAdapter` | `@real-life-stack/toolkit/leaflet` | ✅ | optional (Plugin) | ❌ | DOM-Marker; 2D-Raster, geringe Komplexität |
| `CapacitorNativeMapAdapter` *(geplant)* | nativ (iOS/Android) | ✅ | (SDK-abhängig) | (SDK-abhängig) | native Annotations (MapKit/Google Maps) |

`MapLibreMapAdapter` ist der **Vollausbau** (Cluster + Globe + WebGL) und die Referenz für skalierende Karten. Weitere Adapter (Google/OpenLayers Web, MapboxGL) sind möglich, aber nicht Teil von v0.2.

### Austauschbarkeit und Capability-Degradation

Adapter sind **austauschbare Implementierungen desselben Basis-`MapAdapter`-Contracts**. Sie unterscheiden sich in Tile-/Style-Quelle, internem Rendering und den angebotenen Capabilities — nicht im Basis-Contract.

Der reale Contract lebt in `packages/toolkit/src/components/map/adapter.ts` und ist die normative Quelle. Jeder Adapter MUSS den Basis-Contract vollständig erfüllen; Capabilities sind optional.

Regeln:

1. Jeder Adapter implementiert `MapAdapter` identisch. `MapView` (`apps/reference/src/views/map-view.tsx`) konsumiert ausschließlich `MapAdapter`-Typen aus dem Toolkit-Barrel `@real-life-stack/toolkit`; konkrete Adapter werden über dedizierte Subpath-Entries geladen.
2. Der **Basis-Pfad** ist reine Adapter-Substitution: dieselben Marker (`setMarkers`), dieselben Viewport-Operationen (`setView`/`fitBounds`/`getView`/`observeView`), dieselben Click-Pfade. Modul-/UI-Code dürfen für den Basis-Pfad nicht zwischen Adaptern unterscheiden. **Erweiterte** Funktionen (Cluster, Globe) laufen ausschließlich über Capability-Detection — nie über Engine-Erkennung („ist das MapLibre?").
3. Koordinaten bleiben durchgängig `[lng, lat]` (GeoJSON, Typ `LngLat`). Eine Engine mit `[lat, lng]` (z.B. Leaflet) übersetzt im Adapter; nie sichtbar im Contract.

#### Tile-/Style-Quelle als austauschbarer Parameter

1. Die Karten-Quelle ist ein **Parameter**, kein im Adapter fest verdrahteter Provider. Beim Raster-Adapter ist das `MapMountOptions.tileSource` (Tile-URL-Template) plus `MapMountOptions.attribution`. Beim Vektor-Adapter ist `tileSource` die **Style-/PMTiles-Quelle** (Style-URL, Style-JSON-URL oder PMTiles-URL).
2. Fehlt `tileSource`, wählt der Adapter einen sinnvollen Default (Leaflet: OSM-Standard-Tiles). Ein Vektor-Adapter SOLL analog einen Default-Style wählen.
3. Diese Spec nagelt **keinen Provider normativ fest**. Protomaps/PMTiles, MapTiler und OpenFreeMap sind nur Beispiele möglicher Style-/Tile-Quellen für einen Vektor-Adapter; die konkrete Wahl ist App- oder Space-Konfiguration, nicht Teil des Contracts.

#### Hell/Dunkel-Variante

Die Karte ist die einzige Fläche, deren Erscheinungsbild nicht in CSS steckt: ihr Style ist zur Laufzeit geladenes JSON. Sie MUSS den Dark Mode der App trotzdem mitmachen.

1. `MapMountOptions.colorScheme` wählt die Variante. Default ist `"auto"`: der Adapter folgt dem Dark-Signal der App. Explizit `"light"` / `"dark"` nagelt die Variante fest.
2. Das Dark-Signal der App ist die `dark`-Klasse auf `document.documentElement` (Tailwind-Konvention, `@custom-variant dark`). Sie ist die **einzige** Quelle — `prefers-color-scheme` wird bewusst nicht als Fallback herangezogen, weil die App-Shell die Klasse nicht daraus ableitet und die Karte sonst dunkel unter heller UI stünde. Gemeinsame Auflösung: `packages/toolkit/src/lib/color-scheme.ts`.
3. Bei `"auto"` MUSS der Adapter den Wechsel zur Laufzeit nachziehen, ohne Remount und ohne Verlust des Viewports.
4. Wechselt der Adapter den Style, MUSS er die eigenen Quellen, Layer und Marker danach wieder aufsetzen. Ein Style-Wechsel verwirft alles, was über dem alten Style lag.
5. `tileSourceDark` benennt die dunkle Quelle. Fehlt sie, gilt: ein vom Aufrufer gesetztes `tileSource` bleibt für **beide** Varianten in Kraft — ein Adapter DARF einen gepinnten Style nicht durch einen eigenen ersetzen. Nur wenn auch `tileSource` fehlt, greift der Dark-Default des Adapters (MapLibre: OpenFreeMap `dark` neben `liberty`).

#### Viewport-State und Events

1. Der Viewport-State ist `MapViewState` mit `center` (`LngLat`), `zoom` (number) und `bounds` (`MapBounds`: `north`/`east`/`south`/`west`). `bounds` ist ein **abgeleiteter Wert** aus dem Viewport und kein Eingabe-Parameter.
2. Programmatische Einzelpunkt-Viewport-Änderung erfolgt über `setView(view: MapViewPatch)` mit optionalem `center` und/oder `zoom`. `bounds` ist bewusst nicht Teil des Patch.
3. Programmatisches Einpassen mehrerer Marker erfolgt über `fitBounds(bounds: MapBounds)`. Auch hier bleiben Koordinaten `[lng, lat]`; Leaflet übersetzt erst intern in seine native Reihenfolge.
4. Viewport-Änderungen durch Pan/Zoom werden über `observeView(callback)` gemeldet. Der reale Leaflet-Adapter feuert auf `moveend`/`zoomend`; ein Vektor-Adapter MUSS dasselbe `onMoveEnd`-Verhalten liefern (Event nach Abschluss der Bewegung, nicht pro Frame). `getView()` liefert den aktuellen `MapViewState` synchron.

#### Marker-Render-Hook und Click→Item

1. Marker werden deklarativ über `setMarkers(markers: MapMarkerSpec[])` gesetzt. Der Adapter berechnet den Diff (add/remove/update) gegen sein aktuelles Set selbst, sodass der Aufrufer pro Render die vollständige Marker-Liste übergeben kann (idempotent).
2. Ein `MapMarkerSpec` trägt `id` (entspricht `Item.id`), `position` (`LngLat`), optional `label`, `icon`, `color`. Das **Rendering** dieser Primitive ist Adapter- bzw. Marker-Library-Sache (siehe Abschnitt „Item→Marker-Mapping"), nicht Modul-Sache.
3. Marker-Click wird über `observeMarkerClicks(callback)` gemeldet und liefert nur die `markerId`. Das Map Module schlägt darüber das `Item` nach (heute `itemsById`-Lookup in `MapView`) und öffnet die Detailansicht. Click→Item ist damit ein zweistufiger Pfad: Adapter meldet `id`, Modul mappt `id`→`Item`.
4. Freie Klicks auf die Karte (z.B. zum Setzen einer neuen Position) werden über `observeClicks(callback)` mit `MapClickEvent` gemeldet; `originalEvent` ist adapter-spezifisch und UI-Code DARF nicht auf dessen Form bauen.

#### Clustering (`ClusterCapable`)

1. Clustering ist eine **optionale Capability** (`ClusterCapable`), kein Teil des Basis-Contracts. Adapter, die sie anbieten, clustern die per `setMarkers` gesetzte Marker-Menge **adapter-intern** (MapLibre: native GL-Cluster; ein Raster-Adapter ggf. via Cluster-Plugin). Die Marker-Eingabe bleibt `MapMarkerSpec[]`; die Aggregation leakt nicht in den Contract.
2. **Darstellung:** Ein Cluster wird als Bubble mit der **Anzahl** gezeigt, eingefärbt in der **dominanten Gruppenfarbe** der enthaltenen Items (analog zur Item-Farblogik; fehlt eine eindeutige, neutrale Default-Farbe). Einzelne (nicht geclusterte) Marker behalten ihren Pin.
3. **Interaktion:** Klick auf einen Cluster (`observeClusterClicks`) zoomt so weit hinein, dass der Cluster aufbricht. Klick auf einen Einzel-Marker bleibt der Item-Click-Pfad.
4. **Degradation:** Ohne `ClusterCapable` rendert das Modul die viewport-begrenzte Einzel-Marker-Menge ohne Aggregation (siehe Datenquelle).
5. **Skalierung:** Natives Clustering (MapLibre) trägt zehntausende Punkte client-seitig. Sehr große Mengen (> ~100k) gehören **serverseitig** geclustert — siehe Datenquelle.

## Item→Marker-Mapping

Das Map Module besitzt **nicht** das Marker-Rendering. Es besitzt nur das **Mapping von Item nach `MapMarkerSpec`**. Die visuellen Marker-Primitive (Pin-Formen, Icons) liefert eine **engine-agnostische Marker-Schicht**.

### Marker-Primitive (engine-agnostisch)

1. Die Marker-Primitive — Pin-Shapes (`circle`/`square`), die geteilte Icon-Registry und `renderMarkerSvg` / `markerDataUrl` — leben framework-unabhängig im Toolkit (`packages/toolkit/src/components/map/markers/`, `packages/toolkit/src/lib/icons/`), abgeleitet aus den Utopia-Map-Markern. Eine spätere Extraktion in ein eigenes `real-life-org`-Repo ist geplant, sobald stabil (vgl. A2).
2. RLS hält das Mapping `Item → MapMarkerSpec`. Die Marker-Schicht ist die Quelle der Primitive; deren Implementierungsdetails gehören **nicht** in diese Spec.
3. Adapter rendern denselben `MapMarkerSpec` je nach Engine unterschiedlich: als DOM-Element mit SVG-`data:`-URL (Leaflet `icon({ iconUrl })`), als WebGL-Symbol-Layer mit einem Image-Atlas aus denselben Pin-Bildern (`map.addImage`, MapLibre) oder als native Annotation mit dem Pin-Bild (iOS/Android). Die geteilte Pin-Bild-Erzeugung (`renderMarkerSvg` / `markerDataUrl`) ist allen gemeinsam; *wie* gemountet wird, ist Adapter-intern und nie Teil des Contracts. Auswahl/Glow ist im DOM-Pfad ein CSS-`filter`, im WebGL-Pfad ein Layer-Halo — beides Adapter-Detail.

### Mapping-Vertrag

Das Map Module leitet aus jedem map-fähigen Item ein `MapMarkerSpec` ab. Welche Item-Felder welche Marker-Eigenschaft steuern:

| Marker-Eigenschaft | Quelle am Item | Regel |
|---|---|---|
| `position` | `data.position` (GeoJSON-Geometry) | Pflicht. Für v0.1 wird ein `Point` zu `[lng, lat]` gelesen (`data.position.coordinates`). Ohne endlichen, in `place/v1` gültigen Longitude-/Latitude-Point entsteht kein Marker. |
| `id` | `Item.id` | Stabile Marker-Identität; Grundlage des Click→Item-Lookups. |
| `label` | `data.title` (Fallback `Item.id`) | Marker-Label / Tooltip. |
| `color` | `getTagAccentColor(tags[0])` | Farbe aus dem ersten Tag (deterministische Palette). Fehlt ein Tag, KÖNNEN Marker die Space-`primaryColor` als Default verwenden (Tag-Akzent hat Vorrang; siehe `04-items-relations-groups-spaces.md` → Space-Primärfarbe); andernfalls nutzt der Adapter seinen Default-Pin. |
| `icon` | `data.icon` (optional), sonst erster Tag-Name | Glyph-Hint; aufgelöst über die geteilte Icon-Registry (kuratierter Name \| inline-SVG \| Emoji), Fallback Dot. **Aktiv** emittiert (`MapView`) und konsumiert (beide Adapter rendern den Pin via `renderMarkerSvg`). |
| `shape` / `selected` / `glowColor` | optional | Pin-Form (`circle`/`square`, Default `circle`), Auswahl-Zustand und Glow-Farbe (Ursprungsgruppe des Items); vom Renderer gezeichnet (DOM-`filter` bzw. WebGL-Layer-Halo). Clustering ist Capability-Sache (`ClusterCapable`), nicht Teil des Mappings. |

Regeln:

1. Das Mapping ist **getrennt vom Marker-Rendering**. RLS produziert `MapMarkerSpec`; der engine-agnostische Marker-Renderer (`renderMarkerSvg`) erzeugt daraus den sichtbaren Pin (Form, Glyph, Schatten). Cluster-Darstellung bleibt Adapter-Sache.
2. Farbe kommt heute aus `getTagAccentColor(tags[0])` (CSS-Color-Accent der geteilten Tag-Palette, vgl. `packages/toolkit/src/lib/utils.ts`). `getTagColor` (Tailwind-Chip-Klassen) ist hier **nicht** zu verwenden, da Marker keine Tailwind-Flächen sind.
3. Die Position kommt ausschließlich aus `data.position`. Es gibt keinen Alias-Mechanismus (siehe Datenmodell-Regel 6).
4. Das Mapping DARF keine library- oder adapter-spezifischen Typen produzieren; sein einziger Output-Typ ist `MapMarkerSpec` aus dem Adapter-Contract.

## Globe-Projection (`GlobeCapable`)

1. Globe ist eine **optionale Capability** (`GlobeCapable.setProjection("mercator" | "globe")`). Adapter ohne sie bleiben 2D (Mercator); das Modul blendet den Toggle aus.
2. Default ist **Mercator**. Globe ist **umschaltbar** (Setting/Toggle), nicht erzwungen — fürs Erproben und weil Globe bei niedrigem Zoom andere UX hat.
3. Marker, Cluster und Click-Pfade funktionieren in beiden Projektionen identisch über den Basis-Contract. Rückseiten-Occlusion (Marker auf der abgewandten Globe-Hälfte ausblenden) ist Adapter-Detail.

## Datenquelle (viewport-begrenzt)

Die Karte fragt Items **viewport-begrenzt** ab statt den vollen Satz zu laden — der Seam für skalierende Karten (zehntausende Items) und das spätere GraphQL-Backend.

1. Die Marker-Abfrage MUSS die sichtbare **Bounding-Box** als `ItemFilter.bbox` (`[west, south, east, north]`) mitgeben; bei Pan/Zoom (`observeView` → `moveend`) wird neu abgefragt (debounced). Siehe [02-data-interface.md](../02-data-interface.md) → Filter.
2. Ein lokaler Connector DARF `bbox` clientseitig aus dem vollen Satz filtern; ein backend-gestützter Connector (GraphQL) SOLL serverseitig einschränken, sodass nur die Items im Ausschnitt übertragen werden.
3. **Serverseitiges Clustering** (Rückgabe aggregierter Cluster statt Einzel-Items, zoom-parametrisiert) ist die Antwort für sehr große Mengen (> ~100k). Es ist eine **zukünftige, separate Query** (nicht `ItemFilter`, der `Item[]` liefert) und Teil des GraphQL-Meilensteins, kein v0.2-Pflichtteil.
4. Bis dahin gilt: lokaler/voller Satz → `bbox`-gefiltert → client-seitiges Clustering (`ClusterCapable`). Derselbe Modul-Code trägt später den server-geclusterten Pfad, ohne Umbau am Marker-/Adapter-Contract.

### Read-only-Lens-Einbindung

Eine read-only Map-Linse ist kein vollständiges Map Module. Für das volle Modul
gelten weiterhin die viewport-begrenzte `bbox`-Abfrage und die lokalen
Map-Filter dieses Abschnitts. Eine Lens-Einbindung darf bei einem kleinen,
bekannten Bestand (z.B. 15 Seed-Places) den vollständigen Satz laden und
filterlos rendern. Sie bringt keine eigene Filter-Toolbar mit; Filter- und
Detail-Pfad bleiben Eigentum der App Shell.

Bei Shell-Selektion zentriert die Lens einen gerenderten Marker einmal im
**nicht verdeckten Sichtbereich**. Die Shell übergibt dazu ihren Bottom-Drawer-
Inset; bei einem neuen Space-/Bestands-Kontext re-armt sie den Einpass-Gate über
`viewportResetKey`. Ein neuer Adapter erhält dieselben Gates nie vom alten
Adapter-Lauf.

## Layout

Das Map Module füllt den verfügbaren Space-Bereich vollständig aus. Es hat **keinen eigenen Header**: Pan, Zoom und Ausschnittwechsel passieren direkt in der Karte. Sekundäre UI (Suche, Filter, Item-Details, Composer) wird als **Overlay** über der Karte gerendert (Floating-Sheet, Drawer, Popup), nicht als separater Header- oder Sidebar-Bereich.

## Filter

Map nutzt die generische `ItemFilters`-Komponente, die modulübergreifend die gleiche Filter-UX liefert (gleiche Pills, gleicher Composer-Dialog). Filter sind in zwei Klassen:

- **Generische Filter** (aus `ItemFilters`): `type`, `tag`, `schema`, `createdBy`, freie Suche.
- **Viewport-Filter** (erstklassig im `ItemFilter`): `bbox` (nur Items im sichtbaren Ausschnitt) — Teil der Datenquelle, siehe oben.
- **Map-spezifische Zusatzfilter** (vom Map Module ergänzt): `withinRadius`, `hasPosition`, `geometryType`.

Die Kombination wird in den `ItemFilter` der `DataInterface`-Observable abgebildet (siehe [02-data-interface.md](../02-data-interface.md), [06-schema-composition.md](../06-schema-composition.md) und [07-tags.md](../07-tags.md)). `bbox` ist erstklassiger `ItemFilter`-Parameter (Connector filtert lokal client- oder backend-seitig). Zusatzfilter, die `ItemFilter` nicht kennt (`withinRadius`, `geometryType`), werden nach dem `observe()` clientseitig angewendet.

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
3. ~~Wie wird Clustering konfiguriert?~~ **Entschieden (v0.2):** als optionale Capability `ClusterCapable` (adapter-intern, Modul degradiert) — siehe Abschnitt „Clustering".
4. Wie werden Items mit `Polygon`-/`LineString`-Position dargestellt — als überlagerter Layer oder als reiche Marker?
5. Welche Tile-Quellen sind Default in der Reference App (OSM-Standard, eigene Tile-Server, themed Tiles)?
6. Soll der Adapter eine Möglichkeit haben, Karten-spezifische Custom-Controls zu hosten (Layer-Switcher, Zeichenwerkzeuge), oder bleibt die Map-UI im React-Layer?
7. Die generische `ItemFilters`-Komponente gehört konzeptionell in eine Cross-Modul-Spec (App Composition oder eigenes Dokument). Der Vertrag, wie Module ihre modulspezifischen Filter registrieren, ist noch offen.
8. **Marker-Click-Flow: Popup vs. Detail-Panel.** Aktuell öffnet ein Marker-Click direkt den `ItemDetailView`-Host (read↔edit + Aktionsmenü, intern `ItemDetailPanel`) im `AdaptivePanel` — konsistent mit Feed und Calendar (Kanban nutzt vorerst sein eigenes `TaskEditPanel`).

   Diskussion mit Sebastian offen, drei mögliche Varianten:

   - **A — Direkt-Detail (heutiger Stand):** Marker-Klick öffnet den `ItemDetailView`-Host als Sidebar. Pro: identisch zu allen anderen Modulen, Edit/Delete in-panel, volles Comment-Threading + Reaktionen sofort verfügbar. Contra: Map verschwindet visuell teilweise hinter dem Panel, User verliert räumlichen Kontext.
   - **B — Popup-Zwischenstation:** Marker-Klick öffnet ein Leaflet/MapLibre-Popup mit der `ItemPreview` inline; ein „Details öffnen"-Action im Popup wechselt dann zum `ItemDetailPanel`. Pro: Map bleibt voll sichtbar, schnelles Peek. Contra: zwei Klicks bis zum Detail, weicht vom Modul-übergreifenden Pattern ab, Popup-Styling muss separat gepflegt werden.
   - **C — Hybrid:** Klick öffnet Popup mit `ItemPreview`; ein Hover oder Long-Press öffnet direkt das Detail-Panel. Pro: beides bedienbar. Contra: zwei verschiedene Interaktionen für sehr ähnliches Verhalten, Discoverability auf Touch unklar.

   Open Question für Sebastian: Welche Variante passt zu seinem UX-Modell für ortsbasierte Discovery? Insbesondere ob Map-Kontext-Erhalt wichtiger ist als Modul-Konsistenz.
9. **Serverseitiges Clustering / Cluster-Tiling** (> ~100k Items): zoom-parametrisierte Cluster-Query oder Vektor-Tiles (z.B. PostGIS `ST_AsMVT`) — Teil des GraphQL-Backend-Meilensteins, Query-Form noch zu definieren (siehe Datenquelle).
10. **`VectorSourceCapable`** (optional): effizienter Source-Handoff (GeoJSON-FeatureCollection / typed source) statt `MapMarkerSpec[]` für Engines mit nativer Vektor-Source, um den JS-Listen-Pfad bei sehr vielen Markern zu umgehen. Optimierung, noch nicht normiert.
11. **`CapacitorNativeMapAdapter`** (iOS/Android nativ): konkrete SDK-Wahl (MapKit / Google Maps / Mapbox-native) und welche Capabilities das jeweilige SDK erfüllt, offen.
