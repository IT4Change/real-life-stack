# Real Life Stack

**A modular toolkit for local connection**

Local communities need digital tools that foster real-world encounters instead of replacing them. Real Life Stack is a modular toolkit that lets communities deploy their own apps for local networking and adapt them to their needs.

> Tools that enable communities to organize in a decentralized way – self-determined and rooted in real-world encounters.

---

## The Problem

Local initiatives are becoming key actors in tackling social and ecological challenges. Yet:

- **Established platforms** are optimized for attention and reach, not for local collaboration
- **Small initiatives** lack the resources to build their own systems
- **Missing infrastructure** forces communities onto platforms that control their data

## The Solution

Real Life Stack provides a shared technical foundation:

- **Modular UI toolkit** – map, calendar, groups, profiles, feed as reusable components
- **White-label app** – ready to use, customizable without programming skills
- **Backend-agnostic** – connector architecture for REST, local-first, P2P, or E2EE
- **Trust-based identity** – a Web of Trust built through real-world encounters

### The Activation Cycle

```text
Propose → Plan → Act → Build trust → Share successes → ↩
```

Real Life Stack supports the whole cycle: from the idea, to making arrangements, to acting together locally. Real collaboration grows a trust network ([Web of Trust](https://web-of-trust.de)) that strengthens the community over time.

---

## Architecture

```text
┌──────────────────────────────────────────────────────────┐
│                           UI                             │
│   ┌──────────────────────────────────────────────────┐   │
│   │                   App Shell                      │   │
│   └──────────────────────────────────────────────────┘   │
│   ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌──────┐   │
│   │ Kanban │ │Calendar│ │  Map   │ │  Feed  │ │ ...  │   │
│   └────────┘ └────────┘ └────────┘ └────────┘ └──────┘   │
├──────────────────────────────────────────────────────────┤
│                      Hooks (thin)                        │
├──────────────────────────────────────────────────────────┤
│                     DataInterface                        │
├──────────────────────────────────────────────────────────┤
│                      Connectors                          │
│    ┌────────┐ ┌───────────┐ ┌────────────────────────┐   │
│    │  Mock  │ │ GraphQL   │ │   WoT (CRDT+E2EE)      │   │
│    └────────┘ └───────────┘ └────────────────────────┘   │
└──────────────────────────────────────────────────────────┘
```

### App Shell + Space Modules

The **App Shell** is the global frame. **Space Modules** (Kanban, Calendar, Map, Feed, ...) are surfaces that can be enabled per space. Each group chooses which Space Modules it uses. Space Modules do not only check the item type but also which data fields are present (`status` → Kanban, `start`/`end` → Calendar, `location` → Map).

### Hooks + DataInterface

The hooks are a thin layer between UI and connector — they translate observables into React state and mutations into promises. The **DataInterface** defines the read-only core contract: reading items and observing them reactively. Additional abilities such as writing, groups, identity, or relations are detected via capability interfaces (`ItemWriter`, `GroupManager`, `Authenticatable`, ...). UI surfaces only know these interfaces, never the backend.

### Connectors

Each connector implements the DataInterface and only the capabilities its data source supports. The **MockConnector** (in-memory) is used for development, the **LocalConnector** for local IndexedDB persistence with cross-tab sync, the **GraphQL connector** for classic servers, and the **WoT connector** (Yjs/CRDT + E2EE) for decentralized, encrypted collaboration.

---

## RLNP and Real Life Game

Real Life Stack does not own the social or game semantics. It makes them displayable and usable as a backend-agnostic UI and connector layer. The social meaning comes from the [Real Life Network Protocol](https://github.com/real-life-org/real-life-network-protocol), the optional game semantics from the [Real Life Game](https://github.com/real-life-org/real-life-game). Details: [docs/concepts/rlnp-game-integration.md](docs/concepts/rlnp-game-integration.md).

---

## Specification

The normative core of the repository lives in [docs/spec/](docs/spec/) — it is the single source of truth. When spec and implementation conflict, the spec wins. The core documents 00–10 cover architecture, app composition, the DataInterface, capabilities, items/relations/groups/spaces, confirmations and trust, schema composition, tags, relation records, the mirror bridge, and the activity log.

Machine-readable vocabularies (JSON-LD contexts + JSON Schemas) live in [docs/spec/schemas/](docs/spec/schemas/): `base`, `place`, `event`, `task`, `person`, `relation`, `project`, and `resource`.

## Space Modules

Binding Space Module specs live in [docs/spec/modules/](docs/spec/modules/). Their shared building blocks (ItemPreview, FilterBar, CreateFab, ModulePanel, …) are defined in [shared-components.md](docs/spec/modules/shared-components.md) and implemented in the reference app. The older folder [docs/modules/](docs/modules/) contains early brainstorming and serves as inspiration only.

| Space Module | Status | Description |
|-------|--------|--------------|
| [**Feed**](docs/spec/modules/feed.md) | Draft v0.1 + implemented | Activity stream across all Space Modules: what is happening in the community? |
| [**Kanban / Tasks**](docs/spec/modules/kanban.md) | Draft v0.1 + implemented | Organize tasks and workflows within a space |
| [**Calendar**](docs/spec/modules/calendar.md) | Draft v0.1 + implemented | Plan events, coordinate dates, manage invitations |
| [**Map**](docs/spec/modules/map.md) | Draft v0.1 + implemented | Visualize local places, resources, and activities on a map |
| **Marketplace** | planned | Make offers, needs, resources, and possible matches visible |
| **Quests** | planned | Show quest overview, quest log, quest runs, evidence, and completion status |
| **Campaign View** | planned | Display adventures, campaigns, and world state as a game view |

---

## Who Is It For?

- Neighborhood networks and urban gardening groups
- Repair cafés, food-sharing initiatives, community-supported agriculture
- Youth groups and free learning spaces
- Sharing and swapping communities
- Organizations that support local groups

---

## Demos

| Demo | Description |
|------|--------------|
| **[Landing Page](https://real-life-stack.de/)** | Project overview and entry point |
| **[Reference App](https://real-life-stack.de/app/)** | Implementation with all modules |
| **[UI Prototype](https://real-life-stack.de/edge/)** | Experimental UI concepts and components |
| **[Storybook](https://real-life-stack.de/storybook/)** | Component documentation |
| **[Web of Trust](https://web-of-trust.de/demo)** | Demo for decentralized identity, verification, attestations, and sync |

---

## Web of Trust

[Web of Trust](https://web-of-trust.de) is the protocol and reference layer for decentralized identity, contacts, verifications, attestations, and encrypted sync. Real Life Stack can use these abilities via the WoT connector while staying backend-agnostic.

- **Decentralized identities** – experiments with did:key and Ed25519
- **Web of Trust** – QR-code-based verification, JWS signatures
- **Local-first** – Yjs as the default CRDT, Automerge as an alternative CRDT option
- **Modular architecture** – AppShell pattern for different apps

**[Landing page →](https://web-of-trust.de)** | **[Demo →](https://web-of-trust.de/demo)** | **[GitHub →](https://github.com/real-life-org/web-of-trust)**

---

# Developer Documentation

## Monorepo Structure

```text
real-life-stack/
├── packages/
│   ├── data-interface/    # @real-life-stack/data-interface - TypeScript types + capabilities
│   ├── mock-connector/    # @real-life-stack/mock-connector - in-memory implementation
│   ├── local-connector/   # @real-life-stack/local-connector - IndexedDB + cross-tab sync
│   ├── graphql-connector/ # @real-life-stack/graphql-connector - GraphQL client
│   ├── graphql-server/    # @real-life-stack/graphql-server - Fastify/Mercurius server
│   ├── wot-connector/     # @real-life-stack/wot-connector - WoT/Yjs/E2EE
│   └── toolkit/           # @real-life-stack/toolkit - UI components + hooks
├── apps/
│   ├── landing/           # landing page
│   ├── reference/         # reference app (React 19)
│   ├── network/           # network app (relation records, network graph)
│   └── prototype/         # UI prototype (experimental)
└── docs/                  # documentation
    ├── spec/              # normative spec (00–10, modules, schemas)
    ├── modules/           # early module brainstorming, inspiration only
    ├── concepts/          # concept documents
    ├── archive/           # historical, no longer normative documents
    └── funding/           # funding application
```

## Quick Start

```bash
# Install dependencies
pnpm install

# Start the reference app
pnpm dev:reference

# Start the landing page
pnpm dev:landing

# Build the toolkit
pnpm build:toolkit
```

## DataInterface & Connectors

UI surfaces work against the **DataInterface** and optional capability interfaces — TypeScript contracts that abstract data, reactivity, write access, groups, and identity. Connectors implement these interfaces for different backends.

### @real-life-stack/data-interface

Pure TypeScript types and shared helpers (no external runtime dependencies):

```typescript
import type { DataInterface, Item, Group, User, Observable } from "@real-life-stack/data-interface"
```

### @real-life-stack/mock-connector

In-memory implementation with demo data for development without a backend:

```typescript
import { MockConnector } from "@real-life-stack/mock-connector"

const connector = new MockConnector()
await connector.init()

const tasks = await connector.getItems({ type: "task" })  // 5 demo tasks
const groups = await connector.getGroups()                  // 3 demo groups

// Observe reactively
const obs = connector.observe({ type: "task" })
obs.subscribe((tasks) => { /* live updates */ })
```

Spec entry point: [docs/spec/README.md](docs/spec/README.md). Architecture details: [docs/spec/00-architecture.md](docs/spec/00-architecture.md)

## @real-life-stack/toolkit

The toolkit package exports reusable UI components:

```typescript
import { Button, Card, Avatar, Tabs } from '@real-life-stack/toolkit'
```

**[View Storybook →](https://real-life-stack.de/storybook/)**

```bash
# Start Storybook locally
pnpm storybook

# Build Storybook
pnpm build:storybook
```

### Tech Stack

- TypeScript + React 19
- Tailwind CSS v4
- Radix UI Primitives
- CVA (class-variance-authority)
- Vite

---

**Together we shape the future – locally connected, globally minded.**
