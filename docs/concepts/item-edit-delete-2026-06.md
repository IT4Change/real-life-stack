# Item-Detail: Bearbeiten & Löschen (Juni 2026)

**Status:** Vorschlag (2026-06-23)
**Scope:** Phase 1 = generisches Bearbeiten/Löschen von Items in **allen** Modulen. Phase 2 = typ-bewusste Detail-Sektionen (hier skizziert, nicht Teil von Phase 1).
**Bezug:** [../spec/modules/shared-components.md](../spec/modules/shared-components.md) (normativ: `ContentComposer`, `ItemDetailPanel`, `useItemEditor`, `ModulePanel`), [../modules/item-detail.md](../modules/item-detail.md) (Detail-Sektionen), [./unified-module-ux-2026-06.md](./unified-module-ux-2026-06.md).

## 1. Ausgangslage

Die gesamte Infrastruktur für Bearbeiten/Löschen existiert bereits — sie ist nur in **einem** Modul verdrahtet:

- **Geteilte Bausteine (toolkit):** `ItemDetailPanel` (Skeleton: Top-Slot + Kommentare), `ItemPreview` (Card + Adornment-Slots), `ContentComposer` (Widget-System, Edit-Modus via `editMode ?? !!onDelete`), `useItemEditor` (voller CRUD-Lifecycle inkl. `remove()`), `ModulePanel` (eine Instanz, Content-Swap, überlebt Modulwechsel).
- **Datenschicht:** `ItemWriter` (`createItem`/`updateItem`/`deleteItem`), Capability-Guard `isWritable(connector)`. Mock/Local/WoT implementieren CRUD vollständig.
- **Lücke:** Edit/Delete hängt nur im **Kanban** (`TaskEditPanel` → `ContentComposer` im Edit-Modus + `useItemEditor.remove`). Feed/Kalender/Karte öffnen nur das **read-only** `ItemPreview`. Jedes Modul dupliziert zudem `openDetail` + den `ItemEditorMapper` + die Autor-Auflösung.

Ziel von Phase 1: Edit/Delete in allen vier Modulen, ohne diese Duplikation zu verfestigen.

## 2. Leitidee: typ-getrieben statt modul-getrieben

Heute hängen Detail-Komposition und der Composer-Mapper am **Modul**. Das skaliert nicht (jeder neue Item-Typ × jedes Modul = neuer Mapper). Das Vorbild **Utopia Map** löst das über den *ItemType*: ein Typ definiert per `template` + Feature-Flags, was Detail und Formular zeigen — ein Backend-Modell, verschiedene UI je Typ, keine Duplikation.

→ Ein **Item-Typ-Registry** wird die Single Source of Truth. Es baut auf bestehenden Ansätzen auf (`ItemTypeBadge`-Registry, `deriveContext(type, data)`, `resolveDefaultModule`) und hält pro Typ:

| Feld | Zweck | Status |
|---|---|---|
| `icon`, `label` | Badge/Anzeige | existiert (ItemTypeBadge-Registry) |
| `defaultModule` | Modul-loser Deep-Link | existiert (`resolveDefaultModule`) |
| `composerWidgets` + `mapper` | Create **und** Edit | heute pro Modul → wird typ-gekeyt |
| `detailSections` | typ-bewusste Detailansicht | **Phase 2** |

Module rufen dann nur noch einen geteilten Detail-Host auf; die Registry liefert Widgets, Mapper und (später) Sektionen.

## 3. Architektur (Phase 1)

### 3.1 Geteilter Detail-Host

Ein toolkit-Baustein `ItemDetailView` (Arbeitstitel) ersetzt die per-Modul-`openDetail`-Duplikate. Er rendert in den `ItemDetailPanel`-Top-Slot:

- **Read-Modus:** das `ItemPreview` (wie heute) + ein **Aktionsmenü** im Header.
- **Edit-Modus:** den `ContentComposer` (`editMode`), Widgets + Mapper aus der Typ-Registry.

