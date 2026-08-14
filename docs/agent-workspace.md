# Agent Workspace

Dieses Dokument ist der ausführliche, tool-neutrale Arbeitskontext für KI-Agenten und agentenunterstützte Contributor im Real-Life-Stack-Repository.

Kanonischer Einstieg ist [AGENTS.md](../AGENTS.md). Tool-spezifische Dateien wie `CLAUDE.md` oder `.github/copilot-instructions.md` sollen nur auf `AGENTS.md` und dieses Dokument verweisen, damit Regeln nicht auseinanderlaufen.

Der `wot-agent-runner` und RLAP sind ein möglicher, besonders auditierbarer Ausführungsweg. Normale menschliche Beiträge und andere Agenten-Tools bleiben willkommen, solange Scope, Tests, Review und offene Fragen sauber dokumentiert werden.

## Projekt

Real Life Stack (RLS) — ein Monorepo für Community-Apps mit austauschbarem Daten-Backend.

Kernidee: App Shell und Space Modules (Kanban, Kalender, Karte, Feed) arbeiten gegen ein einheitliches `DataInterface`. Verschiedene Connectoren (Mock, Local, GraphQL, WoT/Automerge) implementieren dieses Interface. Die UI weiß nicht, woher die Daten kommen.

## Architektur

```text
apps/reference/          → Showcase-App (alle Module, MockConnector + LocalConnector)
apps/landing/            → Landing Page
packages/toolkit/        → UI-Komponenten (shadcn/ui, Storybook) + Hooks + ConnectorProvider
packages/data-interface/ → TypeScript-Typen, Interfaces, BaseConnector, Shared Helpers
packages/mock-connector/ → In-Memory-Implementierung
packages/local-connector/  → IndexedDB-Implementierung mit Cross-Tab-Sync
packages/graphql-connector/ → GraphQL-Client (graphql-request + graphql-ws)
packages/graphql-server/   → GraphQL-Server (Fastify + Mercurius + Pothos)
```

### Datenfluss

```text
App Shell / Space Module → Hooks → DataInterface (Connector) → Datenquelle
```

- **DataInterface** (`packages/data-interface/`) — das zentrale Interface. Read-only Core + Capability-Interfaces.
- **Connector** — implementiert DataInterface + die Capabilities die er braucht.
- **Hooks** — dünne Schicht, übersetzen Observable → React State und Mutations → Promise. Hooks prüfen Capabilities via Type Guards.
- **UI-Flächen** — reine Darstellung, bekommen Daten via Hooks. Wissen NICHT woher die Daten kommen.

### Item-Modell

Alles sind Items (`{ id, type, data, relations? }`). Der `type` bestimmt das Rendering, die Felder in `data` bestimmen, in welchen Modulen ein Item erscheint:

- `status` → Kanban (Spalten sind konfigurierbar, NICHT hardcoded)
- `start`/`end` → Kalender
- `location` → Karte
- `content` → Feed

Ein Item kann in mehreren Modulen gleichzeitig erscheinen. `title` lebt in `data`, nicht top-level.

## Architektur-Regeln (WICHTIG — IMMER befolgen!)

### Interface Segregation (ISP)

`DataInterface` ist **read-only** (6 Methoden: init, dispose, getItems, getItem, observe, observeItem). Zusätzliche Fähigkeiten über separate Capability-Interfaces:

- **`ItemWriter`** — createItem, updateItem, deleteItem
- **`RelationCapable`** — getRelatedItems, observeRelatedItems
- **`GroupManager`** — alle Gruppen- und Mitglieder-Methoden
- **`Authenticatable`** — Auth, User-Methoden
- **`MultiSource`** — Quellen-Verwaltung
- **`ContactManager`** — Kontakte und Kontaktstatus
- **`MessagingCapable`** — Relay-Status und Outbox-Pending-Count
- **`ConfirmationCapable` / `ConfirmationWriterCapable`** — Confirmations lesen, beobachten und ausstellen
- **`EncounterVerificationCapable`** — QR-/Begegnungsverifikation
- **`ProfileCapable`** — Profil lesen, schreiben und synchronisieren
- **`EventListenerCapable`** — eingehende Connector-Ereignisse
- **`ItemGroupCapable`** — Item-zu-Group-Zuordnung
- **`FullConnector`** — Convenience-Typ für den frühen Kern, nicht "alle heutigen Capabilities"

