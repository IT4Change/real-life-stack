# Shared Module Components

**Status:** Normativer Entwurf v0.1

Diese Spec listet die wiederverwendbaren Bausteine, die mehr als ein *Space Module* benutzen darf — und beschreibt für jede Komponente den minimalen Vertrag, gegen den Module sich verlassen können. Sie ergänzt [01-app-composition.md §Module Components](../01-app-composition.md) um die maschinen-lesbare Definition jedes geteilten Bausteins.

Sie definiert *nicht* das visuelle Aussehen — das ist Sache der UI-Schicht und liegt im Polish-Backlog. Was hier festgeschrieben ist: API-Form, Daten-Verträge und Slot-Konvention.

Code-Referenz: `packages/toolkit/src/components/` und `packages/toolkit/src/hooks/`.

## Zweck

Module Components abstrahieren wiederkehrendes UI-Verhalten, das jedes neue Modul sonst neu erfindet:

- Item-Vorschau (Preview),
- Item-Detail mit Comments und Reactions,
- Composer für Item-Erstellung und -Bearbeitung,
- Filter über Tags / Type / Date,
- Profile-Click.

Jede shared Komponente trägt einen klaren Vertrag, damit Module sie ohne Library-Bindung benutzen können.

## Geltungsbereich

Diese Spec deckt:

- die geteilten React-Komponenten im Toolkit (`packages/toolkit/src/components/`),
- die geteilten Hooks (`packages/toolkit/src/hooks/`),
- die Slot-/Adornment-Konventionen, die Module nutzen um spezifische Darstellung zu ergänzen.

Sie deckt *nicht*:

- visuelle Spezifikation (Spacings, Farben, Hover-States) — folgt im UI-Polish,
- modul-spezifische Komponenten (z.B. `KanbanBoard`, `CalendarView`) — bleiben in ihrem Modul,
- App-Shell-Flächen (Navbar, ProfileDialog) — eigene Verträge in `01-app-composition.md`.

## Komponenten

Jede shared Komponente hat: Zweck, Vertrag (TypeScript-Signatur), Slot-Konvention falls vorhanden, Spec-Anker.

### `ContentComposer`

**Zweck:** Item-Erstellung und -Bearbeitung über eine Widget-Komposition.

**Vertrag (Pflichtfelder + häufig gesetzte Optionen):**

```ts
interface ContentComposerProps {
  contentTypes: ContentTypeConfig[]
  initialContentType?: string
  /** Alias für initialContentType, wenn die UI mit einem festen Modus arbeitet. */
  mode?: string
  initialData?: Partial<WidgetData>
  onSubmit: (data: ContentComposerSubmitData) => void | Promise<void>
  onCancel?: () => void
  onDelete?: () => void
  /** Expliziter Override; sonst `editMode ?? !!onDelete`. */
  editMode?: boolean
  widgets?: CustomWidgetDefinition[]
  showVisibility?: boolean
  defaultPublic?: boolean
  liveUpdate?: boolean
  className?: string
  // Weitere optionale Props (peopleOptions, tagSuggestions, geocode,
  // reverseGeocode, requestMapPick, renderPreview, …) siehe
  // `packages/toolkit/src/components/composer/content-composer.tsx`.
}

interface ContentComposerSubmitData {
  contentType: string
  isPublic: boolean
  data: WidgetData
}
```

**Slot-Konvention:** `contentTypes[].defaultWidgets` listet die Widgets, die der Composer für einen Typ rendert (`title`, `text`, `date`, `location`, `status`, `people`, `tags`, `media`, `group`). Modul-spezifische Widgets können per `widgets?: CustomWidgetDefinition[]` ergänzt werden.