Module öffnen ihn weiterhin über `useModulePanel().open({ kind: "detail", itemId, content: <ItemDetailView itemId/> })`. Read↔Edit ist ein interner Zustand des Hosts (kein neues Panel, kein Routing).

> Die `openDetail`-Konsolidierung (alle Module auf den Host umstellen) kann inkrementell laufen: Kanban hat das Muster schon, Feed/Kalender/Karte ziehen nach.

### 3.2 Aktionsmenü (⋮)

Im Detail-Header ein `MoreVertical`-Dropdown (Muster aus Prototype `MessageBubble` + Utopia `EditMenu`):

- **Bearbeiten** — nur wenn `canEdit` (s. 3.3) → schaltet den Host in den Edit-Modus.
- **Löschen** — nur wenn `canDelete` → Bestätigungsdialog (s. 3.4).
- **Teilen** — Deep-Link auf das Item (`/{scope}/{module}/{itemId}`, existiert seit Routing-Redesign); immer verfügbar.

Aktionen, die der Nutzer nicht darf, werden **ausgeblendet** (nicht disabled). Hat ein Item keine erlaubte Aktion, entfällt das Menü.

### 3.3 Berechtigungsmodell — **connector-bestimmt**

Wer editieren/löschen darf, folgt dem Backend, nicht einer App-Regel:

- **WoT:** eingeschränkt (z.B. Creator-eigen, gemäß Membership-/Trust-Modell).
- **GraphQL (Supabase/Directus):** volle RBAC — der Server kennt die Rechte (RLS-Policies / Rollen) und liefert sie i.d.R. pro Item mit.

Umsetzung über eine optionale Capability + einen toolkit-Hook:

```ts
// data-interface — neue optionale Capability
interface ItemPermissionsCapable {
  canEditItem(item: Item): boolean
  canDeleteItem(item: Item): boolean
}
export function hasItemPermissions(c: DataInterface): c is DataInterface & ItemPermissionsCapable
```

```ts
// toolkit — useItemPermissions(item) → { canEdit, canDelete }
//  1. !isWritable(connector)            → { false, false }   (Connector kann gar nicht schreiben)
//  2. hasItemPermissions(connector)     → connector.canEditItem/canDeleteItem  (Backend-Wahrheit)
//  3. Default (creator-owns)            → item.createdBy === currentUser?.id
```

- **BaseConnector** liefert den Default `creator-owns`; Connectors mit Backend-Wissen überschreiben (`canEditItem` liest z.B. die vom GraphQL-Server gelieferten Permission-Flags). So bekommt jeder Connector ein sinnvolles Verhalten, ohne dass die App eine Regel hardcodet.
- **Durchsetzung** liegt beim Connector/Backend (Server-Policy bei GraphQL, Client-Regel bei WoT). Das UI-Gating ist nur UX (verstecke, was nicht geht) — keine Sicherheitsgrenze.

### 3.4 Bearbeiten (im Panel)

- Aktionsmenü → „Bearbeiten" schaltet den Host-Top-Slot von `ItemPreview` auf `ContentComposer` (`editMode`), vorbefüllt aus `item.data`/`item.tags`/`item.relations`, Widgets + Mapper aus der Typ-Registry.
- Speichern: `useItemEditor.submit(submission, { existingItem: item })` → `connector.updateItem`. Bei Erfolg zurück in den Read-Modus (Panel bleibt offen).
- Abbrechen: zurück in den Read-Modus, keine Änderung.
- Konsistent mit Kanban heute; **kein** Fullscreen-Morph (das bleibt dem Feed-*Create*-Flow vorbehalten).

### 3.5 Löschen

