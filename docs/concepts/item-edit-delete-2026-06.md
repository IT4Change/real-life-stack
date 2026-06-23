# Item-Detail: Bearbeiten & Löschen (Juni 2026)

**Status:** Vorschlag (2026-06-23)
**Scope:** Phase 1 = generisches Bearbeiten/Löschen von Items in **allen** Modulen. Phase 2 = typ-bewusste Detail-Sektionen (hier skizziert, nicht Teil von Phase 1).
**Bezug:** [../spec/03-capabilities.md](../spec/03-capabilities.md) (Capability-Katalog — hier landet `AuthorizationCapable`), [../spec/modules/shared-components.md](../spec/modules/shared-components.md) (normativ: `ContentComposer`, `ItemDetailPanel`, `useItemEditor`, `ModulePanel`), [../modules/item-detail.md](../modules/item-detail.md) (Detail-Sektionen), [./unified-module-ux-2026-06.md](./unified-module-ux-2026-06.md).

Die normativen Teile (Capability, geteilte Komponenten) werden **inline** in den o.g. Spec-Docs verankert (kein ADR), mit den jeweiligen Implementierungs-PRs.

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

### 3.3 Berechtigungsmodell — **Capability über Resource** (connector-bestimmt)

Wer was darf, folgt dem Backend, nicht einer App-Regel. WoT und GraphQL teilen dasselbe Grundmodell, nur anders aufgelöst:

- **WoT / UCAN:** capability-basiert, lokal + kryptografisch — der Holder prüft seine UCAN-Kette (Delegation, Attenuation), kein Server nötig.
- **Directus / Supabase:** serverseitig — RBAC + RLS-Policies; per-Row-Permissions kommen i.d.R. mit den Daten mit.

Beides ist dieselbe Frage: **„darf der Actor `ability` auf `resource`"** — exakt die UCAN-Form `{ can, with }`. Permissions hängen damit **nicht „am Item", sondern an der Resource, auf die die Aktion zielt:**

| Aktion | Resource | Ability |
|---|---|---|
| Erstellen | Space (+ Typ) | `item/create` |
| Bearbeiten | das Item | `item/edit` |
| Löschen | das Item | `item/delete` |

Interface (UCAN-nah, RLS-mappbar):

```ts
// data-interface — optionale Capability
type Ability = "item/create" | "item/edit" | "item/delete"   // erweiterbar (UCAN-Strings)
interface AuthorizationCapable {
  can(ability: Ability, resource: Item | { space: string }): boolean   // sync
}
export function hasAuthorization(c: DataInterface): c is DataInterface & AuthorizationCapable
```

```ts
// toolkit — ergonomische Hooks darüber
useItemPermissions(item)      // → { canEdit, canDelete }   (can("item/edit"/"item/delete", item))
useCanCreate(spaceId, type?)  // → boolean                   (can("item/create", { space }))
```

- **Auflösung je Connector:** UCAN-Connector matcht die gehaltene Kette (`with` + `can` + Attenuation); Directus/Supabase liest die mit den Daten gelieferten Permission-Flags (bzw. owner-Spalte + Rolle); **BaseConnector-Default** = `creator-owns` (Mock/Local + Fallback). `!isWritable(connector)` ⇒ alles `false`.
- **Sync** (kein Promise) — sonst N Permission-Calls pro Liste. Funktioniert, solange die Permission-Info geladen ist (gehaltene UCANs / per-Row-Flags / owner+Rolle). Bei sehr komplexen RLS-Policies ist das UI-Gate „best effort".
- **Durchsetzung backend-/protokoll-seitig** (Relay/Peer lehnt nicht-autorisierte Writes ab; RLS lehnt ab). UI-Gating ist nur UX, keine Sicherheitsgrenze.
- **Delegation gratis:** „edit für alle Items in Space Y" lässt sich (UCAN) an andere delegieren — die UI fragt nur „darf ich?", *wie* die Capability entstand (Ownership/Rolle/Delegation) ist Connector-Sache.

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
| `AuthorizationCapable` (`can`) + `hasAuthorization` + `useItemPermissions`/`useCanCreate` | 🆕 data-interface + toolkit |
| Typ-Registry (Widgets + Mapper typ-gekeyt) | 🆕 (baut auf Badge-Registry/`deriveContext`) |

## 5. Phase-1 PR-Schnitt

1. **Berechtigungs-Capability:** `AuthorizationCapable` (`can(ability, resource)`) + `hasAuthorization` + BaseConnector-Default (creator-owns) + Hooks `useItemPermissions(item)` / `useCanCreate(space, type)`. Normativer Eintrag inline in `03-capabilities.md`. (Klein, isoliert, testbar.)
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
- **Keine** App-seitige Permission-Regel (folgt dem Connector als Capability — Antons Entscheidung).
- Soft-Delete/Archiv ist Connector-Sache, kein UI-Konzept in Phase 1.
- Offen: **Resource-Adressierung** — wie Items/Spaces als UCAN-`with`-URIs adressiert werden (WoT hat schon Identifier; Schema festzulegen). Reihenfolge der Felder im Edit-Composer pro Typ (heute `WIDGET_ORDER`); ob die Typ-Registry in `data-interface` (geteilt) oder `toolkit` (UI-nah) lebt — Tendenz toolkit, da UI-Konfiguration.