**Edit vs. Create:** Der Composer entscheidet via `editMode ?? !!onDelete` — explizit gesetzter `editMode` gewinnt; ansonsten signalisiert das Vorhandensein von `onDelete` Edit-Modus (Delete-Button erscheint, Submit-Label wechselt zu „Speichern"). Caller ohne beides sind im Create-Modus.

**Präsentation je Modul (Hülle):** Die `ContentComposer`-Form ist geteilt; *wie* sie eingeblendet wird, wählt das Modul — es gibt mehrere Hüllen, nicht eine für alle. Heute: **Fullscreen-Morph** (Feed, `FeedComposerTrigger`) und **Content-Panel** (Calendar/Map/Kanban, [Ebene 1](../01-app-composition.md): Sidebar auf Desktop / Drawer auf Mobile). Vereinheitlicht wird nur, was tatsächlich falsch liegt (z.B. ein Composer, der auf Mobile fälschlich Sidebar bleibt), nicht per Brechstange alles gleichgemacht.

**Spec:** [01-app-composition.md → Module Components](../01-app-composition.md)

#### Location-Widget (`location`)

**Zweck:** Einen **physischen Ort** für verortete Items setzen. Das `location`-Widget (`LocationWidget`, im `WIDGET_ORDER` zwischen `date` und `people`) hat genau diesen einen Zweck. Online-/Meeting-Links sind kein Ort und gehören nicht hierher (ggf. eigenes Feld/Widget).

**Zwei Eingabewege:**

- **(a) Adresse → Geocoding → Position:** Freitext-Adresse im Adress-`Input`. Ein injizierter Geocoder löst die Eingabe debounced auf (ab wenigen Zeichen; die vorherige Anfrage wird abgebrochen) und zeigt Vorschläge; die Auswahl setzt `data.position` und übernimmt den Adresstext. Die Vorschlagsliste ist eine zugängliche Combobox (`role="combobox"`/`listbox`/`option`, Pfeiltasten/Enter/Escape). Der Geocoding-Provider ist nicht normativ festgelegt und wird — wie der Karten-Adapter — injiziert; Referenz ist Nominatim/OSM (öffentliche Instanz nur Dev/Demo, produktiv self-hosted/identifiziert).
- **(b) Position auf der Karte wählen:** Neben dem Adressfeld steht ein kompakter Button (in einer Zeile); beim Klick ruft das Widget einen vom Caller bereitgestellten `onPickOnMap`-Callback auf. Gepickt wird auf der **großen Karte des Map Module**, nicht in einer Inline-Minikarte: die App wechselt ins Map-Modul, ein Klick auf die Karte übernimmt die Position sofort (`MapAdapter.observeClicks` → `MapClickEvent.position`, durchgängig `[lng, lat]`), anschließend füllt ein Reverse-Geocoding das Adressfeld. Nach dem Picken bleibt man auf der Karte.

**App-Realisierung des Map-Picks (Referenz-App, nicht Widget-Sache):** Damit der Speichern-Pfad den Modulwechsel übersteht, liegen Editor + `ContentComposer` app-weit über dem Modul-Outlet (Composer-Host). Das geteilte Content-Panel ([01-app-composition.md → Overlay-Flächen](../01-app-composition.md)) bleibt beim Modulwechsel offen; auf kompakten Screens (Drawer) tritt es während des Pickens beiseite und kommt per „Fertig" zurück, auf Desktop bleibt die Sidebar sichtbar (kein Extra-Schritt, direkt „Erstellen"). „Abbrechen" stellt die vorherige Position wieder her und kehrt ins Ursprungsmodul zurück. Das Widget selbst kennt nur `onPickOnMap` und den injizierten Geocoder.

**Daten-Vertrag (geschriebene Felder):**