- Aktionsmenü → „Löschen" öffnet einen Bestätigungsdialog (Item-Titel, „kann nicht rückgängig gemacht werden", Abbrechen/Löschen-rot) — Muster aus Utopia `DeleteModal`.
- Bestätigt: `useItemEditor.remove(item.id)` → `connector.deleteItem(id)`. **Hard- vs. Soft-Delete entscheidet der Connector** (WoT hard; ein Directus/Supabase-Connector kann `status: "archived"` setzen). Die App ruft nur `deleteItem`.
- Erfolg: Toast, Panel schließt, Item verschwindet reaktiv aus der Liste/Karte/Kalender (Observables).

## 4. Wiederverwendung vs. Neu

| Baustein | Status |
|---|---|
| `ItemDetailPanel`, `ItemPreview`, `ContentComposer`, `useItemEditor`, `ModulePanel` | ✅ wiederverwenden |
| `ItemWriter` / `isWritable` / Mock-Local-WoT-CRUD | ✅ vorhanden |
| Kanban `TaskEditPanel`-Muster (Composer im Edit-Modus) | ✅ Vorlage zum Heben |
| `ItemDetailView`-Host (Read↔Edit + Aktionsmenü) | 🆕 toolkit |
| Aktionsmenü (⋮) + Delete-Confirm-Dialog | 🆕 toolkit |
| `ItemPermissionsCapable` + `hasItemPermissions` + `useItemPermissions` | 🆕 data-interface + toolkit |
| Typ-Registry (Widgets + Mapper typ-gekeyt) | 🆕 (baut auf Badge-Registry/`deriveContext`) |

## 5. Phase-1 PR-Schnitt

1. **Berechtigungs-Capability:** `ItemPermissionsCapable` + `hasItemPermissions` + BaseConnector-Default (creator-owns) + `useItemPermissions(item)`-Hook. (Klein, isoliert, testbar.)
2. **Geteilter Detail-Host + Aktionsmenü + Delete-Confirm:** `ItemDetailView` (Read + ⋮ + Edit-Toggle) + Delete-Dialog im toolkit. Kanban als erstes Modul darauf umstellen (es hat das Muster schon → Regressions-Referenz).
3. **Feed / Kalender / Karte** auf den Host umstellen (Edit/Delete dort neu verfügbar) + Typ-gekeyte Composer-Configs (Mapper aus den heutigen per-Modul-Mappern in die Registry heben).

(Schnitt nach Antons PR-Granularität: wenige kohärente PRs. 2 und 3 ggf. zusammen, wenn der Host sonst ohne Konsumenten steht.)

## 6. Phase 2 — Detail-Sektionen (Skizze, nicht Teil von Phase 1)

Read-Modus wird typ-bewusst reicher: eine `detailSections`-Registry pro Typ (Utopia-Flag-Stil) mit u.a.

- Medien-Galerie (Lightbox), Beschreibung/Markdown,
- Event-Funktionen (Start/Ende, Teilnehmerliste),
- Ort-Details,
- **Relationen** (heute nirgends sichtbar — `item.relations` darstellen + ggf. verknüpfen/lösen),
- Reaktionen (vorhanden), Kommentare (vorhanden), Mitglieder.

Layout (Bottom-Sheet mobil / Sidebar Desktop) liegt schon im `AdaptivePanel`/`ModulePanel`. Tab-/Section-Navigation analog Prototype `ProfileView` bzw. Utopia `TabsView`.

## 7. Nicht-Ziele / Offene Punkte

- **Keine** neue Edit-Route/-Page (Edit bleibt im Panel — Antons Entscheidung).
- **Keine** App-seitige Permission-Regel (folgt dem Connector — Antons Entscheidung).
- Soft-Delete/Archiv ist Connector-Sache, kein UI-Konzept in Phase 1.
- Offen: Reihenfolge der Felder im Edit-Composer pro Typ (heute `WIDGET_ORDER`); ob die Typ-Registry in `data-interface` (geteilt) oder `toolkit` (UI-nah) lebt — Tendenz toolkit, da UI-Konfiguration.