**Regeln:**
- Ein Connector implementiert NUR die Interfaces die er braucht. Ein CalDAV-Import-Connector implementiert nur `DataInterface` ohne Stub-Methoden.
- Hooks prüfen Capabilities via Type Guards (`isWritable()`, `hasGroups()`, `hasConfirmations()`, `hasProfile()`, etc.) und werfen einen beschreibenden Fehler wenn die Capability fehlt.
- `BaseConnector` implementiert `FullConnector` mit sinnvollen Defaults — ist ein Convenience, keine Pflicht.

### DRY — Keine Duplikation

- **`createObservable()` und `matchesFilter()`** leben in `data-interface/base-connector.ts`. NIEMALS in einzelnen Connectors duplizieren — immer aus `@real-life-stack/data-interface` importieren.
- Wenn ein Helper in mehr als einem Connector gebraucht wird, gehört er in `data-interface`.

### Keine Cross-Dependencies zwischen Connectors

Jeder Connector hängt NUR von `data-interface` + eigenen Libraries ab. Connectors importieren NIEMALS voneinander.

### Demo-Daten

- JSON-Dateien leben in `packages/data-interface/data/`, typisierter Wrapper in `demo-data.ts`
- Import: `import { demoItems, ... } from "@real-life-stack/data-interface/demo-data"` — NICHT über mock-connector re-exportieren.

### Observable Pattern

- `ReactiveObservable<T>` mit `current`, `subscribe(cb)`, `set(value)`, `destroy()`
- Keine externe RxJS-Dependency. Eigenes Pattern via `createObservable<T>(initial)`.
- Filter-Keys nutzen `JSON.stringify(filter)` als Map-Key für Caching.

### UI-Komponenten und Storybook

- **Alle UI-Komponenten gehören ins `toolkit` Package** — NICHT in einzelne Apps. Apps kombinieren nur Toolkit-Komponenten.
- **Storybook pflegen:** Für jede UI-Komponente im Toolkit eine Story anlegen/aktualisieren. Stories dienen als Dokumentation und visuelle Tests.

### Hooks und ConnectorProvider

- Hooks und `ConnectorProvider` leben im `toolkit` Package, NICHT in einzelnen Apps.
- Jede App übergibt ihren Connector via `<ConnectorProvider connector={...}>`.
- Hooks sind dünn: Observable → React State, Mutations → Promise. Kein Caching oder Business-Logik in Hooks.

### Feature-Erkennung

RLS erkennt technische Connector-Fähigkeiten primär über Capability-Interfaces und Type Guards aus `packages/data-interface`.

Feature-Items (`type: "feature"`) können weiterhin als Demo-, Konfigurations- oder UI-Sicht auf verfügbare Funktionen auftauchen. Sie ersetzen aber nicht den TypeScript-Vertrag.

- Connector liefert ein Item mit `id: "capabilities"`, `type: "feature"`, `createdBy: "system"`
- `data` enthält einen verschachtelten Objektbaum: truthy = unterstützt, falsy = nicht unterstützt
- Hooks: `useFeatures()` gibt den ganzen Baum, `useFeature("kanban.dragDrop")` prüft einen Pfad
- UI blendet Features dynamisch ein/aus basierend auf dem Feature-Baum
- **Feature-Items gehören in die Demo-Daten** (`data/items.json`), nicht hardcoded in Connectors
- Normativer Einstieg: `docs/spec/README.md` und `docs/spec/00-architecture.md`

### Relations: Scope-Prefix-System

Relation-Targets nutzen Scope-Prefixe:
- `item:` — selbe Gruppe/Space
- `space:{id}/item:` — Cross-Space-Referenz
- `global:` — User-IDs (DIDs)

### User vs. Profil

- **User** = Identity (nur id + cached displayName/avatarUrl). User ist KEIN Item.
- **Profil** = Item (`type: "profile"`) mit zwei Sichtbarkeitsstufen (public + contacts-only). Profil IST ein Item.

### GraphQL Subscriptions

WebSocket via `graphql-ws` (npm-Paket), NICHT `graphql-sse`. Mercurius nutzt das `graphql-transport-ws` Subprotokoll.

## Packages

### `@real-life-stack/data-interface`

- TypeScript-Typen + Shared Helpers (`createObservable`, `matchesFilter`)
- Exportiert: `DataInterface`, `ItemWriter`, `RelationCapable`, `GroupManager`, `Authenticatable`, `MultiSource`, `ContactManager`, `MessagingCapable`, `ConfirmationCapable`, `ConfirmationWriterCapable`, `EncounterVerificationCapable`, `ProfileCapable`, `EventListenerCapable`, `ItemGroupCapable`, `FullConnector`
- Type Guards: `isWritable()`, `hasRelations()`, `hasGroups()`, `isAuthenticatable()`, `hasMultiSource()`, `hasContacts()`, `hasMessaging()`, `hasConfirmations()`, `hasConfirmationWriter()`, `hasEncounterVerification()`, `hasProfile()`, `hasEventListener()`, `hasItemGroups()`
- `BaseConnector` — abstrakte Basisklasse mit Defaults für alle Capabilities
- Demo-Daten: `@real-life-stack/data-interface/demo-data`
- Ändern nur nach Absprache — das ist der Vertrag zwischen UI und Backend

