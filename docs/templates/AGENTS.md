# AGENTS.md — building an app on Real Life Stack

This file is a template. Copy it into the root of a new app repository (or hand it to your coding agent) when building an app **on top of** the published Real Life Stack packages. It is not about contributing to the stack itself — for that, read the [repository AGENTS.md](https://github.com/real-life-org/real-life-stack/blob/master/AGENTS.md).

Machine-readable overview of the whole stack: <https://github.com/real-life-org/real-life-stack/blob/master/llms.txt>

## What Real Life Stack is

A modular, backend-agnostic app and UI toolkit for community apps: maps of people/places/projects, calendars, kanban boards, feeds, profiles, and relation graphs.

```text
App Shell / Space Modules -> hooks -> DataInterface -> connector -> data source
```

The app never talks to a backend directly. It renders toolkit components and calls hooks; those read from a `DataInterface`; a **connector** implements that interface against a concrete data source. Swapping the connector swaps the backend without touching the UI.

Status: packages are `0.x` — the API is usable but still moving. Pin exact versions.

## Install

```bash
npm install react react-dom
npm install --save-exact @real-life-stack/data-interface @real-life-stack/toolkit @real-life-stack/mock-connector
# for the map module:
npm install maplibre-gl
```

Pick one connector:

| Connector | Package | Use when |
|---|---|---|
| Mock | `@real-life-stack/mock-connector` | Prototyping, demos, seed data in memory. Start here. |
| Local | `@real-life-stack/local-connector` | Offline-first, single device, persistent. |
| Supabase | `@real-life-stack/supabase-connector` | Central backend on Supabase (auth, rows, realtime). |
| Web of Trust | `@real-life-stack/wot-connector` | Decentralized, end-to-end encrypted groups, DID identity. |

The UI code is identical for all of them. Build against the mock connector first; switch later.

## Bootstrap (real, working pattern)

```tsx
// main.tsx
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { MockConnector, type MockConnectorSeed } from "@real-life-stack/mock-connector"
import App from "./App"
import "@real-life-stack/toolkit/styles/globals.css"
import "maplibre-gl/dist/maplibre-gl.css" // only if you use the map module

async function bootstrap() {
  const seed: MockConnectorSeed = {
    items: [],
    groups: [
      { id: "my-community", name: "My Community", data: { scope: "group", primaryColor: "#2a78d6", modules: ["map", "calendar"] } },
    ],
    users: [{ id: "did:example:local-user", displayName: "Me" }],
    groupMembers: { "my-community": ["did:example:local-user"] },
    groupItems: { "my-community": [] },
  }
  const connector = new MockConnector(seed)
  await connector.init()
  connector.setCurrentGroup("my-community")
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App connector={connector} />
    </StrictMode>,
  )
}

void bootstrap()
```

```tsx
// App.tsx (minimal shape)
import type { DataInterface } from "@real-life-stack/data-interface"
import {
  AppShell, AppShellMain, ConnectorProvider, Navbar, WorkspaceSwitcher,
  MapView, CalendarView, KanbanBoard, CollectionView,
  useItems, useCurrentGroup,
} from "@real-life-stack/toolkit"
import { MapLibreMapAdapter } from "@real-life-stack/toolkit/maplibre"

export default function App({ connector }: { connector: DataInterface }) {
  return (
    <ConnectorProvider connector={connector}>
      <AppShell>
        <Navbar>{/* WorkspaceSwitcher, UserMenu, ... */}</Navbar>
        <AppShellMain>{/* one or more module views */}</AppShellMain>
      </AppShell>
    </ConnectorProvider>
  )
}
```

For a complete wiring of all modules (map + calendar + kanban + graph + feed + notifications), read the [network app](https://github.com/real-life-org/real-life-stack/tree/master/apps/network) and the [reference app](https://github.com/real-life-org/real-life-stack/tree/master/apps/reference).

## Data model (read this before inventing your own)

Everything is an **Item**: a person, place, project, event, task, post, offer. Items have `id`, `type`, `data` (schema-composed fields), and live in **Groups** (called Spaces in the UI — visibility and collaboration contexts). **Relations** connect items (typed predicates, some symmetric). **Users** are identities; in the WoT connector they are DIDs.

- Do not design a parallel data model. Express your domain as item types + fields + relations. Vocabulary and schema composition: [spec 06](https://github.com/real-life-org/real-life-stack/blob/master/docs/spec/06-schema-composition.md).
- Read items via hooks (`useItems` with an `ItemFilter`), never by reaching into the connector's internals.
- Writes go through the writer/capability interfaces, not through custom fetch calls.
- `Group.data` updates are merge patches: `null` deletes a key. App-specific fields ride along in the designated app data field.

## Capabilities, not assumptions

Connectors differ. Feature-detect instead of hardcoding:

```ts
import { isWritable, hasGroups, isAuthenticatable } from "@real-life-stack/data-interface"
if (isWritable(connector)) { /* show create/edit UI */ }
```

If a capability is absent, hide the affordance. Never assume auth, writes, groups, relations, activity logs, or notifications exist.

## UI rules (these keep apps consistent and migratable)

1. **Cards always come from `ItemPreview`.** Never hand-roll an item card; hand-rolled lists drift from the design system and break type-driven rendering.
2. **One dialog family.** Use the toolkit's detail/composer/confirm components (`ItemDetailPanel`, `ItemComposer`, `DeleteConfirmDialog`). One component per meaning; variants via props/capabilities, never app-side forks.
3. **Cross-cutting UX belongs to the toolkit, not the app.** If you need a behavior every app would need (empty states, loading, error boundaries, permission hints), check the toolkit first; if it is missing, that is an upstream issue, not an app-local workaround.
4. **Type-driven rendering.** The item `type` decides how it renders. Register/extend type presentation instead of `if (item.type === ...)` chains in views.
5. Styling: import `@real-life-stack/toolkit/styles/globals.css` once; use the exported `cn` helper and design tokens; do not restyle toolkit internals.

## Source of truth

- Types in `@real-life-stack/data-interface` are the precise contract (English).
- Normative spec (German): [spec index](https://github.com/real-life-org/real-life-stack/blob/master/docs/spec/README.md). When this file and the spec disagree, the spec wins.
- Glossary: [glossary.md](https://github.com/real-life-org/real-life-stack/blob/master/docs/spec/glossary.md).

## For agents specifically

- Keep changes small and reviewable; prefer the composition pattern above over clever abstractions.
- Do not fork or vendor toolkit components to change their behavior — file an issue upstream instead.
- Do not write secrets into code, docs, or prompts.
- If something in the stack blocks you (missing export, missing capability, unclear spec), say so explicitly in your handoff instead of working around it silently. These reports are how the stack becomes better for the next app.