- `data.position` MUSS ein GeoJSON `Point` sein (`pointFromLatLng(lat, lng)` aus `lib/geo`), konform zu [place/v1](../schemas/vocab/place/v1/schema.json). Beide Eingabewege (a) und (b) schreiben in dasselbe Feld.
- `data.address` SOLL den menschlichen Adresstext halten (aus Geocoding-Auswahl oder Reverse-Geocoding).
- `data.locationName` KANN einen benannten Ort halten (z.B. „Markthalle 7").

**Auslieferung:** Adress-Geocoding (a) und Map-Pick (b) sind zusammen mit dem `MapLibreMapAdapter` (Vektorkarte, [map.md → Bereitgestellte Adapter](map.md)) implementiert. Ohne bereitgestellten Geocoder/Karten-Adapter funktioniert das Widget weiter als reiner Adress-Freitext (kein `data.position`, kein Pick-Button).

**Welche Typen das Widget anbieten:** Das Widget gehört in `contentTypes[].defaultWidgets` jedes Typs mit Ortsbezug — primär `place` (Position ist Pflichtfeld), sowie `event` mit Ort. Die Auswahl leitet sich aus Typ/Template ab; der `ContentComposer` rendert `location` nur, wenn der Typ es in `defaultWidgets` führt oder der Nutzer es manuell zuschaltet.

**Spec:** [map.md → Adapter-Vertrag](map.md), [01-app-composition.md → Overlay-Flächen](../01-app-composition.md), [place/v1](../schemas/vocab/place/v1/schema.json)

### `ItemDetailPanel`

**Zweck:** Container für Item-Detail-Anzeige mit Comments-Section. Library-agnostisches Inneres — Caller entscheidet, wie das Panel gerahmt wird (Modal, Drawer, Side-Panel, Route).

**Vertrag:**

```ts
interface ItemDetailPanelProps {
  itemId: string
  children: ReactNode          // Top-Slot: Read-View ODER Composer im Edit-Mode
  renderCommentReactions?: (commentId: string) => ReactNode
  commentsLabel?: string
  className?: string
}
```

**Slot-Konvention:** `children` ist der freie Top-Slot. Module füllen ihn mit entweder einer Read-Ansicht (typischerweise `ItemPreview` mit Adornments) oder einem inline `ContentComposer` im Edit-Mode. Der Comments-Bereich wird automatisch gerendert; das `renderCommentReactions`-Slot erlaubt es, ReactionBars an einzelne Comments zu hängen.

**Spec:** [01-app-composition.md → Module Components](../01-app-composition.md)

### `ItemDetailActions`

**Zweck:** Item-Aktionen im **Card-Header** (rechtsbündig über `ItemPreview`s `actions`-Slot, nicht in der Panel-Chrome): prominenter „Bearbeiten"-Button + ⋮-Menü (Teilen / Löschen). Berechtigungs-gegated über `useItemPermissions(item)` (siehe [03-capabilities.md → AuthorizationCapable](../03-capabilities.md)).

> **Trennung Inhalt vs. Fenster:** Item-Aktionen (⋮) gehören zum Item (Card-Header). Die Panel-Chrome (`AdaptivePanel`) trägt nur noch **Schließen** (+ mobiler Drag-Griff) — Pin und Maximieren wurden entfernt (kein realer Nutzen: Pin wirkt in der Sidebar nicht, Maximieren verdeckt den Kontext).

**Vertrag:**

```ts
interface ItemDetailActionsProps {
  item: Item
  onEdit?: () => void      // → Edit-Modus; "Bearbeiten" nur wenn editierbar UND verdrahtet
  onDeleted?: () => void   // nach erfolgtem Löschen (z.B. Panel schließen); Löschung erfolgt intern
  onShare?: () => void     // Link teilen/kopieren
  title?: string           // für den Lösch-Dialog
}
```

**Regeln:**

1. Sichtbarkeit folgt `useItemPermissions(item)`: nicht erlaubte Aktionen werden **ausgeblendet** (nicht disabled). Gibt es keine erlaubte Aktion, rendert die Komponente nichts.
2. **Bearbeiten** ist ein prominenter Button (read-first, ein Tap), nur bei `canEdit` **und** vorhandenem `onEdit`.
3. **Löschen** liegt im ⋮-Menü, läuft hinter `DeleteConfirmDialog` und führt die Löschung selbst aus (`connector.deleteItem`, defensiv auf `isWritable` gegated); danach `onDeleted`.
4. **Teilen** erscheint im ⋮-Menü, wenn `onShare` verdrahtet ist.
5. Das Gating ist eine **UI-Affordance**, keine Sicherheitsgrenze — Durchsetzung backend-/protokollseitig.

Die reine Sichtbarkeitslogik ist als `visibleDetailActions(perms, hasOnEdit, hasOnShare)` ausgelagert (testbar).

### `DeleteConfirmDialog`

**Zweck:** Bestätigung vor dem Löschen („… wird gelöscht. Das kann nicht rückgängig gemacht werden.") mit Busy-State. `onConfirm` führt die Löschung aus, der Dialog schließt danach. Wird intern von `ItemDetailActions` benutzt, ist aber eigenständig einbindbar.

Konzept/UX: [concepts/item-edit-delete-2026-06.md](../../concepts/item-edit-delete-2026-06.md). Das vollständige Edit-in-Panel (read↔edit-Host) folgt in einer späteren Phase.

### `CommentSection`

**Zweck:** Comments + Replies UI mit Reply-Threading. Wird intern von `ItemDetailPanel` benutzt, kann aber auch direkt eingebunden werden.

**Vertrag:**

```ts
interface CommentSectionProps {
  itemId: string
  placeholder?: string
  /** Slot für ReactionBar pro Comment. */
  renderReactions?: (itemId: string) => ReactNode
  /** Versteckt den eingebauten Input — Caller platziert `CommentInput` selbst. */
  hideInput?: boolean
  /**
   * Reply-State an den Caller herausgeben (für externes CommentInput).
   * `CommentQuote` ist aus `@real-life-stack/toolkit` re-exportiert.
   */
  onReplyChange?: (
    replyTo: CommentQuote | null,
    submit: (text: string) => Promise<void>,
    cancel: () => void,
  ) => void
  className?: string
}
```

**Kompositions-Konvention:** Liste und Eingabe werden als Geschwister gerendert; der Caller entscheidet das Layout. `hideInput` + `onReplyChange` erlauben das CommentInput außerhalb des Scroll-Containers zu platzieren (z.B. als gepinnte Eingabeleiste in `ItemDetailPanel`).

**Spec:** [01-app-composition.md → Module Components](../01-app-composition.md)

### `ReactionBar`

**Zweck:** Emoji-Reactions auf ein Item. Aggregiert Counts pro Emoji, zeigt was der aktuelle User reagiert hat.

**Vertrag:**

```ts
interface ReactionBarProps {
  itemId: string
  /** Anzahl distincter Emojis vor dem Einklappen. Default: 6. */
  maxVisible?: number
  /** Klick auf Count (Desktop) oder Long-Press (Mobile) öffnet Details. */
  onOpenDetails?: (emoji?: string) => void
  className?: string
}
```

**Aktionen:** Klick auf Emoji togglet die Reaction des aktuellen Users. Neue Emojis werden über einen Picker hinzugefügt. Über `onOpenDetails` kann der Caller eine Liste der Reagierenden öffnen.

**Spec:** [01-app-composition.md → Module Components](../01-app-composition.md)

### `ItemPreview`

**Zweck:** Generische Item-Card für Listenansichten. Konsolidiert das Layout, das vorher in jedem Modul dupliziert war (Feed-Card, inline `KanbanCard`, Calendar `EventCard`).

**Vertrag:**

```ts
type ItemPreviewDensity = "comfortable" | "compact"

interface ItemPreviewProps {
  item: Item
  /**
   * Resolved item author. Wenn `undefined`, fällt die Card auf
   * `item.createdBy` als Display-Name zurück. Wenn `null`, wird der
   * gesamte Author-Block unterdrückt.
   */
  author?: User | null
  onClick?: () => void
  /** Slot neben dem Author-Namen (z.B. Type-Badge, Status-Chip). */
  headerAdornment?: ReactNode
  /** Rechtsbündige Aktionen am Ende der Header-Zeile (z.B. das Detail-⋮ via
   *  `ItemDetailActions`). Nur Detail-Ansichten füllen ihn; Listen-Cards lassen
   *  ihn leer, damit Cards aktionsfrei bleiben. */
  actions?: ReactNode
  /** Slot zwischen Title und Description (z.B. Date-Hint, Distance). */
  metaAdornment?: ReactNode
  /** Slot unter den Tag-Chips (z.B. Assignees, Comment-Count, ReactionBar). */
  footerAdornment?: ReactNode
  /** Layout-Density (siehe unten). Default `comfortable`. */
  density?: ItemPreviewDensity
  className?: string
}
```

**Density:**

- `comfortable` (Default) — Feed-Card-Form: Avatar 10×10, font-base Title, p-4 Spacing, Description wird angezeigt, Footer mit Border-Top.
- `compact` — Kanban-/Liste-Form: Avatar 6×6, font-sm Title, p-3 Spacing, **Description wird ausgeblendet**, Footer ohne Border. Tauglich für dichte Board-Spalten, wo mehrere Cards zugleich sichtbar bleiben sollen.

**Default-Body:** Author-Row (Avatar + Name + `RelativeTime`), Title, Description (`data.content ?? data.description`, max 4 Zeilen), Tags (chips, top-level `item.tags`, Color via `getTagColor`).

**Slot-Konvention:** Module liefern modul-spezifische Cues über die drei Slots. Jeder Slot rendert **unabhängig vom Content** der Card — eine Card ohne Author kann trotzdem ein `headerAdornment` haben, eine Card ohne Title kann trotzdem ein `metaAdornment` zeigen. Slots und Datenfelder sind orthogonal. Adornments, die eigene Buttons enthalten, müssen `event.stopPropagation()` aufrufen, damit ein Button-Click nicht den Card-Click mit auslöst.

**Keyboard-Aktivierung:** Wenn `onClick` gesetzt ist, exponiert die Card `role="button"`, `tabIndex={0}` und reagiert auf Enter und Space wie ein Button — Card-Click ist damit auch ohne Maus erreichbar.

**Daten-Pfad:** `useItemTags(item)` intern. Author-Resolution liegt beim Caller (`useItemAuthor` empfohlen).

**Sebastian-Polish-Backlog:** Visuelle Spezifikation (Spacings, Card-Höhen, Hover-Transitions, Avatar-Sizing pro Density) — heute orientiert am früheren Feed-Card-Layout.

**Code:** `packages/toolkit/src/components/preview/item-preview.tsx`. Stories: `item-preview.stories.tsx`.

### Adornment-Komponenten

Kleine, zusammensetzbare Bausteine, die Module in die Adornment-Slots von `ItemPreview` legen. Sie sind shared, weil sie modul-übergreifend dieselben Konzepte (Type, Time/Place, Comments) ausdrücken — Feed-Cards, Kanban-Cards, Calendar-Cards greifen alle darauf zu.

#### `ItemTypeBadge`

**Zweck:** Chip mit Icon + Label für den Item-Typ. Belongs in `headerAdornment`.

```ts
interface ItemTypeBadgeProps {
  type: string
  /** Override or extend the type → presentation registry. */
  config?: Record<string, ItemTypeBadgeConfig>
  className?: string
}
interface ItemTypeBadgeConfig {
  icon: ComponentType<{ className?: string }>
  label: string
  className: string
}
```

Default-Registry: `event`, `task`, `place`, `person`. Unbekannte oder Standard-Typen (`post`, `comment`, `reaction`) rendern `null` — Modul-spezifische Typen können per `config`-Prop ergänzt werden.

#### `ItemMetaRow`

**Zweck:** Inline-Zeile mit Date-Hint und Address. Belongs in `metaAdornment`. Rendert `null`, wenn weder `data.start` noch `data.address` vorhanden sind.

```ts
interface ItemMetaRowProps {
  item: Item
  className?: string
}
```

Plus eine exportierte Format-Funktion `formatEventRange(start, end?)` für Caller, die den String außerhalb der Inline-Zeile brauchen (z.B. Tooltip, Tabelle).

#### `ItemTimeRange`

**Zweck:** Schwesterkomponente zu `ItemMetaRow` für Kontexte, in denen das Datum bereits durch die Umgebung gegeben ist (Calendar-Liste mit Tages-Gruppen, „today's events"-Panel). Zeigt nur Uhrzeit + Address.

```ts
interface ItemTimeRangeProps {
  item: Item
  /**
   * Pre-resolved location label. When omitted, falls back to
   * `data.locationName ?? data.address`.
   */
  locationLabel?: string
  className?: string
}
```

All-day-Events rendern als „Ganztägig". Same-day-Range als „18:00 – 20:00", ohne `end` als „18:00". Mehrtägige Range fügt das End-Datum hinzu, damit User nicht denken das Event ende noch am gleichen Tag.

Location-Auflösung: `locationLabel`-Prop hat Vorrang; sonst `data.locationName ?? data.address` (analog zu Calendar's eigener Location-Normalisierung). Dadurch wird ein Event mit nur `locationName` ebenfalls korrekt angezeigt.

Plus exportierte Format-Funktion `formatTimeRange(start, end?)`.

#### `ItemCommentCount`

**Zweck:** Comment-Count-Badge für `footerAdornment`. Rendert `null` bei `count <= 0`.

```ts
interface ItemCommentCountProps {
  count: number
  onClick?: () => void
  className?: string
}
```

Zwei Render-Modi je nach `onClick`:

- **Mit `onClick`**: `<button>` (fokussierbar, Hover-Stil), ruft `event.stopPropagation()` damit der Card-Click nicht doppelt feuert.
- **Ohne `onClick`**: `<span>` (nicht-interaktiv, nicht im Tab-Order). Ein rein anzeigender Count taucht so nicht als Focus-Stop ohne Aktion auf.

#### `ItemAssignees`

**Zweck:** Overlapping Avatar-Stack mit kompakter Namens-Zusammenfassung. Belongs in `footerAdornment`. Rendert `null` bei leerer User-Liste.

```ts
interface ItemAssigneesProps {
  users: readonly User[]
  className?: string
}
```

Caller löst die User-Objekte auf (typischerweise aus `assignedTo`-Relations + Member-Liste) und übergibt sie als resolved Array. Komponente ist rein präsentational. Namens-Summary: einzelner Name, „A, B" für zwei, „A + N weitere" ab drei; voller Kommaseparierter Liste im Hover-Tooltip.

**Code:** `packages/toolkit/src/components/preview/item-{type-badge,meta-row,comment-count,assignees}.tsx`.

### `TagChip`

**Zweck:** Einheitliche Tag-Darstellung über *alle* Flächen — Post-/Preview-Cards, Filter-Picker und aktive Filter-Chips. Eine Quelle, damit ein Tag überall gleich aussieht.

```ts
interface TagChipProps {
  tag: string
  size?: "sm" | "md"
  selected?: boolean      // Toggle-Modus (Filter-Picker)
  onToggle?: () => void
  onRemove?: () => void   // entfernbarer Modus (aktiver Filter-Chip)
  className?: string
}
```

**Prinzip:** Tags tragen **eine deterministische Farb-Palette** (`getTagColor`), über alle Flächen identisch (Posts, Filter, Kanban). Drei Modi: statisch (Post), Toggle (Filter-Picker — selektiert volle Deckkraft, sonst gedimmt; die Tag-Farbe bleibt immer sichtbar) und entfernbar (aktiver Filter-Chip mit ✕). Die Palette gehört langfristig in die Design-Tokens; bis dahin liefert sie `getTagColor` (Spec [07-tags.md](../07-tags.md)).

**Code:** `packages/toolkit/src/components/tag/tag-chip.tsx`.

### `FilterBar`

**Zweck:** Shared Filter-UI für jedes *Space Module*. Hält Tags und Item-Type als Common-Filter, exponiert zwei Slots (`chipsExtra`, `drawerExtra`) für Modul-spezifische Filter, plus exportierte Building-Blocks (`FilterChip`, `FilterMultiSelect`, `FilterToggle`, `FilterSection`) für eine einheitliche Optik. Tag-Filter (Picker + aktive Chips) nutzen `TagChip` — farbig, dieselbe Palette wie auf Posts; Typen nutzen die generischen Building-Blocks.

**Layout-Pattern (Anton + Sebastian-Konsens 11.06.2026, revidiert 12.06.2026):** Eine **Controls-Zeile** (Filter-Button + Suche in `leadingActions` + `trailingActions`) bricht nie um; die **aktiven Filter-Chips** liegen in einer eigenen Zeile darunter und wrappen frei. Ein „Filter"-Button öffnet die Auswahl im geteilten Content-Panel (`ModulePanel`, Sidebar auf Desktop / Drawer auf Mobile). Aktive Filter bleiben immer sichtbar; das Panel ist nur für die Auswahl — bewusst dasselbe Panel wie Detail und Composer.

```ts
interface FilterBarProps {
  value: FilterBarValue
  onChange: (next: FilterBarValue) => void
  availableTags?: readonly string[]
  availableTypes?: readonly FilterTypeOption[]
  chipsExtra?: ReactNode      // Modul-spezifische Active-Chips
  drawerExtra?: ReactNode     // Modul-spezifische Drawer-Sections
  leadingActions?: ReactNode  // direkt neben dem Filter-Button — hier gehört die Suche hin
  trailingActions?: ReactNode // rechtsbündig, z.B. Spalten-/View-Toggle
  className?: string
}

interface FilterBarValue {
  tags: string[]      // AND
  types: string[]     // OR
}

interface FilterTypeOption {
  id: string
  label: string
  icon?: ComponentType<{ className?: string }>
}
```

**Controlled component:** der Filter-Wert lebt im Caller; das KANN View-State sein oder ein app-weiter, modulübergreifend geteilter Store (siehe „Modul-übergreifender Filter-State" unten). View-spezifische Persistierung (URL params, localStorage) bleibt Caller-Job.

**Modul-spezifische Filter:** in den Slots `chipsExtra` (Active-Chip-Row) und `drawerExtra` (Auswahl-Drawer) zusammensetzen aus den exportierten Building-Blocks (`FilterSection` + `FilterMultiSelect` / `FilterToggle`). Damit sehen Modul-Extras automatisch konsistent mit den Common-Filtern aus.

**Suche:** gehört in `leadingActions`, direkt neben den Filter-Button (Sebastian-Konsens 12.06.2026: Filter und Suche gehören visuell zusammen). `trailingActions` bleibt für rechtsbündige Modul-Aktionen (Spalten-Editor, View-Mode-Toggle).

**Hook:** `useFilterableItems(items, value)` wendet die `FilterBarValue` clientseitig an. `applyFilterBarValue(items, value)` ist als pure Funktion exportiert (Tests, non-React-Caller). Server-seitige Optimierung (Lift `tags` in `ItemFilter.hasTag`) ist bewusst nicht hier — `data-interface` Concern, siehe [02-data-interface.md](../02-data-interface.md).

**Modul-übergreifender Filter-State (geteilter Caller):** Die `FilterBar` bleibt ein Controlled Component; *wo* der `value` gehalten wird, bestimmt der Caller. Der Caller KANN ein **app-weiter** Store sein statt View-State. Dann teilen sich Feed, Kanban, Calendar und Map **einen** `FilterBarValue`, und ein gesetzter Tag-/Typ-Filter wirkt nach dem Modul-Wechsel unverändert weiter (ein in Feed gesetzter Tag filtert ohne Zutun auch Kanban, Calendar und Map).

Regeln:

1. Der geteilte State SOLL **neben dem persistenten Content-Panel** leben (App-Shell-Ebene, [01-app-composition.md → Overlay-Flächen Ebene 1](../01-app-composition.md)). Er ist app-weit und nicht modulgebunden, analog dazu, dass das Content-Panel beim Modul-Wechsel offen bleibt.
2. Geteilt wird der gemeinsame `FilterBarValue` (`tags`, `types`). Modul-spezifische Extras (`chipsExtra`/`drawerExtra`, z.B. Map-`bounds` oder Kanban-View-Toggle) bleiben beim jeweiligen Modul und werden NICHT app-weit geteilt.
3. Die `FilterBar` selbst ist die **geteilte Fläche**: jedes Modul rendert dieselbe `FilterBar` gegen denselben `value`/`onChange`. Tag-Filter nutzen durchgängig `TagChip` mit `getTagColor`, sodass ein Tag in Picker, aktiven Chips und auf den Cards modulübergreifend identisch eingefärbt ist (siehe [`TagChip`](#tagchip), [07-tags.md](../07-tags.md)).
4. Typen sind modulabhängig: ein in Feed gesetzter `types`-Filter KANN in einem Modul ohne diesen Typ zu einer leeren Auswahl führen. Das ist erwartet; die `availableTypes` jedes Moduls bestimmen, welche Typ-Chips dort sichtbar/abwählbar sind. Der geteilte `tags`-Filter ist davon unberührt.
5. View-spezifische Persistierung (URL params, localStorage) bleibt Caller-Job; ein app-weiter Store ist eine Caller-Wahl, kein Toolkit-Zwang. `emptyFilterBarValue` ist der Initialwert.

**Code:** `packages/toolkit/src/components/filter/`. Stories: `filter-bar.stories.tsx` zeigt Default, Pre-Selected, Kanban-Toggle-Extras, Calendar-Location-Extras, Empty-State.

### `CreateFab`

Einheitlicher Floating-Action-Button für „neues Item erstellen", fixed unten-rechts in der Modul-Surface. Jedes Space-Modul (Feed, Kanban, Calendar, Map) hat damit denselben Create-Entry-Point an derselben Bildschirm-Position.

```ts
interface CreateFabProps {
  onClick: () => void
  label?: string       // aria-label, Default „Erstellen"
  className?: string
}
```

**Positionierung:** `fixed` unten-rechts, mit Safe-Area- und BottomNav-Abstand auf Mobile. Der rechte Rand **folgt dem Panel-Inset**: öffnet eine rechte Sidebar, wandert der FAB um deren Breite nach links — er liest dieselbe `--adaptive-panel-margin-right`-CSS-Variable, die der Content fürs Einrücken nutzt, und sitzt so **neben** dem Panel statt darunter.

**Beziehung zu `useItemEditor`:** Der FAB ist nur das visuelle Trigger-Element. Der Caller wired `onClick` so, dass der Composer in die passende **Hülle** öffnet (siehe `ContentComposer` → Präsentation je Modul): Calendar/Map/Kanban über das Content-Panel (`useModulePanel().open({ kind: "composer", … })`), Feed über den `FeedComposerTrigger`. `onSubmit` ruft `await editor.submit(data)` und schließt auf Erfolg — das verhindert Mehrfach-Submits durch wiederholtes Klicken.

**Feed-Sonderfall:** Feed nutzt den `FeedComposerTrigger` (input-pill, morpht in Fullscreen-Composer) als primären Create-Entry — bewusst eine eigene Composer-Hülle, kein FAB.

**Code:** `packages/toolkit/src/components/create-fab/`.

### `ModulePanel` + `ModuleSettingsPlaceholder`

`ModulePanelProvider` stellt **eine app-weite** `AdaptivePanel`-Instanz bereit (Sidebar auf Desktop, Drawer auf Mobile). Alle Overlay-Inhalte (Filter, Detail, Composer, Einstellungen, Debug) öffnen über `useModulePanel().open({ kind, content, onClose? })` in dieselbe Instanz statt sich zu stapeln (Sebastian-Konsens 12.06.2026: ein Panel, Content-Swap statt Stapeln). Content swappt in place — Filter offen + Item-Klick ersetzt den Filter durch das Detail. Das Panel **bleibt beim Modul-Wechsel offen** (persistente Fläche, nicht modulgebunden). `onClose` feuert nur beim echten Schließen (X / Backdrop / Drawer-Drag), nicht beim Content-Swap. Dies ist **Ebene 1** des Overlay-Modells, siehe [01-app-composition.md → Overlay-Flächen](../01-app-composition.md).

```ts
type ModulePanelKind = "filter" | "detail" | "composer" | "settings" | "debug" | "custom"
interface ModulePanelEntry { kind: ModulePanelKind; content: ReactNode; onClose?: () => void }
```

**Mobile-Höhen:** Drawer und Modal bemessen ihre Höhe in dynamischen Viewport-Einheiten (`dvh`), nicht `vh`, damit die ein-/ausfahrende Browser-Toolbar die Fläche nicht abschneidet.

**Moduleinstellungen:** jedes Modul bekommt einen Zahnrad-Button (`Settings2`) in `trailingActions`, der `kind: "settings"` ins Panel öffnet. `ModuleSettingsPlaceholder` ist der geteilte Platzhalter, bis echte Settings pro Modul existieren — er reserviert Entry-Point und Fläche (`moduleLabel` + optionale `plannedItems`-Liste). Kanban nutzt ihn heute statt des früheren funktionslosen „Spalten bearbeiten"-Buttons; „Spalten bearbeiten" wird später ein Settings-Eintrag.

**Code:** `packages/toolkit/src/components/module-panel/`.

## Hooks

Reine Item-Ableitungen, von beliebigen Komponenten benutzbar.

### `useItemEditor`

**Zweck:** Konsolidiert Composer-Modal-State, `@context`-Ableitung und createItem/updateItem-Dispatch. Module liefern einen `mapSubmission`-Mapper; der Hook orchestriert.

**Vertrag (Options + Result):**

```ts
interface UseItemEditorOptions {
  currentUserId: string | undefined
  mapSubmission: ItemEditorMapper
  onCreated?: (item: Item) => void | Promise<void>
  onUpdated?: (item: Item) => void | Promise<void>
  onDeleted?: (itemId: string) => void | Promise<void>
}

type ItemEditorMapper = (
  submission: ContentComposerSubmitData,
  ctx: { mode: "create" | "edit"; existingItem: Item | null },
) => ItemEditorPayload | null

interface UseItemEditorResult {
  isOpen: boolean
  mode: "create" | "edit"
  currentItem: Item | null
  error: Error | null
  isSubmitting: boolean
  openCreate(): void
  openEdit(item: Item): void
  close(): void
  submit(
    submission: ContentComposerSubmitData,
    options?: { existingItem?: Item },
  ): Promise<Item | null>
  remove(itemId?: string): Promise<void>
}
```

**Schlüssel-Verhalten:**

1. Der Mapper gibt eine `ItemEditorPayload` zurück (`type`, `data`, optional `tags`, `relations`, `@context`, `createdBy`) oder `null` zum Abbruch.
2. Wenn `@context` fehlt, ruft der Hook `deriveContext(type, data)`.
3. `submit(submission, { existingItem? })` und `remove(itemId?)` akzeptieren Inline-Overrides, damit Views mit eigener Open-State-Logik (z.B. Kanban's `panelState`) den Hook ohne `openEdit`-Round-Trip benutzen können.
4. Fire-and-await — kein Optimistic-Update. Optimistic kann als opt-in Mode später ohne API-Bruch ergänzt werden.

**Spec-Anker:** [06-schema-composition.md](../06-schema-composition.md) (für `deriveContext`).

### Item-Daten-Hooks

Pure Hooks, die Item-Felder normalisiert ausliefern. Module benutzen sie statt manueller Field-Reader.

| Hook | Signatur | Zweck |
|---|---|---|
| `useItemAuthor` | `(item, users) => User \| undefined` | Resolved `createdBy` gegen User-Liste |
| `useItemTags` | `(item) => readonly string[]` | Normalisierte Tag-Liste; stabile Identity (Spec [07-tags.md](../07-tags.md)) |
| `useItemDateHint` | `(item) => ItemDateHint` | Strukturiertes `data.start`/`data.end` (Spec [event/v1](../schemas/vocab/event/v1/schema.json)) |
| `useItemPosition` | `(item) => ItemPosition` | GeoJSON-Position; isPlace + Point (Spec [place/v1](../schemas/vocab/place/v1/schema.json)) |

Plus der Default-Formatter `formatItemDateHint(hint)` für eine kompakte Date-Anzeige.

### `useOpenProfile` + `OpenProfileProvider`

**Zweck:** Imperative Handle für „Profile-Open"-Aktion. Der Toolkit liefert nur den Vertrag; die App Shell entscheidet, was „Open Profile" konkret macht (eigenes Profil editieren wenn `userId === currentUser.id`, sonst Read-Only-View).

**Vertrag:**

```ts
type OpenProfile = (userId: string) => void
interface OpenProfileProviderProps {
  openProfile: OpenProfile
  children: ReactNode
}
function useOpenProfile(): OpenProfile  // no-op fallback ohne Provider
```

**Fallback-Semantik:** Ohne Provider liefert `useOpenProfile()` einen No-op. Avatar-Klick-Stellen können den Hook unbedingt aufrufen, ohne Stories oder Test-Harnesses zu brechen.

**`ProfileLink`:** Wrapper, der ein Avatar-Element klickbar macht (`userId`-Prop → `useOpenProfile`). Keyboard-aktivierbar (Enter/Space) und per Default mit `stopPropagation`, damit ein Avatar-Klick in einer klickbaren Card (z.B. `ItemPreview`) nicht das Detail öffnet, sondern das Profil. Eingesetzt in `ItemPreview` (Autor), `ItemAssignees`, `CommentBubble` (via `authorId`), `ReactionDetails`, `ContactCard`.

**`ProfilePanelContent`:** Geteilter Profil-Inhalt mit `mode: "edit" | "view"`. `edit` = eigenes Profil (Avatar-Upload, Name/Bio-Inputs, Save); `view` = read-only Projektion (Avatar/Name/DID, Bio nur wenn vorhanden). Wird ohne eigene Dialog-Hülle gerendert — die App Shell hängt ihn in ihre geteilte `AdaptivePanel`-Instanz.

**App-Shell-Mechanik (Referenz-App):** Die App Shell hostet **eine** `AdaptivePanel`-Instanz mit `allowedModes={["modal"]}` (`modal` auf Desktop und Mobile). Der `OpenProfileProvider` erzeugt das Panel nicht — er liefert nur den `openProfile(userId)`-Callback (no-op ohne Provider), der diese gehostete Instanz öffnet. (Bewusst kein `drawer`: auf Mobile öffnet das Item-Detail bereits als Drawer; ein zweiter Drawer darüber wäre als gestapelte Ebene unklar. Ein zentriertes Modal liegt sichtbar abgehoben über dem Item-Drawer.) `openProfile(userId)` öffnet sie; eigener User → `edit`, fremder → `view` (lädt via `connector.getUser`). Modal liegt über einem offenen Item-Detail-Panel (z-Stacking), statt es zu ersetzen.

## Composability

Module nutzen mehrere shared Components zusammen. Die Verträge sind so geschnitten, dass Komposition direkt funktioniert — keine impliziten Annahmen über Render-Reihenfolge oder DOM-Struktur:

- **Detail mit Edit-Modus:** `ItemDetailPanel` mit `ContentComposer` als `children`, `useItemEditor` für Submit-Routing.
- **Preview mit Adornments:** `ItemPreview` (Phase 2) mit Modul-Adornments und `useItemAuthor`/`useItemTags`/`useItemDateHint` als Datenquelle.
- **Filter:** Module nutzen `useItemTags` für die verfügbare Tag-Aggregation und übergeben das an die `FilterBar` (Phase 3).

## Nicht-Ziele

- Visuelle Spezifikation. Diese Spec bindet keine Farben, Spacings oder Hover-States. Polish liegt in der UI-Schicht.
- Modul-spezifische Komponenten. `KanbanBoard`, `CalendarView`, `MapAdapter` (siehe [map.md](map.md)) bleiben in ihrem Modul.
- App-Shell-Flächen. `WorkspaceSwitcher`, `Navbar` sind in [01-app-composition.md](../01-app-composition.md) spezifiziert, nicht hier. (Die Profil-*Mechanik* `useOpenProfile`/`ProfileLink`/`ProfilePanelContent` ist shared und oben definiert; wie die App Shell sie einhängt, ist app-spezifisch.)
- Backend-Verträge. Diese Spec definiert UI-Composition, nicht den DataInterface-Vertrag (siehe [02-data-interface.md](../02-data-interface.md)).