### `@real-life-stack/mock-connector`

- `MockConnector` implementiert `FullConnector`
- In-Memory, für Entwicklung und Tests

### `@real-life-stack/local-connector`

- `LocalConnector` implementiert `FullConnector`
- IndexedDB-Persistenz via `idb-keyval`
- BroadcastChannel für Cross-Tab-Sync
- Seed-Daten über Constructor

### `@real-life-stack/graphql-connector`

- `GraphQLConnector` implementiert `FullConnector`
- `graphql-request` für Queries/Mutations, `graphql-ws` für Subscriptions
- HTTP-URL wird automatisch zu WS-URL konvertiert

### `@real-life-stack/graphql-server`

- Fastify + Mercurius + Pothos Schema Builder
- Port 4000, GraphiQL Playground, CORS aktiviert

### `@real-life-stack/toolkit`

- UI-Komponenten basierend auf shadcn/ui (Radix + Tailwind)
- Layout: AppShell, Navbar, WorkspaceSwitcher, ModuleTabs, BottomNav, UserMenu
- Content: PostCard, StatCard, ActionCard, SimplePostWidget, KanbanBoard
- Hooks: useItems, useItem, useCreateItem, useUpdateItem, useDeleteItem, useGroups, useMembers, useAuthState, useCurrentUser, useFeatures, useFeature
- ConnectorProvider für React Context
- Storybook für Komponentenentwicklung (`pnpm storybook`)

## Konventionen

- **shadcn/ui Pattern:** Komponenten liegen im Repo, nicht als npm-Dependency
- **Tailwind CSS v4** mit OKLCH-Farben
- **CVA** (class-variance-authority) für Varianten, `cn()` für bedingte Klassen
- **Deutsche Demo-Texte** in der Reference App
- **pnpm** als Package Manager, **Turbo** für Build-Orchestrierung
- **TypeScript strict mode** in allen Packages
- **Type-only Imports** nutzen: `import type { Item } from ...`
- **UI-Änderungen dokumentieren:** `packages/toolkit/docs/UI-REQUIREMENTS.md` aktualisieren
- **PR-Titel als Conventional Commit:** `feat(toolkit): …`, `fix: …`, `feat!: …`.
  Beim Squash-Merge wird der PR-Titel zum Commit-Betreff auf `master`, und
  release-please liest ausschliesslich Conventional Commits. Ein Titel ohne
  Präfix wird **lautlos** übersehen: kein Changelog-Eintrag, keine
  Versionsanhebung, keine Fehlermeldung. Am 06.08.2026 fehlten dadurch sechs
  gemergte PRs im Release. Der Workflow `.github/workflows/pr-title.yml` prüft
  das jetzt; die Commits *innerhalb* eines PRs sind davon unberührt.

## Entwicklung

```bash
pnpm install              # Abhängigkeiten installieren
pnpm dev:reference        # Reference App starten (Vite)
pnpm storybook            # Storybook für Toolkit-Komponenten
pnpm build                # Alles bauen (Turbo)
```

### Connector verwenden

```typescript
import { MockConnector } from "@real-life-stack/mock-connector"
import type { Item, DataInterface } from "@real-life-stack/data-interface"
import { isWritable, hasGroups } from "@real-life-stack/data-interface"

const connector = new MockConnector()
await connector.init()

// Items lesen (DataInterface — jeder Connector kann das)
const tasks = await connector.getItems({ type: "task" })

// Schreiben nur wenn der Connector es kann
if (isWritable(connector)) {
  await connector.createItem({ type: "task", createdBy: "user-1", data: { title: "Neu" } })
}

// Gruppen nur wenn der Connector es kann
if (hasGroups(connector)) {
  const groups = await connector.getGroups()
}
```

## Architektur-Spec

Der normative Einstieg liegt in `docs/spec/README.md`. Der Architekturanker ist `docs/spec/00-architecture.md`. `docs/spec/architektur2.md` bleibt als historische Referenz erhalten und wird schrittweise in kleinere Spec-Slices überführt.

`docs/modules/` ist aktuell frühes Brainstorming und Inspirationsmaterial, keine verbindliche Modul-Spec. Historische Pläne und überholte Architekturstände liegen in `docs/archive/`.

