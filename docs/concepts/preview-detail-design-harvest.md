# Preview-Card & Detail-Ansicht: Design-Harvest aus dem Prototyp

**Status:** Design-Harvest (kein Spec-Dokument)
**Bezug:** [unified-module-ux-2026-06.md](./unified-module-ux-2026-06.md) (Phase 2 = `ItemPreview`), [../spec/modules/shared-components.md](../spec/modules/shared-components.md)
**Quellen:** `apps/prototype/src` (Sebastians Prototyp) vs. heutiger RLS-Stand (`packages/toolkit/src`, `apps/reference/src`)

Dieses Dokument sammelt die Preview-Card- und Detail-Muster aus dem Prototyp und gleicht sie mit dem heutigen RLS-Stand ab. Es trifft keine Entscheidungen, es bereitet sie vor. Jede Aussage ist mit Datei/Komponente belegt.

Hinweis zum Geltungsbereich: Utopia Map liegt nicht in diesem Repo und wurde nicht gelesen. Der Vergleich beschränkt sich auf Prototyp und RLS.

Hinweis zum Phasen-Bezug: `unified-module-ux-2026-06.md` führt Phase 1-3 als „abgeschlossen, einzelne Folge-Items als Backlog. Die Vorschläge in §2 zielen auf den in `shared-components.md` Z. 479 verankerten Phase-2-Baustein `ItemPreview` (plus das geteilte `ItemDetailPanel`) und gehören in den dort genannten Polish-Backlog, nicht in eine neue Pflicht-Phase.

## Stand heute (RLS)

- **Preview:** `packages/toolkit/src/components/preview/item-preview.tsx` rendert die generische Card (Author-Row, Titel, Description, Tags) mit drei Adornment-Slots (`headerAdornment`, `metaAdornment`, `footerAdornment`) und einer `density`-Variante (`comfortable` / `compact`). Adornments heute: `ItemTypeBadge` (`item-type-badge.tsx`), `ItemMetaRow` (`item-meta-row.tsx`), `ItemCommentCount` (`item-comment-count.tsx`), `ReactionBar` (`components/reactions/reaction-bar.tsx`).
- **Detail:** `packages/toolkit/src/components/detail/item-detail-panel.tsx` ist ein bewusst dünnes Skelett: scrollbarer Bereich mit Caller-Top-Slot (`children`), darunter `CommentSection`, unten ein gepinnter `CommentInput`. Es entscheidet ausdrücklich nicht, wie es gerahmt wird (Modal, Drawer, Route bleiben Caller-Sache, siehe Datei-Header Z. 19-21).
- **Wiring:** `apps/reference/src/views/feed-view.tsx` zeigt das Zusammenspiel: in der Liste eine klickbare `ItemPreview`; im Detail rendert derselbe `ItemPreview` (read-only, mit `ReactionBar` im Footer) als Top-Slot von `ItemDetailPanel`, gerahmt über `useModulePanel().open({ kind: "detail", ... })`.

## 1. Was der Prototyp anders/besser macht

### 1.1 Preview-Card (`shared/PostCard.tsx`)

- **Cover-Image als Card-Top.** `PostCard.tsx` Z. 60-65 rendert bei `post.media[0].type === 'image'` ein 48er-Höhen-Cover (`h-48`) mit Gradient-Overlay über die volle Card-Breite. `ItemPreview` hat heute keinen Media-/Cover-Slot; Bilder erscheinen in der RLS-Card gar nicht.
- **Typ-Pill oben rechts, farbcodiert.** `PostCard.tsx` Z. 41-52 (`getPostTypePill`) setzt eine absolut positionierte Pille (Event = blau, Projekt = grün, Angebot = gelb) über das Cover. RLS hat das funktionale Äquivalent als `ItemTypeBadge` (`item-type-badge.tsx` Z. 35-56, gleiche Typ→Farbe-Idee), platziert es aber inline in der Author-/Header-Row statt als Overlay auf einem Cover.
- **Klickbare Meta-Zeilen, die die View wechseln.** `PostCard.tsx` Z. 76-99: Location und Startzeit sind Buttons; ein Klick ruft `onSwitchToMapView(post)` bzw. `onSwitchToCalendarView(post)` und springt ins jeweilige Modul. RLS' `ItemMetaRow` (`item-meta-row.tsx` Z. 36-51) zeigt Datum und Adresse als reine Text-Spans ohne Aktion.
- **Distanz inline an der Location.** `PostCard.tsx` Z. 85 hängt `(115km)` an den Ortsnamen. Der Wert ist im Prototyp hartcodiert, das Muster „Distanz neben dem Ort ist aber relevant. RLS hat dafür heute kein Feld in `ItemMetaRow`.
- **Reactions + Aktionen im Card-Footer.** `PostCard.tsx` Z. 124-176: Footer mit bestehenden Reaktionen (Emoji + Count), Add-Reaction-Button mit `EmojiReactionPicker` (`ui/EmojiReactionPicker.tsx`), Teilen- und Kommentar-Button. RLS hat im Footer-Slot heute `ReactionBar` und `ItemCommentCount`, aber keinen Teilen-Button.
- **Autor-Row unter dem Inhalt.** `PostCard.tsx` Z. 104-122 setzt Avatar + Name + relative Zeit (mit Tooltip auf das absolute Datum) unter Titel und Text. RLS' `ItemPreview` setzt die Author-Row immer nach oben (Z. 148-166) und zeigt die relative Zeit ohne Tooltip-Detail.

