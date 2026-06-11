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
  onSubmit: (data: ContentComposerSubmitData) => void
  onCancel?: () => void
  onDelete?: () => void
  /** Expliziter Override; sonst `editMode ?? !!onDelete`. */
  editMode?: boolean
  widgets?: CustomWidgetDefinition[]
  showVisibility?: boolean
  defaultPublic?: boolean
  liveUpdate?: boolean
  className?: string
  // Weitere optionale Props (peopleOptions, tagSuggestions, renderLocationMap,
  // renderPreview, …) siehe `packages/toolkit/src/components/composer/content-composer.tsx`.
}

interface ContentComposerSubmitData {
  contentType: string
  isPublic: boolean
  data: WidgetData
}
```

**Slot-Konvention:** `contentTypes[].defaultWidgets` listet die Widgets, die der Composer für einen Typ rendert (`title`, `text`, `date`, `location`, `status`, `people`, `tags`, `media`, `group`). Modul-spezifische Widgets können per `widgets?: CustomWidgetDefinition[]` ergänzt werden.

**Edit vs. Create:** Der Composer entscheidet via `editMode ?? !!onDelete` — explizit gesetzter `editMode` gewinnt; ansonsten signalisiert das Vorhandensein von `onDelete` Edit-Modus (Delete-Button erscheint, Submit-Label wechselt zu „Speichern"). Caller ohne beides sind im Create-Modus.

**Spec:** [01-app-composition.md → Module Components](../01-app-composition.md)

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

### `FilterBar` (geplant, Phase 3)

**Zweck:** Shared Filter-UI mit Common-Filtern (Tag-Multiselect, Type, Date-Range, Author) und einem Slot für Modul-spezifische Filter.

**Status:** Vertrag offen, finalisiert in Phase 3. Die Filter-Primitiven im `ItemFilter` existieren bereits (`hasTag` ist implementiert, siehe [07-tags.md](../07-tags.md); `hasField` und die anderen Filter sind in [02-data-interface.md](../02-data-interface.md) spezifiziert). Phase 3 baut die shared UI darauf und wired Tag-Multiselect / Type-Filter / Date-Range / Author an das vorhandene `ItemFilter`-Interface.

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

## Composability

Module nutzen mehrere shared Components zusammen. Die Verträge sind so geschnitten, dass Komposition direkt funktioniert — keine impliziten Annahmen über Render-Reihenfolge oder DOM-Struktur:

- **Detail mit Edit-Modus:** `ItemDetailPanel` mit `ContentComposer` als `children`, `useItemEditor` für Submit-Routing.
- **Preview mit Adornments:** `ItemPreview` (Phase 2) mit Modul-Adornments und `useItemAuthor`/`useItemTags`/`useItemDateHint` als Datenquelle.
- **Filter:** Module nutzen `useItemTags` für die verfügbare Tag-Aggregation und übergeben das an die `FilterBar` (Phase 3).

## Nicht-Ziele

- Visuelle Spezifikation. Diese Spec bindet keine Farben, Spacings oder Hover-States. Polish liegt in der UI-Schicht.
- Modul-spezifische Komponenten. `KanbanBoard`, `CalendarView`, `MapAdapter` (siehe [map.md](map.md)) bleiben in ihrem Modul.
- App-Shell-Flächen. `ProfileDialog`, `WorkspaceSwitcher`, `Navbar` sind in [01-app-composition.md](../01-app-composition.md) spezifiziert, nicht hier.
- Backend-Verträge. Diese Spec definiert UI-Composition, nicht den DataInterface-Vertrag (siehe [02-data-interface.md](../02-data-interface.md)).