### App Shell und Space Modules

RLS unterscheidet:

- **App Shell** — globaler, space-übergreifender Rahmen: Navigation, Space Switcher, User/Profile, Contacts, Verification, Notifications, Debug/Admin.
- **Space Module** — pro Space aktivierbare Oberfläche: Feed, Map, Calendar, Kanban, Marketplace, Quests, Campaign View.
- **Module Component** — wiederverwendbarer Baustein innerhalb von Modulen: ItemPreview, ItemDetail, Composer, Filter, Comments, Reactions.

Profile, Contacts, Verification und Auth sind App-Shell-Flächen, keine Space Modules. Sie können in Space Modules sichtbar werden, werden aber nicht pro Space als Modul aktiviert.

## Reaktivität & Relations (WICHTIG — vor jedem reaktiven Feature lesen!)

Ausführliche Spezifikation in `docs/spec/reaktivitaet.md`. Die wichtigsten Regeln:

- **Datenfluss:** wot-core (Subscribable) → Connector (Observable) → Hooks (React State) → UI. Keine Schicht überspringen.
- **createdAt ist ein ISO-String** (`"2026-03-17T14:30:00.000Z"`), KEIN Date-Objekt. Bei Bedarf: `new Date(item.createdAt)`.
- **Kommentare/Reaktionen** sind eigene Items mit `commentOn`-Relation, NICHT eingebettet in `data`.
- **Related Items:** `useRelatedItems(postId, "commentOn", { direction: "to" })` in der Kind-Komponente. KEIN manueller Reverse-Lookup, KEIN `_included`.
- **`_included` existiert NICHT MEHR.** Nutze `useRelatedItems` / `observeRelatedItems` stattdessen.
- **Shared Helper:** `findRelatedItems()` aus data-interface nutzen, NICHT eigene Implementierung in Connectors.
- **Anti-Patterns:** Kein Polling, kein direkter wot-core Import in UI, kein forceUpdate, keine eigene Datenhaltung in Hooks.

## Wichtige Dateien

- `docs/spec/README.md` — Spec-Einstieg und Dokumentklassen
- `docs/spec/00-architecture.md` — Architekturanker
- `docs/spec/01-app-composition.md` — App Shell, Current Space, Space Modules und Module Components
- `docs/spec/02-data-interface.md` — read-only Core-Vertrag
- `docs/spec/03-capabilities.md` — optionale Connector-Capabilities und Type Guards
- `docs/spec/04-items-relations-groups-spaces.md` — Items, Relations, Groups/Spaces und RLNP/Game-Projektionen
- `docs/spec/05-confirmations-and-trust.md` — Claims, Confirmations, Attestations und Trust-Level
- `docs/spec/code-and-storybook-mapping.md` — Zuordnung von RLS-Taxonomie zu Toolkit-Code und Storybook
- `docs/spec/modules/README.md` — verbindliche Space-Module-Detail-Specs
- `docs/spec/modules/template.md` — Vorlage für neue Space-Module-Specs
- `docs/spec/architektur2.md` — historische Architektur-Referenz, nicht direkt normativ
- `docs/spec/reaktivitaet.md` — Reaktivität, Relations, Anti-Patterns (PFLICHTLEKTÜRE vor reaktiven Features)
- `docs/modules/README.md` — Einordnung des alten Modul-Brainstormings
- `docs/archive/README.md` — Archivierte, nicht mehr normative Dokumente
- `packages/data-interface/src/index.ts` — Alle Typdefinitionen + Capability-Interfaces
- `packages/data-interface/src/base-connector.ts` — BaseConnector + createObservable + matchesFilter + findRelatedItems
- `packages/data-interface/src/demo-data.ts` — Demo-Daten Wrapper
- `packages/toolkit/src/hooks/connector-context.tsx` — ConnectorProvider + useConnector
- `packages/toolkit/docs/UI-REQUIREMENTS.md` — UI/UX Anforderungen
- `packages/toolkit/src/styles/globals.css` — Theme & CSS-Variablen
- `apps/reference/src/App.tsx` — Reference App: Komposition (Provider, AuthGate, App Shell)
- `apps/reference/src/views/` — Space-Module-Views (feed, kanban, calendar, map) + `module-outlet.tsx` (Dispatch)
- `apps/reference/src/hooks/use-workspace-routing.ts` — Space/Module-Auflösung aus URL (localStorage-Fallback, No-Access-Fall)

<!-- Wegwerf-Zeile fuer den Ruleset-Negativtest, wird nicht gemergt -->