### 1.2 Detail-Ansicht (`profile/ProfileView.tsx`)

Im Prototyp ist die Detail-Fläche für Posts/Events/Profile dieselbe Komponente `ProfileView.tsx`. Sie ist deutlich reicher als das RLS-Skelett:

- **Drei Display-Modes in einer Komponente.** `ProfileView.tsx` Z. 166-172, 483-557: `overlay` (zentrales Dialog, `Z. 484-516`), `sidebar` (von rechts einfahrendes Panel, Z. 537-553), `draggable` (Bottom-Sheet auf Mobile, Z. 518-535). Umschaltbar zur Laufzeit über den Header-Button (`ProfileHeader.tsx` Z. 96-104, `getSwitchIcon`/`getSwitchTooltip`). RLS überlässt das Rahmen-Thema komplett dem Caller (`item-detail-panel.tsx` Z. 19-21) und hat heute genau eine Rahmung über `ModulePanel`/`AdaptivePanel`.
- **Bottom-Sheet mit Snap-Punkten.** `ProfileView.tsx` Z. 184-235 (`getStateYPosition`, `panelVariants`, `snapToState`) plus `useDrag` (Z. 299-368) implementieren drei Snap-Zustände (`small` 30%, `medium` 65%, `maximized` 100%) und Drag-to-close ab 80%. Das ist das Mobile-Detail-Muster, das RLS heute nicht im geteilten Baustein hat.
- **Scroll-getriebener kollabierender Banner.** `ProfileView.tsx` Z. 382-388 blendet via `useMotionValueEvent(scrollY)` den Banner aus, sobald über 10px gescrollt wird; `ProfileHeader.tsx` Z. 116-134 animiert die Banner-Höhe und schiebt den Avatar nach (Z. 153-167). RLS-Detail hat keinen Banner/Header-Bereich.
- **Sektion-Navigation (Tabs oder Dots).** `ProfileView.tsx` Z. 85-98 + `componentsConfig` Z. 427-456: das Detail ist aus konfigurierbaren Sektionen zusammengesetzt (Text, Galerie, Event, Crowdfunding, Mitglieder, …), die nur bei vorhandenen Daten rendern (`activeComponents`-Filter Z. 440-456), navigierbar per `ProfileNavTabs` oder `ProfileNavDots`. RLS-Detail kennt nur einen Top-Slot plus Comments.
- **Gepinnte Bottom-Bar mit Reaction/Comment-Toggle.** `ProfileBottomBar.tsx` Z. 81-213: eine Leiste, die zwischen Reaktions-Modus (Emoji-Chips + Add via `EmojiReactionPicker`) und Kommentar-Modus (auto-resize Textarea, Z. 21-28, Senden via Enter, Z. 59-69) morpht. RLS hat einen gepinnten `CommentInput` (`item-detail-panel.tsx` Z. 88-92), aber ohne Reaction-Einstieg in derselben Leiste.
- **Typ-abhängige Primär-Aktion (CTA).** `ProfileHeader.tsx` Z. 12-21: pro Typ ein anderer CTA (`person`→„Verbinden, `event`→„Teilnehmen, `offer`→„Chat, `quest`→„Annehmen, `project`→„Mitmachen) plus Navigation- und Teilen-Menü (Z. 179-200). RLS-Detail hat keinen Aktions-Header.

## 2. Vorschlag für `ItemPreview` / `ItemDetailPanel`

Ziel: die starken Prototyp-Muster in die geteilten Bausteine heben, ohne deren Slot-Architektur zu brechen. Alle Vorschläge sind additiv zu `shared-components.md` und gehören in den Sebastian-Polish-Backlog aus `unified-module-ux-2026-06.md`.

### 2.1 `ItemPreview`

- **Media-/Cover-Slot ergänzen.** Neuer optionaler Slot `coverAdornment` (oder `media?: ReactNode`) oberhalb der Author-Row, damit Feed-Cards das Bild aus `data.media` zeigen können (Prototyp `PostCard.tsx` Z. 60-65). Hält den Rest der Card-Logik unverändert; rendert nichts, wenn leer (gleiche Konvention wie die bestehenden Adornments).
- **`ItemTypeBadge` als Cover-Overlay zulassen.** Wenn ein Cover gesetzt ist, kann der `headerAdornment`/Badge optional über das Cover gelegt werden (Prototyp-Look, `PostCard.tsx` Z. 67). Verhalten ohne Cover bleibt wie heute (Badge inline in der Header-Row).
- **`ItemMetaRow` klickbar machen.** Optionale `onSelectDate` / `onSelectPlace`-Callbacks an `ItemMetaRow` (`item-meta-row.tsx` Z. 23-26), damit Datum→Calendar und Ort→Map springen können (Prototyp `PostCard.tsx` Z. 76-99). Ohne Callback bleibt es der heutige reine Text-Span.
- **Distanz-Feld in `ItemMetaRow`.** Optionaler `distance?: string`, der wie im Prototyp hinter dem Ort steht (`PostCard.tsx` Z. 85). Distanz-Berechnung bleibt Caller-Sache; die Card rendert nur den fertigen String.

### 2.2 `ItemDetailPanel`

- **Optionalen Header-Slot ergänzen.** Neuer `header?: ReactNode` oberhalb des Scroll-Bereichs für Titel/CTA/Teilen (Prototyp `ProfileHeader.tsx` Z. 150-205). Bleibt optional, damit der heutige Kanban-Edit-Fall (`item-detail-panel.tsx` Datei-Header Z. 15-17) unverändert weiterläuft.
- **Reaction-Einstieg in die Bottom-Leiste.** Die gepinnte Input-Zeile (`item-detail-panel.tsx` Z. 88-92) um einen optionalen Reaction-Trigger erweitern, analog zum Reaction/Comment-Morph aus `ProfileBottomBar.tsx` Z. 81-213. Konkret: ein optionaler `bottomBarLeading?: ReactNode`, in den der Caller eine `ReactionBar` (`components/reactions/reaction-bar.tsx`, Signatur `{ itemId }`) hängt.
- **Sektion-Struktur als Komposition, nicht als API.** Die reichen Profil-Sektionen (`ProfileView.tsx` Z. 427-456) NICHT in `ItemDetailPanel` einbauen. Stattdessen bleiben sie Caller-Komposition im Top-Slot (`children`), genau wie heute der Feed seinen read-only `ItemPreview` und Kanban seinen `ContentComposer` reinrendert (`feed-view.tsx` Z. 88-105). So bleibt das Skelett dünn und das Versprechen aus `shared-components.md` Z. 6-8 („definiert nicht das visuelle Aussehen) gewahrt.
- **Rahmung weiter dem Caller überlassen.** Die drei Display-Modes des Prototyps (`overlay`/`sidebar`/`draggable`, `ProfileView.tsx` Z. 483-557) gehören in die Rahmen-Schicht (`ModulePanel`/`AdaptivePanel`), nicht in `ItemDetailPanel`. Hier ist nur zu prüfen, ob `AdaptivePanel` das Bottom-Sheet-mit-Snap-Verhalten aus `ProfileView.tsx` Z. 184-368 schon abdeckt; falls nicht, ist das ein separates Panel-Ticket, kein Detail-Panel-Ticket.

## 3. Offene visuelle Entscheidungen für Anton

1. **Cover-Bild in der Feed-Card: ja/nein und wo?** Voll-Cover oben wie im Prototyp (`PostCard.tsx` Z. 60-65) oder dezenter Thumbnail in der Meta-Row? Betrifft `ItemPreview`-Card-Höhe und damit die Feed-Dichte.
2. **Typ-Badge als Cover-Overlay oder inline?** Overlay (Prototyp `PostCard.tsx` Z. 67) vs. inline in der Header-Row (heute `feed-view.tsx` Z. 98). Beides nur sinnvoll, wenn (1) entschieden ist.
3. **Autor-Row oben oder unten?** Prototyp setzt Autor unter den Inhalt (`PostCard.tsx` Z. 104-122), RLS setzt ihn oben (`item-preview.tsx` Z. 148-166). Eine Konvention für alle Module festlegen.
4. **Klickbare Meta-Zeilen: erwünscht?** Datum→Calendar / Ort→Map als Sprung (Prototyp `PostCard.tsx` Z. 76-99) vs. reiner Anzeige-Text (heute). UX-Frage, ob der Card-Klick (Detail öffnen) und der Meta-Klick (Modulwechsel) nebeneinander verständlich sind.
5. **Distanz-Anzeige: Format und Quelle.** Ob `(115km)` hinter dem Ort erscheint (Prototyp `PostCard.tsx` Z. 85) und in welchem Format. Hängt an einer realen Distanz-Quelle, die es heute nicht gibt.
6. **Detail-CTA pro Typ: Wording und Umfang.** Übernehmen wir die Typ→Aktion-Map aus `ProfileHeader.tsx` Z. 12-18 (Verbinden/Teilnehmen/Chat/Annehmen/Mitmachen) und gehört ein Teilen-Menü (Z. 188-200) ins geteilte Detail?
7. **Mobile-Detail: Bottom-Sheet mit Snap-Punkten?** Übernehmen wir die drei Snap-Zustände + Drag-to-close aus `ProfileView.tsx` Z. 184-368 als Standard-Mobile-Rahmung, oder bleibt es beim heutigen Drawer? Entscheidung gehört in die Panel-/AdaptivePanel-Schicht, nicht in `ItemDetailPanel`.
8. **Reaction-Einstieg im Detail: in der Bottom-Bar oder am Card-Top?** Morph-Leiste wie `ProfileBottomBar.tsx` Z. 81-213 vs. `ReactionBar` im Top-Slot-Footer (heute `feed-view.tsx` Z. 100-102).
