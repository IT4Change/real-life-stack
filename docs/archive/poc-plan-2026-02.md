# POC Plan: Real Life Stack + Web of Trust

> **Archiviert:** Dieses Dokument ist ein historischer POC-Plan. Es enthält überholte Paketnamen, Roadmap-Annahmen und Architekturstände und ist nicht mehr normativ. Aktuelle Orientierung liegt in [../spec/README.md](../spec/README.md), [../spec/00-architecture.md](../spec/00-architecture.md) und [../agent-workspace.md](../agent-workspace.md).

> Vollständiger Implementierungsplan mit Architektur-Stack

**Stand:** 14. Februar 2026
**Team:** Anton, Sebastian, Mathias, Eli
**Duration:** 5-6 Wochen
**Goal:** Funktionierender POC mit Kanban + Kalender, den das Team selbst nutzt

---

### Aktueller Fortschritt (2026-02-14)

| Week | Thema im Plan | Status | Anmerkung |
|------|--------------|--------|-----------|
| **Week 1** | WoT Core Identity | ✅ DONE | WotIdentity, 29 Tests |
| **Week 1+** | Deutsche Wortliste + Bugfixes | ✅ DONE | Deutsche BIP39-Wörter, 3 Persistence-Bugs, Enter-Nav, +13 Tests |
| **Week 2** | In-Person Verification | ✅ DONE | Challenge-Response, QR-Codes, ContactStorage, +35 Tests |
| **Forschung** | DID-Methoden + Social Recovery | ✅ DONE | 6 DID-Methoden evaluiert, Social Recovery Architektur |
| **Forschung** | Framework-Evaluation v2 | ✅ DONE | 16 Frameworks evaluiert, 6 eliminiert |
| **Forschung** | Adapter-Architektur v2 | ✅ DONE | 7-Adapter-Spezifikation, Interaction-Flows |
| **Week 3** | Evolu Integration | ✅ DONE | EvoluStorageAdapter, Custom Keys, Schema |
| **Week 3+** | MessagingAdapter + WebSocket Relay | ✅ DONE | Interface, InMemory, WebSocket, Relay (SQLite), 43 neue Tests |
| **Week 3++** | Demo App Relay-Integration | ✅ DONE | Attestation E2E über Relay, Profil-Verwaltung, Recovery Enter-Nav |
| **Week 4** | Symmetric Crypto + Profile Sync | ✅ DONE | AES-256-GCM, JWS Profile, wot-profiles Service, +30 Tests |
| **Week 5** | Encrypted Group Spaces (Foundations) | ✅ DONE | X25519 ECIES, EncryptedSyncService, GroupKeyService, +34 Tests |
| **Week 5** | wot-profiles Deployment | ✅ DONE | Docker, live unter profiles.utopia-lab.org |
| **Week 5+** | AutomergeReplicationAdapter | ✅ DONE | CRDT Spaces + verschlüsselter Transport, 16 Tests |
| **Week 5+** | Relay Deployment | ✅ DONE | Live unter `wss://relay.utopia-lab.org` |
| **Week 5++** | DiscoveryAdapter (7. Adapter) | ✅ DONE | Interface + HttpDiscoveryAdapter, Demo-App Refactoring |
| **Week 5+++** | Offline-First + Reactive Identity | ✅ DONE | OfflineFirstDiscoveryAdapter, watchIdentity(), localStorage eliminiert, +19 Tests |
| **Week 6** | Spaces UI in Demo App | ⏳ NÄCHSTER SCHRITT | AutomergeReplicationAdapter testbar machen |
| **Week 7** | RLS Integration (UI) | ⏳ AUSSTEHEND | |
| **Week 8** | Polish & Dogfooding | ⏳ AUSSTEHEND | |

**Abweichungen vom ursprünglichen Plan:**
- Klasse heißt `WotIdentity` (nicht `SecureWotIdentity` wie im Plan)
- Deutsche BIP39-Wortliste statt englische, 12 Wörter konsistent
- In-Person Verification (Plan Week 6) wurde in Week 2 vorgezogen
- `did:key` statt `did:web` (endgültige Entscheidung, kein Server nötig)
- Social Recovery (Shamir) ersetzt Key Rotation — zurückgestellt, kommt nach Encrypted Spaces
- 7-Adapter-Architektur v2 statt 3 Adapter (+ Discovery, Messaging, Replication, Authorization)
- Storage-Transition: Evolu (WoT Demo, lokal) → Automerge (RLS App, ersetzt Evolu)
- MessagingAdapter + Relay vorgezogen (ursprünglich nicht explizit geplant)
- Symmetric Crypto + Profile Sync als eigene Week 4 (nicht im ursprünglichen Plan)
- wot-profiles als separates Package (HTTP REST, kein Teil des Relays)
- SyncAdapter entfernt, ersetzt durch ReplicationAdapter (Automerge, Phase 3)
- X25519 über separaten HKDF-Pfad statt Ed25519→X25519 Konvertierung (kein @noble/curves nötig)
- Phase 3 aufgeteilt: Foundations (Week 5) + AutomergeReplicationAdapter (Week 5+, ✅ DONE)
- Relay Deployment vorgezogen — live unter `wss://relay.utopia-lab.org` + `https://profiles.utopia-lab.org`
- DiscoveryAdapter als 7. Adapter formalisiert (Interface + HttpDiscoveryAdapter, Demo-App refactored)
- Offline-First Discovery Layer (OfflineFirstDiscoveryAdapter, DiscoverySyncStore, Dirty-Flags)
- localStorage für Identity eliminiert — Evolu ist Single Source of Truth
- Reactive Identity (watchIdentity() in ReactiveStorageAdapter, useProfile Hook)
- PublicProfile Offline-Fallback mit Amber-Banner
- Profile-Upload Fix (Dirty-Flag-basiert statt unconditional bei Mount)

**Gesamt: 209 Tests passing** (175 wot-core + 19 wot-profiles + 15 wot-relay, siehe `web-of-trust/docs/CURRENT_IMPLEMENTATION.md` für Details)

---

## Gesamtarchitektur: Alle Schichten

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        REAL LIFE STACK (RLS)                            │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │                         UI LAYER                                  │ │
│  │                                                                   │ │
│  │  ┌─────────────────────────────────────────────────────────────┐ │ │
│  │  │                      App Shell                              │ │ │
│  │  │  • Navigation • Layout • Theme • Auth UI                    │ │ │
│  │  └─────────────────────────────────────────────────────────────┘ │ │
│  │                                                                   │ │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐         │ │
│  │  │ Kanban   │  │ Kalender │  │  Feed    │  │ Profile  │         │ │
│  │  │ Module   │  │ Module   │  │ (später) │  │ (später) │         │ │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘         │ │
│  │       ↓             ↓             ↓             ↓                │ │
│  └───────┼─────────────┼─────────────┼─────────────┼────────────────┘ │
│          │             │             │             │                  │
│  ┌───────┴─────────────┴─────────────┴─────────────┴────────────────┐ │
│  │              DATA & IDENTITY INTERFACE                           │ │
│  │                  (Backend-agnostic!)                             │ │
│  │                                                                   │ │
│  │  type Item = {                                                   │ │
│  │    id: string                                                    │ │
│  │    type: string              // 'task' | 'event' | 'place'      │ │
│  │    attributes: Record<string, any>  // Flexibel!                │ │
│  │    created: number                                               │ │
│  │    updated: number                                               │ │
│  │    creator: string           // DID oder User ID                │ │
│  │  }                                                                │ │
│  │                                                                   │ │
│  │  interface DataInterface {                                       │ │
│  │    // Items (generic CRUD)                                       │ │
│  │    createItem(type, attributes): Promise<Item>                   │ │
│  │    getItem(id): Promise<Item | null>                             │ │
│  │    listItems(filter?): Promise<Item[]>                           │ │
│  │    updateItem(id, updates): Promise<Item>                        │ │
│  │    deleteItem(id): Promise<void>                                 │ │
│  │                                                                   │ │
│  │    // Identity                                                    │ │
│  │    getCurrentUser(): Promise<User>                               │ │
│  │    login(credentials): Promise<User>                             │ │
│  │    logout(): Promise<void>                                       │ │
│  │                                                                   │ │
│  │    // Groups & Members                                           │ │
│  │    getGroups(): Promise<Group[]>                                 │ │
│  │    getGroupMembers(groupId): Promise<Contact[]>                  │ │
│  │  }                                                                │ │
│  │                                                                   │ │
│  │  🎯 KEY PRINCIPLE: RLS Module kennen KEIN Backend-Schema!       │ │
│  │     Kanban/Kalender arbeiten nur mit Generic Items.              │ │
│  │     Backend-Mapping passiert im Connector!                       │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│                              ↓                                        │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │                    CONNECTOR LAYER                                │ │
│  │            (Mapped Generic Items ↔ Backend Schema)                │ │
│  │                                                                   │ │
│  │  ┌─────────────────────────────────────────────────────────────┐ │ │
│  │  │              WoT Connector (für POC)                        │ │ │
│  │  │                                                             │ │ │
│  │  │  class WotConnector implements DataInterface {             │ │ │
│  │  │    private identity: WotIdentity                     │ │ │
│  │  │    private wotStorage: EvoluAdapter  // WoT Data           │ │ │
│  │  │    private evolu: Evolu              // RLS Items          │ │ │
│  │  │                                                             │ │ │
│  │  │    async init() {                                          │ │ │
│  │  │      // WoT Storage mit Schema Extension                   │ │ │
│  │  │      this.wotStorage = new EvoluAdapter(this.identity)     │ │ │
│  │  │      await this.wotStorage.init({                          │ │ │
│  │  │        schemaExtensions: {                                 │ │ │
│  │  │          items: table({                                    │ │ │
│  │  │            id: id(), type: text(),                         │ │ │
│  │  │            attributes: jsonb(), ...                        │ │ │
│  │  │          })                                                │ │ │
│  │  │        }                                                    │ │ │
│  │  │      })                                                     │ │ │
│  │  │      this.evolu = this.wotStorage.evolu                    │ │ │
│  │  │    }                                                        │ │ │
│  │  │                                                             │ │ │
│  │  │    async createItem(type, attrs): Promise<Item> {         │ │ │
│  │  │      const item: Item = {                                  │ │ │
│  │  │        id: uuid(), type, attributes: attrs,               │ │ │
│  │  │        creator: this.identity.getDid(),                    │ │ │
│  │  │        created: Date.now(), updated: Date.now()           │ │ │
│  │  │      }                                                      │ │ │
│  │  │      // Mapped Generic Item → Evolu Schema                │ │ │
│  │  │      await this.evolu.insert('items', item)               │ │ │
│  │  │      return item                                           │ │ │
│  │  │    }                                                        │ │ │
│  │  │                                                             │ │ │
│  │  │    async listItems(filter?): Promise<Item[]> {            │ │ │
│  │  │      // Evolu Query → Generic Items                       │ │ │
│  │  │      const rows = await this.evolu.query('items', {...})  │ │ │
│  │  │      return rows.map(row => ({...}))  // Mapped!          │ │ │
│  │  │    }                                                        │ │ │
│  │  │  }                                                          │ │ │
│  │  └─────────────────────────────────────────────────────────────┘ │ │
│  │                                                                   │ │
│  │  Alternative Connectors (später):                                │ │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐         │ │
│  │  │   REST   │  │  CalDAV  │  │ Supabase │  │  Custom  │         │ │
│  │  │Connector │  │Connector │  │Connector │  │Connector │         │ │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘         │ │
│  │       ↓              ↓             ↓             ↓                │ │
│  │  PostgreSQL      iCal        PostgreSQL     Any Backend          │ │
│  └───────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
                                   ↓
┌─────────────────────────────────────────────────────────────────────────┐
│                        WEB OF TRUST (WoT)                               │
│                    @real-life/wot-core (npm package)                    │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │                      IDENTITY LAYER                               │ │
│  │                                                                   │ │
│  │  ┌─────────────────────────────────────────────────────────────┐ │ │
│  │  │           WotIdentity (Neu!)                          │ │ │
│  │  │                                                             │ │ │
│  │  │  • BIP39 Mnemonic (12 words, Deutsche Wortliste)            │ │ │
│  │  │  • Master Seed (verschlüsselt at rest)                     │ │ │
│  │  │  • HKDF Key Derivation                                     │ │ │
│  │  │  • Identity Private Key (non-extractable!)                 │ │ │
│  │  │  • Framework Keys (extractable für Evolu)                  │ │ │
│  │  │                                                             │ │ │
│  │  │  BIP39 Mnemonic                                            │ │ │
│  │  │       ↓                                                     │ │ │
│  │  │  Master Seed (32 bytes)                                    │ │ │
│  │  │       ↓ HKDF                                               │ │ │
│  │  │       ├─→ 'wot-identity-v1' → Ed25519 KeyPair (Signing)   │ │ │
│  │  │       │   (Private Key non-extractable)                    │ │ │
│  │  │       │   ↓                                                │ │ │
│  │  │       │   DID (did:key:z6Mk...)                          │ │ │
│  │  │       │                                                     │ │ │
│  │  │       ├─→ 'wot-encryption-v1' → X25519 KeyPair (ECDH)    │ │ │
│  │  │       │   (für asymm. Encryption, Group Key Delivery)      │ │ │
│  │  │       │                                                     │ │ │
│  │  │       ├─→ 'evolu-storage-v1' → Evolu OwnerSecret          │ │ │
│  │  │       └─→ Future Seeds (Jazz, Custom, etc.)               │ │ │
│  │  └─────────────────────────────────────────────────────────────┘ │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │                       DID LAYER                                   │ │
│  │                                                                   │ │
│  │  did:key — self-describing, kein Server nötig                    │ │
│  │  Ed25519 Public Key → Multicodec → Multibase → did:key:z6Mk...  │ │
│  │                                                                   │ │
│  │  Entscheidung: did:key ist endgültig (nach Evaluation von 6      │ │
│  │  DID-Methoden). Kein DID-Server, kein Resolver nötig.            │ │
│  │  Siehe: web-of-trust/docs/konzepte/did-methoden-vergleich.md     │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │                    CRYPTO LAYER                                   │ │
│  │                                                                   │ │
│  │  ✅ Native WebCrypto API:                                         │ │
│  │  • Ed25519 (signing, key generation)                              │ │
│  │  • PBKDF2 (password → encryption key)                             │ │
│  │  • AES-GCM (master seed encryption)                               │ │
│  │  • HKDF (key derivation) - NATIV seit 2016!                      │ │
│  │                                                                   │ │
│  │  📦 Library (nur BIP39):                                          │ │
│  │  • @scure/bip39 (~8 KB) - Mnemonic generation                    │ │
│  │                                                                   │ │
│  │  🔮 Optional (später):                                            │ │
│  │  • WebAuthn + PRF                                                 │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │                    ADAPTER LAYER (v2: 7 Adapter)                  │ │
│  │                                                                   │ │
│  │  Phase 1 (implementiert):                                        │ │
│  │  ┌──────────────────┐  ┌────────────────────┐  ┌──────────────┐  │ │
│  │  │ StorageAdapter   │  │ReactiveStorage     │  │ CryptoAdapter│  │ │
│  │  │ (Persistierung)  │  │Adapter (Subscribe) │  │ (Ed25519,    │  │ │
│  │  │                  │  │                    │  │  X25519,     │  │ │
│  │  │ • IndexedDB      │  │ • onChange()       │  │  AES-GCM)   │  │ │
│  │  │ • Evolu (WoT     │  │ • subscribe()     │  │              │  │ │
│  │  │   Demo)          │  │                    │  │              │  │ │
│  │  └──────────────────┘  └────────────────────┘  └──────────────┘  │ │
│  │                                                                   │ │
│  │  Phase 2 (MessagingAdapter ✅, ReplicationAdapter ✅):            │ │
│  │  ┌──────────────────┐  ┌────────────────────┐  ┌──────────────┐  │ │
│  │  │ Messaging        │  │ Replication        │  │Authorization │  │ │
│  │  │ Adapter ✅       │  │ Adapter ✅         │  │Adapter       │  │ │
│  │  │                  │  │                    │  │              │  │ │
│  │  │ • WS Relay (POC) │  │ • Automerge        │  │ • UCAN-like  │  │ │
│  │  │ • Matrix (Prod)  │  │   (RLS App)       │  │ • Meadowcap  │  │ │
│  │  └──────────────────┘  └────────────────────┘  └──────────────┘  │ │
│  │                                                                   │ │
│  │  Siehe: web-of-trust/docs/protokolle/adapter-architektur-v2.md   │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │                   TYPES & CORE LOGIC                              │ │
│  │                                                                   │ │
│  │  • Identity, Contact, Verification, Attestation                   │ │
│  │  • Item (generic data type)                                       │ │
│  │  • Group, Membership                                              │ │
│  │  • JWS Signing & Verification                                     │ │
│  └───────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
                                   ↓
┌─────────────────────────────────────────────────────────────────────────┐
│                           BACKEND / SERVICES                            │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │                    WebSocket Relay Server (POC)                    │ │
│  │                    @real-life/wot-relay (Port 8787)                │ │
│  │                                                                   │ │
│  │  Zweck: Cross-User Nachrichtenzustellung (Attestations,          │ │
│  │         Verifications, Profile-Updates)                           │ │
│  │                                                                   │ │
│  │  • Einfacher Relay: Empfänger-DID → WebSocket Connection         │ │
│  │  • Kein Zugriff auf Inhalt (E2EE via Item-Keys)                  │ │
│  │  • Offline-Queue: Nachrichten werden gepuffert (SQLite)          │ │
│  │  • Später: Matrix-Server (Federation)                             │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │                    Profile Service (NEU)                           │ │
│  │                    @real-life/wot-profiles (Port 8788)             │ │
│  │                                                                   │ │
│  │  Zweck: Öffentliche Profile per DID discoverable machen          │ │
│  │                                                                   │ │
│  │  • REST API: GET/PUT /p/{did}                                     │ │
│  │  • JWS-signierte Profile (self-certifying, Ed25519/EdDSA)        │ │
│  │  • Standalone JWS Verify (keine wot-core Dependency)              │ │
│  │  • SQLite Store (better-sqlite3, WAL Mode)                        │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │                    Evolu Sync Server (WoT Demo)                   │ │
│  │                                                                   │ │
│  │  • Evolu Cloud (https://evolu.world) für WoT Demo                │ │
│  │  • E2EE: Server sieht nur encrypted blobs                        │ │
│  │  • Wird in RLS App durch Automerge ersetzt                       │ │
│  └───────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Adapter-Architektur v2

> Vollständige Spezifikation: `web-of-trust/docs/protokolle/adapter-architektur-v2.md`

| Adapter | Zweck | Status |
|---------|-------|--------|
| **StorageAdapter** | Lokale Persistierung (Identity, Contacts, Verifications, Attestations) | ✅ Interface + InMemory + Evolu |
| **ReactiveStorageAdapter** | Subscribe/onChange für UI-Reactivity | ✅ Interface + InMemory |
| **CryptoAdapter** | Ed25519 Signing, AES-256-GCM Symmetric, BIP39, did:key | ✅ Interface + WebCrypto (+Symmetric) |
| **DiscoveryAdapter** | Öffentliche Profile discoverable machen (JWS-signiert, pre-contact) | ✅ Interface + HttpDiscoveryAdapter |
| **MessagingAdapter** | Cross-User Nachrichtenzustellung (Attestations, Verifications, Profile-Updates) | ✅ Interface + InMemory + WebSocket + Relay |
| **ReplicationAdapter** | CRDT Spaces für geteilte Daten (Automerge + Encrypt-then-sync) | ✅ Interface + AutomergeReplicationAdapter |
| **AuthorizationAdapter** | UCAN-like Capabilities, Meadowcap-inspiriert | ⏳ Spezifiziert |

**Phase-1-Done-Kriterium:** Alice.send(attestation) → Bob.onMessage → Bob.verify → Bob.save → Alice.onReceipt(ack) **✅ ERREICHT**

**Storage-Transition:**
- WoT Demo: Evolu (lokal) + WebSocket Relay (messaging) — kein Automerge nötig
- RLS App: Automerge ersetzt Evolu (lokal + cross-user CRDT Spaces)
- E2EE: Item-Keys (POC) → Keyhive/BeeKEM (wenn production-ready)

---

## Clean Architecture & SOLID Prinzipien

### 🎯 Design Principles

Der POC folgt konsequent Clean Architecture und SOLID:

#### 1. Dependency Inversion Principle (DIP) ✅

**RLS Module hängen von Abstraktion ab, nicht von Konkretionen:**

```typescript
// ✅ RICHTIG: Module kennt nur Interface
function KanbanBoard({ connector }: { connector: DataInterface }) {
  const tasks = await connector.listItems({ type: 'task' })
}

// ❌ FALSCH: Module kennt Evolu direkt
function KanbanBoard({ evolu }: { evolu: Evolu }) {
  const tasks = await evolu.query('items', {...})
}
```

#### 2. Open/Closed Principle (OCP) ✅

**Neue Backends ohne RLS Code-Änderung:**

```typescript
// POC: Evolu
const connector = new WotConnector()

// Später: CalDAV
const connector = new CalDAVConnector()

// Später: Supabase
const connector = new SupabaseConnector()

// Kanban Code ändert sich NICHT! 🎯
<KanbanBoard connector={connector} />
```

#### 3. Liskov Substitution Principle (LSP) ✅

**Jeder Connector ist austauschbar:**

```typescript
interface DataInterface {
  createItem(type: string, attrs: any): Promise<Item>
  listItems(filter?: ItemFilter): Promise<Item[]>
  // ...
}

// Alle implementieren gleiches Verhalten
class WotConnector implements DataInterface { ... }
class CalDAVConnector implements DataInterface { ... }
class RESTConnector implements DataInterface { ... }
```

#### 4. Interface Segregation Principle (ISP) ✅

**Fokussierte Interfaces:**

- `DataInterface` - Nur CRUD Operations
- `StorageAdapter` - Nur WoT Persistierung
- `CryptoAdapter` - Nur Krypto-Operationen
- `DiscoveryAdapter` - Nur Public Profile Discovery
- `MessagingAdapter` - Nur Cross-User Delivery
- `ReplicationAdapter` - Nur CRDT Spaces
- `AuthorizationAdapter` - Nur Capabilities

Kein "God Interface"!

#### 5. Single Responsibility Principle (SRP) ✅

**Jede Komponente hat eine Verantwortung:**

- **RLS Module**: Nur UI Logic (Kanban, Kalender)
- **DataInterface**: Nur Kontrakt definieren
- **WotConnector**: Nur Mapping (Generic Items ↔ Evolu)
- **EvoluAdapter**: Nur WoT Data Storage
- **WotIdentity**: Nur Identity Management

### 🔧 Backend-Agnostic Design

**Key Principle:** RLS Module kennen KEIN Backend-Schema!

```typescript
// ✅ Generic Item (Backend-agnostic)
type Item = {
  id: string
  type: string                      // 'task' | 'event' | 'place'
  attributes: Record<string, any>   // Flexibel!
  created: number
  updated: number
  creator: string
}

// Kanban arbeitet nur mit Generic Items
function KanbanBoard({ connector }: { connector: DataInterface }) {
  async function createTask(title: string, status: string) {
    await connector.createItem('task', {
      title,
      status,        // 'todo' | 'doing' | 'done'
      description: '',
      assignedTo: null
    })
  }

  const tasks = await connector.listItems({ type: 'task' })
  // tasks ist Item[] - egal von welchem Backend!
}
```

**Connector macht das Mapping:**

```typescript
// WotConnector: Generic Item → Evolu Schema
class WotConnector implements DataInterface {
  async createItem(type: string, attributes: any): Promise<Item> {
    const item: Item = {
      id: uuid(),
      type,
      attributes,
      creator: this.identity.getDid(),
      created: Date.now(),
      updated: Date.now()
    }

    // Evolu-spezifisches Insert
    await this.evolu.insert('items', {
      id: item.id,
      type: item.type,
      creator: item.creator,
      attributes: item.attributes,  // JSON
      created: item.created,
      updated: item.updated
    })

    return item  // Generic Item zurück!
  }
}

// CalDAVConnector: Generic Item → iCal Event
class CalDAVConnector implements DataInterface {
  async createItem(type: string, attributes: any): Promise<Item> {
    if (type !== 'event') throw new Error('CalDAV only supports events')

    // Generic Item → iCal Format
    const vevent = {
      uid: uuid(),
      summary: attributes.title,
      dtstart: new Date(attributes.start),
      dtend: new Date(attributes.end)
    }

    await this.calendar.createEvent(vevent)

    // iCal → Generic Item zurück!
    return {
      id: vevent.uid,
      type: 'event',
      attributes: {
        title: vevent.summary,
        start: attributes.start,
        end: attributes.end
      },
      creator: this.username,
      created: Date.now(),
      updated: Date.now()
    }
  }
}
```

### 📂 Repository Struktur (Clean Architecture)

```
real-life-stack/
├── packages/
│   ├── toolkit/                     # UI Primitives (Atoms/Molecules)
│   │   ├── package.json             # @real-life-stack/toolkit
│   │   └── src/
│   │       ├── components/
│   │       │   ├── Button.tsx
│   │       │   ├── Card.tsx
│   │       │   ├── Avatar.tsx
│   │       │   └── TaskCard.tsx    # Wiederverwendbar
│   │       └── types/
│   │           └── components.ts
│   │
│   └── modules/                     # Feature Modules (Organisms/Templates)
│       ├── package.json             # @real-life-stack/modules
│       └── src/
│           ├── kanban/
│           │   ├── KanbanBoard.tsx
│           │   ├── KanbanColumn.tsx
│           │   ├── CreateTaskDialog.tsx
│           │   └── index.ts
│           ├── calendar/
│           │   ├── CalendarView.tsx
│           │   ├── MonthView.tsx
│           │   ├── EventCard.tsx
│           │   └── index.ts
│           ├── map/                # Später
│           ├── feed/               # Später
│           └── types/
│               └── data.ts         # DataInterface, Item, Filter
│                                   # ← Backend-agnostic!
└── apps/
    ├── poc/                        # POC App
    │   ├── src/
    │   │   ├── connectors/         # Connector Layer
    │   │   │   └── wot/
    │   │   │       ├── WotConnector.ts
    │   │   │       └── schema.ts
    │   │   ├── identity/           # Onboarding, Login, Recovery
    │   │   │   ├── OnboardingFlow.tsx
    │   │   │   ├── LoginScreen.tsx
    │   │   │   └── RecoveryFlow.tsx
    │   │   └── App.tsx
    │   └── package.json
    │
    └── reference/                  # Reference App (später)
        └── src/
            ├── connectors/
            │   └── rest/
            │       └── RESTConnector.ts
            └── App.tsx
```

### Package Dependencies (Atomic Design)

```
apps/poc
    ↓ depends on
@real-life-stack/modules (Feature Modules)
    ↓ depends on
@real-life-stack/toolkit (UI Primitives)
    ↓ depends on
React, Radix UI, Tailwind
```

| Layer | Package | Beispiele |
|-------|---------|-----------|
| **Atoms** | `toolkit` | Button, Input, Avatar |
| **Molecules** | `toolkit` | Card, TaskCard, EventCard |
| **Organisms** | `modules` | KanbanBoard, CalendarView |
| **Templates** | `modules` | KanbanLayout, CalendarLayout |
| **Pages** | `apps/poc` | App.tsx, Routes |

**Wichtig:**
- `DataInterface` in `modules/types` (shared zwischen Modules + Connectors)
- `toolkit` = Design System (UI-only, keine Business Logic)
- `modules` = Feature Modules (Business Logic + UI, Backend-agnostic)
- `apps` = Applications (Connectors, Routing, spezifische Integration)

### 🔄 Schema Coupling: WoT + RLS

**Problem:** Evolu braucht ein komplettes Schema bei Init.

**Lösung:** Schema Extension Pattern

```typescript
// packages/wot-core/src/adapters/evolu/EvoluAdapter.ts
export interface EvoluAdapterConfig {
  schemaExtensions?: Record<string, any>
}

export class EvoluAdapter implements StorageAdapter, ReactiveStorageAdapter {
  async init(config: EvoluAdapterConfig = {}) {
    const fullSchema = {
      ...this.getWotBaseSchema(),      // WoT Tabellen
      ...(config.schemaExtensions || {}) // RLS Tabellen
    }

    this.evolu = createEvolu({ schema: fullSchema })
  }

  private getWotBaseSchema() {
    return {
      identity: table({...}),
      verifications: table({...}),
      attestations: table({...}),
      contacts: table({...})
    }
  }
}
```

**Im WotConnector:**

```typescript
// apps/poc/src/connectors/wot/WotConnector.ts
class WotConnector implements DataInterface {
  async init() {
    this.wotStorage = new EvoluAdapter(this.identity)

    // RLS erweitert WoT Schema
    await this.wotStorage.init({
      schemaExtensions: {
        items: table({
          id: id(),
          type: text(),
          attributes: jsonb(),
          creator: text(),
          created: integer(),
          updated: integer()
        }),
        groups: table({
          id: id(),
          name: text(),
          members: jsonb()
        })
      }
    })
  }
}
```

**Trade-offs:**
- ✅ Pragmatisch für POC (eine Database)
- ✅ WoT kennt seine Tabellen
- ✅ RLS erweitert bei Bedarf
- ⚠️ Schema Coupling dokumentiert
- 🔮 Später: Separate Databases oder Namespacing

### ✅ SOLID Compliance Summary

| Prinzip | Status | Implementierung |
|---------|--------|-----------------|
| **SRP** | ✅ | Module, Connector, Storage getrennt |
| **OCP** | ✅ | Neue Connectors ohne RLS-Änderung |
| **LSP** | ✅ | Alle Connectors austauschbar |
| **ISP** | ✅ | Fokussierte Interfaces |
| **DIP** | ✅ | Abhängigkeit von Abstraktion |

**Pragmatismus:** EvoluAdapter implements StorageAdapter + ReactiveStorageAdapter, weil Evolu inherent beides bietet. Sync ist orthogonal — MessagingAdapter und ReplicationAdapter sind separate Interfaces. Das ist ein bewusster Trade-off, klar dokumentiert.

---

## Timeline: 6 Wochen

> **Strategie:** Week 1-3 parallel in `web-of-trust/apps/demo/` testen, bevor Week 4 RLS Integration!

### Warum Demo-App parallel entwickeln?

Die `web-of-trust/apps/demo/` dient als **Playground & Testumgebung** für WoT Core Features:

**Vorteile:**

- ✅ **Schnelles Feedback**: Identity, DID, Sync können isoliert getestet werden
- ✅ **Frühe Bugs finden**: Probleme mit Evolu, WebCrypto, Adapters vor RLS Integration entdecken
- ✅ **Dokumentation by Example**: Demo zeigt wie WoT Core verwendet wird
- ✅ **Weniger Risiko**: RLS Integration (Week 4) baut auf erprobter Basis auf
- ✅ **Referenz-Implementation**: Andere Projekte können Demo als Startpunkt nutzen

**Flow:**

```text
Week 1: WotIdentity implementieren → In Demo testen ✅
Week 1+: Deutsche Wortliste, Persistence-Bugfixes, Enter-Nav ✅
Week 2: In-Person Verification → QR-Codes + ContactStorage ✅
Week 3: EvoluAdapter bauen → In Demo lokale Persistenz testen
Week 4: Alles in RLS POC integrieren (confident, weil getestet!)
```

**Demo bleibt aktiv:** Auch nach Week 4 als Entwickler-Referenz und Testing-Ground für neue Features.

### Parallele Entwicklung: Visualisierung

```text
┌─────────────────────────────────────────────────────────────────────┐
│                          Week 1-3: Foundation                       │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  packages/wot-core/                 apps/demo/                      │
│  ┌──────────────────┐              ┌──────────────────┐            │
│  │ WotIdentity│──────────────│OnboardingScreen  │            │
│  │ (Implementation) │  Week 1 Test │(Identity Test)   │            │
│  └──────────────────┘              └──────────────────┘            │
│           │                                  │                      │
│           ▼                                  ▼                      │
│  ┌──────────────────┐              ┌──────────────────┐            │
│  │ Verification     │──────────────│VerificationScreen│            │
│  │ ContactStorage   │  Week 2 Test │(QR-Code Test)    │            │
│  └──────────────────┘              └──────────────────┘            │
│           │                                  │                      │
│           ▼                                  ▼                      │
│  ┌──────────────────┐              ┌──────────────────┐            │
│  │ EvoluAdapter     │──────────────│ItemManagerScreen │            │
│  │ (Storage)        │  Week 3 Test │(Persistence Test)│            │
│  └──────────────────┘              └──────────────────┘            │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼ Week 4: Integration
┌─────────────────────────────────────────────────────────────────────┐
│                     real-life-stack/apps/poc/                       │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  WotConnector (nutzt getestete wot-core Features)            │  │
│  │  • WotIdentity ✅                                        │  │
│  │  • Verification + ContactStorage ✅                            │  │
│  │  • EvoluAdapter ✅                                             │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                              │                                      │
│                              ▼                                      │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  KanbanBoard + CalendarView                                   │  │
│  │  (Baut auf erprobter Basis!)                                  │  │
│  └───────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

---

### Week 1: WoT Core Identity (Foundation) ✅

**Ziel:** WotIdentity funktioniert, Tests grün, **Demo-App zeigt Identity Creation**

> **Status:** DONE (2026-02-05). Klasse heißt `WotIdentity` (nicht `WotIdentity`). Deutsche BIP39-Wortliste statt englische. 29 Tests + 13 OnboardingFlow Tests.

#### Tasks

**Identity System (packages/wot-core/):**

- [x] BIP39 Integration (`@scure/bip39`) - **12 Wörter Default**
  ```typescript
  import { generateMnemonic, mnemonicToSeedSync } from '@scure/bip39'
  import { germanPositiveWordlist } from '../wordlists/german-positive'

  // 12 Wörter (128 Bit) - ausreichende Security + bessere UX
  const mnemonic = generateMnemonic(germanPositiveWordlist, 128)
  ```
- [x] HKDF Implementation (✅ **Native WebCrypto!**)
  ```typescript
  // Keine Library nötig - WebCrypto macht alles!
  const masterKey = await crypto.subtle.importKey(
    'raw', seed, { name: 'HKDF' }, false, ['deriveKey', 'deriveBits']
  )

  const identityKey = await crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(),
      info: new TextEncoder().encode('wot-identity-v1')
    },
    masterKey,
    { name: 'Ed25519' },
    false,  // non-extractable!
    ['sign']
  )
  ```
- [x] WotIdentity Klasse (im Plan: WotIdentity)
  ```typescript
  // packages/wot-core/src/identity/WotIdentity.ts
  class WotIdentity {
    private masterKey: CryptoKey | null = null  // HKDF master key
    private identityKeyPair: CryptoKeyPair | null = null

    async create(userPassphrase: string): Promise<{
      mnemonic: string
      did: string
    }> {
      // 1. BIP39: 12 Wörter (128 Bit - ausreichende Security)
      const mnemonic = generateMnemonic(wordlist, 128)  // 12 Wörter
      const seed = mnemonicToSeedSync(mnemonic, userPassphrase)

      // 2. Master Key: Native WebCrypto (non-extractable!)
      this.masterKey = await crypto.subtle.importKey(
        'raw',
        seed.slice(0, 32),
        { name: 'HKDF' },
        false,  // non-extractable!
        ['deriveKey', 'deriveBits']
      )

      // 3. Identity Key ableiten (non-extractable!)
      const identityPrivateKey = await crypto.subtle.deriveKey(
        {
          name: 'HKDF',
          hash: 'SHA-256',
          salt: new Uint8Array(),
          info: new TextEncoder().encode('wot-identity-v1')
        },
        this.masterKey,
        { name: 'Ed25519' },
        false,  // non-extractable!
        ['sign']
      )

      // 4. Public Key exportieren für DID
      // ...

      return { mnemonic, did }
    }

    async unlock(mnemonic: string, passphrase: string): Promise<void>
    async lock(): Promise<void>

    getDid(): string
    async sign(data: string): Promise<string>

    // Für Evolu: extractable Key ableiten
    async deriveFrameworkKey(info: string): Promise<Uint8Array> {
      const bits = await crypto.subtle.deriveBits(
        {
          name: 'HKDF',
          hash: 'SHA-256',
          salt: new Uint8Array(),
          info: new TextEncoder().encode(info)
        },
        this.masterKey!,
        256
      )
      return new Uint8Array(bits)
    }
  }
  ```
- [x] Ed25519 KeyPair Generation (via @noble/ed25519, nicht native WebCrypto wegen Browser-Kompatibilität)
- [x] Master Seed Encryption (✅ Native PBKDF2 + AES-GCM)
- [x] IndexedDB Storage für encrypted seed

**Crypto Utilities:**
- [x] `encryption.ts` - Native PBKDF2, AES-GCM wrappers (in SeedStorage integriert)
- [x] `keyDerivation.ts` - Native HKDF wrappers (in WotIdentity integriert)
- [x] `recovery.ts` - Mnemonic validation (via @scure/bip39, in WotIdentity integriert)

**Tests:**
- [x] Identity Creation Test
- [x] Recovery Test (Mnemonic → gleiche DID)
- [x] Encryption at Rest Test
- [x] Key Derivation Test

**Dependencies:**

```json
{
  "dependencies": {
    "@scure/bip39": "^1.2.1",
    "idb": "^7.1.1"
  },
  "devDependencies": {
    "@types/dom-webcodecs": "^0.1.11"
  }
}
```

**Bundle Size Optimierung:** ✅

- `@scure/bip39`: ~8 KB (einzige Library nötig!)
- ~~`@noble/hashes`: ~15 KB~~ ❌ Nicht mehr nötig! WebCrypto macht HKDF nativ
- **Gesamt: 8 KB statt 23 KB** (-65%!)

**Browser Support 2026:**

- HKDF: Chrome 46+, Firefox 46+, Safari 11+, Edge 79+ ✅
- Ed25519: Chrome 113+, Firefox 119+, Safari 17+ ✅
- PBKDF2: Alle modernen Browser ✅
- AES-GCM: Alle modernen Browser ✅

**Demo App (apps/demo/) - Week 1:**

- [x] Onboarding Screen (Identity Creation) → `OnboardingFlow.tsx` (4-Step Flow mit Enter-Navigation)
- [x] Recovery Screen (Mnemonic Input) → `RecoveryFlow.tsx`
- [x] Identity Display (DID, Public Key) → `IdentityCard.tsx`
- [x] Test: Create → Lock → Unlock → gleiche DID
- [x] Unlock Screen → `UnlockFlow.tsx`
- [x] Identity Persistence (hasStoredIdentity Check beim App-Start)
- [x] Deutsche Wortliste ("Magische Wörter" in UI)

---

### Week 2: In-Person Verification ✅

**Ziel:** Zwei Nutzer können sich gegenseitig verifizieren via QR-Code Challenge-Response

> **Status:** DONE (2026-02-06). ContactStorage, VerificationHelper, QR-Code Support, 35 Tests.

#### Implementiert

- [x] `ContactStorage` - Kontakte speichern und verwalten (Pending → Active)
- [x] `VerificationHelper` - Challenge-Response-Protokoll für In-Person Verification
- [x] QR-Code Generation (Challenge als Base64)
- [x] QR-Code Scanner (html5-qrcode mit Kamera)
- [x] Verification bestätigen (Ed25519 Signaturen)
- [x] Tests: 35 Tests für Verification + ContactStorage

**DID-Methode:** `did:key` ist endgültig. Kein DID-Server nötig.
Siehe: `web-of-trust/docs/konzepte/did-methoden-vergleich.md`

---

### Week 3: Evolu Integration (Storage)

**Ziel:** WoT kann Items in Evolu speichern, **Demo-App zeigt lokale Persistenz**

> **Status:** TEILWEISE. EvoluStorageAdapter existiert in Demo. Evolu Sync Server nicht getestet.

#### Tasks

**EvoluAdapter (packages/wot-core/):**

**EvoluAdapter:**
- [ ] `EvoluAdapter.ts` - implements `StorageAdapter + ReactiveStorageAdapter`
  ```typescript
  export interface EvoluAdapterConfig {
    schemaExtensions?: Record<string, any>  // Für RLS Tables!
    syncUrl?: string
  }

  class EvoluAdapter implements StorageAdapter, ReactiveStorageAdapter {
    public evolu: Evolu  // Public für RLS Access
    private identity: WotIdentity

    constructor(identity: WotIdentity) {
      this.identity = identity
    }

    async init(config: EvoluAdapterConfig = {}) {
      const key = await this.identity.deriveFrameworkKey('evolu-storage-v1')

      this.evolu = createEvolu({
        name: 'wot-poc',
        encryptionKey: key,
        syncUrl: config.syncUrl || 'https://evolu.world',
        schema: {
          ...this.getWotBaseSchema(),
          ...(config.schemaExtensions || {})  // ← RLS erweitert hier!
        }
      })
    }

    private getWotBaseSchema() {
      return {
        identity: table({...}),
        verifications: table({...}),
        attestations: table({...}),
        contacts: table({...})
      }
    }

    // StorageAdapter Methods (für WoT Data)
    async saveVerification(v: Verification): Promise<void> {
      await this.evolu.insert('verifications', v)
    }

    // ReactiveStorageAdapter Methods
    subscribe(callback: () => void): () => void {
      return this.evolu.subscribe(callback)
    }
  }
  ```

**WoT Base Schema (im Adapter):**
- [ ] Identity Table
- [ ] Verifications Table
- [ ] Attestations Table
- [ ] Contacts Table
- [ ] Attestation Metadata Table

**Schema Extension Pattern:**
- [ ] `schemaExtensions` Config Option
- [ ] RLS kann eigene Tabellen hinzufügen
- [ ] Dokumentation: Schema Coupling
    attributes: {
      // Flexible JSON
      title?: string
      description?: string
      status?: string
      assignedTo?: did
      start?: timestamp
      end?: timestamp
      // ...
    }
    created: timestamp
    updated: timestamp
  }
  ```
- [ ] Groups Table
  ```typescript
  {
    id: uuid
    name: string
    members: did[]  // Liste aller DIDs
    created: timestamp
  }
  ```

**Evolu Setup:**
- [ ] Key Injection: derived key von HKDF übergeben
- [ ] Evolu Cloud Sync einrichten
- [ ] Initial Group erstellen: "POC Dev Team"
- [ ] Hardcoded Members:
  ```typescript
  const devTeamMembers = [
    'did:key:z6Mk...anton',
    'did:key:z6Mk...sebastian',
    'did:key:z6Mk...mathias'
  ]
  ```

**Tests:**
- [ ] Item Creation
- [ ] Item Update
- [ ] Item Deletion
- [ ] Sync zwischen 2 Clients
- [ ] Offline → Online Sync
- [ ] Group Member Filter (nur eigene Gruppe sichtbar)

**Demo App (apps/demo/) - Week 3:**

- [ ] Simple Item Manager (Testumgebung für Evolu)

  ```tsx
  // apps/demo/src/screens/ItemManagerScreen.tsx
  import { EvoluAdapter } from '@real-life/wot-core/adapters'

  function ItemManagerScreen({ identity }: { identity: WotIdentity }) {
    const [items, setItems] = useState<Item[]>([])
    const [adapter, setAdapter] = useState<EvoluAdapter | null>(null)

    useEffect(() => {
      async function initEvolu() {
        const evolAdapter = new EvoluAdapter(identity)
        await evolAdapter.init({
          schemaExtensions: {
            demo_items: table({
              id: id(),
              title: text(),
              description: text(),
              created: integer()
            })
          }
        })
        setAdapter(evolAdapter)
      }
      initEvolu()
    }, [identity])

    async function createItem(title: string) {
      await adapter.evolu.insert('demo_items', {
        id: uuid(),
        title,
        description: '',
        created: Date.now()
      })
    }

    async function loadItems() {
      const rows = await adapter.evolu.query('demo_items', {})
      setItems(rows)
    }

    return (
      <div>
        <h1>Item Manager (Evolu Test)</h1>

        <input placeholder="New item..." />
        <button onClick={() => createItem(title)}>Add Item</button>

        <h2>Items ({items.length})</h2>
        <ul>
          {items.map(item => (
            <li key={item.id}>{item.title}</li>
          ))}
        </ul>

        <button onClick={loadItems}>Refresh</button>
        <button onClick={() => adapter.sync()}>Sync Now</button>

        <div className="sync-status">
          💡 Open this page in 2 tabs to test sync!
        </div>
      </div>
    )
  }
  ```

- [ ] Sync Status Indicator (online/offline)
- [ ] Test: 2 Browser Tabs → Item in Tab 1 erstellen → erscheint in Tab 2
- [ ] Test: Offline → Items erstellen → Online → Sync erfolgreich

---

### Week 4: Real Life Stack Integration (UI)

**Ziel:** POC App mit Kanban + Kalender läuft, **Demo-App bleibt als Referenz**

#### Multi-Connector Testing Strategy

**Vorteil des Backend-agnostischen Designs:** Im POC können wir **parallel verschiedene Datenquellen** testen!

```typescript
// apps/poc/src/connectors/
├── wot/
│   └── WotConnector.ts           // Evolu CRDT (primary)
├── mock/
│   └── MockConnector.ts          // In-Memory (fast development)
├── caldav/
│   └── CalDAVConnector.ts        // CalDAV Server (events only)
└── supabase/
    └── SupabaseConnector.ts      // PostgreSQL REST (optional)
```

#### Use Cases

1. **Development Speed:** MockConnector für schnelle UI Iteration
2. **Backend Comparison:** WoT vs CalDAV vs Supabase Performance
3. **Hybrid Setup:** Kanban mit WoT + Kalender mit CalDAV
4. **Feature Testing:** Welcher Connector unterstützt was?

#### UI: Connector Switcher

```tsx
// apps/poc/src/components/ConnectorSwitcher.tsx
<div className="connector-switcher">
  <select onChange={(e) => switchConnector(e.target.value)}>
    <option value="wot">WoT (Evolu CRDT)</option>
    <option value="mock">Mock (In-Memory)</option>
    <option value="caldav">CalDAV Server</option>
  </select>
  <span>Active: {connectorType}</span>
</div>
```

#### Testing Matrix

| Feature | WoT (Evolu) | Mock | CalDAV    | Supabase    |
|---------|-------------|------|-----------|-------------|
| Tasks   | ✅          | ✅   | ❌        | ✅          |
| Events  | ✅          | ✅   | ✅        | ✅          |
| Offline | ✅          | ✅   | ❌        | ❌          |
| Sync    | ✅ CRDT     | ❌   | ✅ Server | ✅ Realtime |
| E2EE    | ✅          | ❌   | ❌        | ❌          |

#### Beispiel-Implementierungen

**1. MockConnector (schnell für Development):**

```typescript
// apps/poc/src/connectors/mock/MockConnector.ts
import type { DataInterface, Item } from '@real-life-stack/modules/types'

export class MockConnector implements DataInterface {
  private items: Item[] = []
  private userId = 'mock-user'

  async createItem(type: string, attributes: any): Promise<Item> {
    const item: Item = {
      id: Math.random().toString(36),
      type,
      attributes,
      creator: this.userId,
      created: Date.now(),
      updated: Date.now()
    }
    this.items.push(item)
    return item
  }

  async listItems(filter?: ItemFilter): Promise<Item[]> {
    let filtered = this.items
    if (filter?.type) {
      filtered = filtered.filter(i => i.type === filter.type)
    }
    return filtered
  }

  async updateItem(id: string, updates: Partial<Item>): Promise<Item> {
    const item = this.items.find(i => i.id === id)
    if (!item) throw new Error('Item not found')
    Object.assign(item, updates, { updated: Date.now() })
    return item
  }

  async deleteItem(id: string): Promise<void> {
    const index = this.items.findIndex(i => i.id === id)
    if (index !== -1) this.items.splice(index, 1)
  }

  async getCurrentUser() {
    return { did: this.userId, name: 'Mock User' }
  }

  async getGroups() { return [] }
  async getGroupMembers() { return [] }
}
```

**2. CalDAVConnector (nur für Events):**

```typescript
// apps/poc/src/connectors/caldav/CalDAVConnector.ts
import type { DataInterface, Item } from '@real-life-stack/modules/types'
import { DAVClient } from 'tsdav'

export class CalDAVConnector implements DataInterface {
  private client: DAVClient
  private calendar: string

  async init(config: { server: string; user: string; password: string }) {
    this.client = new DAVClient({
      serverUrl: config.server,
      credentials: { username: config.user, password: config.password },
      authMethod: 'Basic',
      defaultAccountType: 'caldav'
    })
    await this.client.login()
    const calendars = await this.client.fetchCalendars()
    this.calendar = calendars[0].url
  }

  async createItem(type: string, attributes: any): Promise<Item> {
    if (type !== 'event') {
      throw new Error('CalDAV only supports events')
    }

    // Generic Item → iCal Format
    const ical = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:${Date.now()}@real-life-stack.de
SUMMARY:${attributes.title}
DTSTART:${new Date(attributes.start).toISOString()}
DTEND:${new Date(attributes.end).toISOString()}
END:VEVENT
END:VCALENDAR`

    await this.client.createCalendarObject({
      calendar: { url: this.calendar },
      filename: `${Date.now()}.ics`,
      iCalString: ical
    })

    return {
      id: `${Date.now()}`,
      type: 'event',
      attributes,
      creator: this.client.credentials.username,
      created: Date.now(),
      updated: Date.now()
    }
  }

  async listItems(filter?: ItemFilter): Promise<Item[]> {
    if (filter?.type && filter.type !== 'event') return []

    const objects = await this.client.fetchCalendarObjects({
      calendar: { url: this.calendar }
    })

    // iCal → Generic Items
    return objects.map(obj => ({
      id: obj.url,
      type: 'event',
      attributes: this.parseIcal(obj.data),
      creator: this.client.credentials.username,
      created: Date.now(),
      updated: Date.now()
    }))
  }

  // ... rest of interface implementation
}
```

**3. Hybrid Setup (Kanban + Kalender):**

```tsx
// apps/poc/src/App.tsx
function App() {
  const [wotConnector] = useState(() => new WotConnector())
  const [caldavConnector] = useState(() => new CalDAVConnector())

  return (
    <Routes>
      {/* Kanban nutzt WoT (Tasks mit CRDT Sync) */}
      <Route
        path="/kanban"
        element={<KanbanBoard connector={wotConnector} />}
      />

      {/* Kalender nutzt CalDAV (Integration mit externen Kalendern) */}
      <Route
        path="/calendar"
        element={<CalendarView connector={caldavConnector} />}
      />
    </Routes>
  )
}
```

**Vorteile im POC:**

- ✅ **MockConnector** für schnelle UI-Entwicklung (keine Backend-Setup)
- ✅ **WotConnector** für vollständige Features (CRDT, E2EE, Offline)
- ✅ **CalDAVConnector** für Externe-Kalender-Integration
- ✅ **Side-by-Side Vergleich** im gleichen POC!

#### Tasks

**Repository Setup:**
- [ ] `packages/modules/` erstellen (Feature Modules)
  ```
  packages/modules/
  ├── package.json              # @real-life-stack/modules
  ├── tsconfig.json
  └── src/
      ├── kanban/
      │   ├── KanbanBoard.tsx
      │   ├── KanbanColumn.tsx
      │   ├── CreateTaskDialog.tsx
      │   └── index.ts
      ├── calendar/
      │   ├── CalendarView.tsx
      │   ├── MonthView.tsx
      │   ├── EventCard.tsx
      │   ├── CreateEventDialog.tsx
      │   └── index.ts
      └── types/
          └── data.ts           # DataInterface, Item, Filter
  ```

- [ ] `packages/modules/package.json`
  ```json
  {
    "name": "@real-life-stack/modules",
    "version": "0.1.0",
    "type": "module",
    "exports": {
      "./kanban": "./src/kanban/index.ts",
      "./calendar": "./src/calendar/index.ts",
      "./types": "./src/types/data.ts"
    },
    "peerDependencies": {
      "react": "^19.0.0",
      "@real-life-stack/toolkit": "workspace:*"
    },
    "dependencies": {
      "@dnd-kit/core": "^6.1.0",
      "@dnd-kit/sortable": "^8.0.0",
      "date-fns": "^3.0.0"
    }
  }
  ```

- [ ] `apps/poc/` erstellen (POC App)
  ```
  apps/poc/
  ├── src/
  │   ├── identity/
  │   │   ├── OnboardingFlow.tsx
  │   │   ├── LoginScreen.tsx
  │   │   └── RecoveryFlow.tsx
  │   ├── connectors/
  │   │   └── wot/
  │   │       ├── WotConnector.ts
  │   │       └── index.ts
  │   ├── App.tsx
  │   └── main.tsx
  ├── package.json
  └── vite.config.ts
  ```

- [ ] `apps/poc/package.json` Dependencies
  ```json
  {
    "dependencies": {
      "@real-life-stack/modules": "workspace:*",
      "@real-life-stack/toolkit": "workspace:*",
      "@real-life/wot-core": "^0.2.0",
      "react": "^19.0.0",
      "react-router-dom": "^6.20.0"
    }
  }
  ```

**DataInterface Type Definition:**
- [ ] In `packages/toolkit/src/types/data.ts` definieren
  ```typescript
  // Backend-agnostic Item Type
  export interface Item {
    id: string
    type: string                      // 'task' | 'event' | 'place'
    attributes: Record<string, any>   // Flexibel!
    created: number
    updated: number
    creator: string                   // DID oder User ID
    groupId?: string
  }

  export interface ItemFilter {
    type?: string | string[]
    creator?: string
    groupId?: string
    startDate?: number
    endDate?: number
    status?: string
    search?: string
  }

  export interface DataInterface {
    // Items (generic CRUD)
    createItem(type: string, attrs: any): Promise<Item>
    getItem(id: string): Promise<Item | null>
    listItems(filter?: ItemFilter): Promise<Item[]>
    updateItem(id: string, updates: Partial<Item>): Promise<Item>
    deleteItem(id: string): Promise<void>

    // Identity
    getCurrentUser(): Promise<User>
    login(credentials: any): Promise<User>
    logout(): Promise<void>

    // Groups & Members
    getGroups(): Promise<Group[]>
    getGroupMembers(groupId: string): Promise<Contact[]>
  }
  ```

**WotConnector Implementation:**
- [ ] Implements `DataInterface` (Backend-agnostic!)
  ```typescript
  // apps/poc/src/connectors/wot/WotConnector.ts
  import type { DataInterface, Item, ItemFilter } from '@real-life-stack/toolkit'

  class WotConnector implements DataInterface {
    private identity: WotIdentity
    private wotStorage: EvoluAdapter   // Für WoT Data
    private evolu: Evolu               // Für RLS Items

    async init(mnemonic: string, passphrase: string) {
      // 1. Identity
      this.identity = new WotIdentity()
      await this.identity.unlock(mnemonic, passphrase)

      // 2. WoT Storage mit Schema Extension für RLS
      this.wotStorage = new EvoluAdapter(this.identity)
      await this.wotStorage.init({
        schemaExtensions: {
          items: table({
            id: id(),
            type: text(),
            creator: text(),
            groupId: text(),
            attributes: jsonb(),
            created: integer(),
            updated: integer()
          }),
          groups: table({
            id: id(),
            name: text(),
            members: jsonb()
          })
        }
      })

      // 3. Zugriff auf Evolu für RLS Items
      this.evolu = this.wotStorage.evolu
    }

    // DataInterface Implementation
    async createItem(type: string, attributes: any): Promise<Item> {
      const item: Item = {
        id: uuid(),
        type,
        attributes,
        creator: this.identity.getDid(),
        groupId: 'poc-dev-team',
        created: Date.now(),
        updated: Date.now()
      }

      // Evolu-spezifisch: Insert
      await this.evolu.insert('items', item)
      return item  // Generic Item!
    }

    async listItems(filter?: ItemFilter): Promise<Item[]> {
      // Evolu Query
      const rows = await this.evolu.query('items', {
        where: {
          ...(filter?.type ? { type: filter.type } : {}),
          ...(filter?.groupId ? { groupId: filter.groupId } : {})
        }
      })

      // Mapped zu Generic Item
      return rows.map(row => ({
        id: row.id,
        type: row.type,
        attributes: row.attributes,
        creator: row.creator,
        groupId: row.groupId,
        created: row.created,
        updated: row.updated
      }))
    }

    async updateItem(id: string, updates: Partial<Item>): Promise<Item> {
      const item = await this.getItem(id)
      if (!item) throw new Error('Item not found')

      const updated = { ...item, ...updates, updated: Date.now() }
      await this.evolu.update('items', id, updated)
      return updated
    }

    async deleteItem(id: string): Promise<void> {
      await this.evolu.delete('items', id)
    }

    async getCurrentUser(): Promise<User> {
      const identity = await this.wotStorage.getIdentity()
      return {
        did: identity.did,
        name: identity.name || 'User'
      }
    }

    async getGroupMembers(groupId: string): Promise<Contact[]> {
      return this.wotStorage.getContacts()
    }
  }
  ```

**Identity Flows:**
- [ ] Onboarding UI
  ```tsx
  <OnboardingFlow>
    1. Welcome
    2. Create Identity (zeigt Mnemonic)
    3. "Write it down!" Warning
    4. Mnemonic Verification (3 random words eingeben)
    5. Passphrase erstellen
    6. DID Publishing
    7. Success + DID anzeigen
  </OnboardingFlow>
  ```
- [ ] Login Screen
  ```tsx
  <LoginScreen>
    - Passphrase Input
    - "Forgot?" → Recovery Flow
  </LoginScreen>
  ```
- [ ] Recovery Flow
  ```tsx
  <RecoveryFlow>
    1. Mnemonic Input (24 Wörter)
    2. Validation
    3. Neue Passphrase
    4. Unlock
  </RecoveryFlow>
  ```

**Module Package - DataInterface Type:**
- [ ] `packages/modules/src/types/data.ts`
  ```typescript
  // Backend-agnostic Types
  export interface Item {
    id: string
    type: string                      // 'task' | 'event' | 'place'
    attributes: Record<string, any>   // Flexibel!
    created: number
    updated: number
    creator: string                   // DID oder User ID
    groupId?: string
  }

  export interface ItemFilter {
    type?: string | string[]
    creator?: string
    groupId?: string
    startDate?: number
    endDate?: number
    status?: string
    search?: string
  }

  export interface DataInterface {
    createItem(type: string, attrs: any): Promise<Item>
    getItem(id: string): Promise<Item | null>
    listItems(filter?: ItemFilter): Promise<Item[]>
    updateItem(id: string, updates: Partial<Item>): Promise<Item>
    deleteItem(id: string): Promise<void>
    getCurrentUser(): Promise<User>
    getGroups(): Promise<Group[]>
    getGroupMembers(groupId: string): Promise<Contact[]>
  }
  ```

**Kanban Module (in packages/modules!):**
- [ ] `packages/modules/src/kanban/KanbanBoard.tsx`
  ```tsx
  import type { DataInterface, Item } from '../types/data'
  import { TaskCard } from '@real-life-stack/toolkit'

  interface KanbanBoardProps {
    connector: DataInterface  // ← Backend-agnostic!
    groupId?: string
  }

  export function KanbanBoard({ connector, groupId = 'default' }: KanbanBoardProps) {
    const [tasks, setTasks] = useState<Item[]>([])

    async function loadTasks() {
      const items = await connector.listItems({
        type: 'task',
        groupId
      })
      setTasks(items)
    }

    async function createTask(title: string, status: string) {
      await connector.createItem('task', {
        title,
        status,
        description: '',
        assignedTo: null
      })
    }

    async function moveTask(taskId: string, newStatus: string) {
      const task = tasks.find(t => t.id === taskId)
      await connector.updateItem(taskId, {
        attributes: { ...task.attributes, status: newStatus }
      })
    }

    return (
      <div className="kanban-board">
        <KanbanColumn status="todo" tasks={tasks.filter(t => t.attributes.status === 'todo')} />
        <KanbanColumn status="doing" tasks={tasks.filter(t => t.attributes.status === 'doing')} />
        <KanbanColumn status="done" tasks={tasks.filter(t => t.attributes.status === 'done')} />
      </div>
    )
  }
  ```

- [ ] `packages/modules/src/kanban/KanbanColumn.tsx`
- [ ] `packages/modules/src/kanban/CreateTaskDialog.tsx`
- [ ] `packages/modules/src/kanban/index.ts` (Exports)
- [ ] Drag & Drop (via `@dnd-kit/core`)
- [ ] Assignee Select (via `connector.getGroupMembers()`)

**✅ Wichtig:** Kanban ist in `packages/modules/` und wiederverwendbar!
- Backend-agnostic (kennt weder Evolu noch CalDAV)
- Kann von POC, Reference App, und anderen Apps genutzt werden
- Alles läuft über `DataInterface` 🎯

**Calendar Module (in packages/modules!):**
- [ ] `packages/modules/src/calendar/CalendarView.tsx`
  ```tsx
  import type { DataInterface, Item } from '../types/data'

  interface CalendarViewProps {
    connector: DataInterface  // ← Backend-agnostic!
    groupId?: string
  }

  export function CalendarView({ connector, groupId }: CalendarViewProps) {
    const [events, setEvents] = useState<Item[]>([])

    async function loadEvents(startDate: Date, endDate: Date) {
      const items = await connector.listItems({
        type: 'event',
        groupId,
        startDate: startDate.getTime(),
        endDate: endDate.getTime()
      })
      setEvents(items)
    }

    async function createEvent(title: string, start: Date, end: Date) {
      await connector.createItem('event', {
        title,
        description: '',
        start: start.getTime(),
        end: end.getTime(),
        location: '',
        attendees: []
      })
    }

    return <MonthView events={events} onCreate={createEvent} />
  }
  ```

- [ ] `packages/modules/src/calendar/MonthView.tsx`
- [ ] `packages/modules/src/calendar/EventCard.tsx`
- [ ] `packages/modules/src/calendar/CreateEventDialog.tsx`
- [ ] `packages/modules/src/calendar/index.ts` (Exports)
- [ ] Date Handling (via `date-fns`)

**✅ Wichtig:** Calendar ist auch in `packages/modules/` und wiederverwendbar!

**POC App Integration:**
- [ ] `apps/poc/src/App.tsx` - Routing & Layout
  ```tsx
  import { KanbanBoard } from '@real-life-stack/modules/kanban'
  import { CalendarView } from '@real-life-stack/modules/calendar'
  import { WotConnector } from './connectors/wot/WotConnector'

  function App() {
    const [connector, setConnector] = useState<DataInterface | null>(null)

    if (!connector) return <LoginScreen />

    return (
      <Routes>
        <Route path="/kanban" element={<KanbanBoard connector={connector} />} />
        <Route path="/calendar" element={<CalendarView connector={connector} />} />
      </Routes>
    )
  }
  ```

- [ ] Navigation (Kanban ↔ Kalender)
- [ ] Header mit User DID + Logout
- [ ] Settings Screen (später: Key Rotation)

**Storybook Integration (für Sebastian & Designer):**

- [ ] Storybook Setup in `packages/modules/`
  ```bash
  cd packages/modules
  pnpm dlx storybook@latest init
  ```

- [ ] Stories für Toolkit Components
  ```tsx
  // packages/toolkit/src/components/Button.stories.tsx
  import type { Meta, StoryObj } from '@storybook/react'
  import { Button } from './Button'

  const meta = {
    title: 'Toolkit/Button',
    component: Button,
    parameters: { layout: 'centered' }
  } satisfies Meta<typeof Button>

  export default meta
  type Story = StoryObj<typeof meta>

  export const Primary: Story = {
    args: { children: 'Click me', variant: 'primary' }
  }

  export const Secondary: Story = {
    args: { children: 'Cancel', variant: 'secondary' }
  }
  ```

- [ ] Stories für TaskCard (Toolkit)
  ```tsx
  // packages/toolkit/src/components/TaskCard.stories.tsx
  export const Default: Story = {
    args: {
      task: {
        id: '1',
        type: 'task',
        attributes: {
          title: 'Implement Login',
          status: 'doing',
          assignedTo: 'did:key:z6Mk...anton'
        },
        creator: 'did:key:z6Mk...anton',
        created: Date.now(),
        updated: Date.now()
      }
    }
  }

  export const Todo: Story = {
    args: { task: { ...Default.args.task, attributes: { ...Default.args.task.attributes, status: 'todo' } } }
  }

  export const Done: Story = {
    args: { task: { ...Default.args.task, attributes: { ...Default.args.task.attributes, status: 'done' } } }
  }
  ```

- [ ] Stories für Kanban Module (mit Mock Connector!)
  ```tsx
  // packages/modules/src/kanban/KanbanBoard.stories.tsx
  import type { Meta, StoryObj } from '@storybook/react'
  import { KanbanBoard } from './KanbanBoard'
  import type { DataInterface, Item } from '../types/data'

  // Mock Connector für Storybook
  const mockConnector: DataInterface = {
    async listItems(filter) {
      return mockTasks.filter(t => !filter?.type || t.type === filter.type)
    },
    async createItem(type, attrs) {
      const item: Item = {
        id: Math.random().toString(),
        type,
        attributes: attrs,
        creator: 'did:key:z6Mk...storybook',
        created: Date.now(),
        updated: Date.now()
      }
      mockTasks.push(item)
      return item
    },
    async updateItem(id, updates) {
      const item = mockTasks.find(t => t.id === id)
      Object.assign(item, updates)
      return item
    },
    async deleteItem(id) {
      const index = mockTasks.findIndex(t => t.id === id)
      mockTasks.splice(index, 1)
    },
    async getCurrentUser() {
      return { did: 'did:key:z6Mk...storybook', name: 'Storybook User' }
    },
    async getGroups() { return [] },
    async getGroupMembers() { return [] }
  }

  const mockTasks: Item[] = [
    {
      id: '1',
      type: 'task',
      attributes: { title: 'Design Onboarding', status: 'todo' },
      creator: 'did:key:z6Mk...sebastian',
      created: Date.now(),
      updated: Date.now()
    },
    {
      id: '2',
      type: 'task',
      attributes: { title: 'Implement MessagingAdapter', status: 'doing', assignedTo: 'did:key:z6Mk...anton' },
      creator: 'did:key:z6Mk...anton',
      created: Date.now(),
      updated: Date.now()
    },
    {
      id: '3',
      type: 'task',
      attributes: { title: 'Setup Repo', status: 'done' },
      creator: 'did:key:z6Mk...anton',
      created: Date.now() - 86400000,
      updated: Date.now()
    }
  ]

  const meta = {
    title: 'Modules/Kanban/KanbanBoard',
    component: KanbanBoard,
    parameters: { layout: 'fullscreen' }
  } satisfies Meta<typeof KanbanBoard>

  export default meta
  type Story = StoryObj<typeof meta>

  export const Default: Story = {
    args: {
      connector: mockConnector
    }
  }

  export const Empty: Story = {
    args: {
      connector: {
        ...mockConnector,
        listItems: async () => []
      }
    }
  }
  ```

- [ ] Stories für Calendar Module
  ```tsx
  // packages/modules/src/calendar/CalendarView.stories.tsx
  export const Default: Story = {
    args: {
      connector: mockConnectorWithEvents
    }
  }

  export const EmptyMonth: Story = {
    args: {
      connector: { ...mockConnector, listItems: async () => [] }
    }
  }
  ```

- [ ] Storybook Addons konfigurieren
  ```js
  // packages/modules/.storybook/main.ts
  export default {
    stories: ['../src/**/*.stories.@(js|jsx|ts|tsx)'],
    addons: [
      '@storybook/addon-essentials',     // Controls, Actions, etc.
      '@storybook/addon-interactions',   // Interaction Testing
      '@storybook/addon-a11y',           // Accessibility Testing
      '@chromatic-com/storybook'         // Visual Regression (optional)
    ],
    framework: '@storybook/react-vite'
  }
  ```

- [ ] Deployment
  ```bash
  # Build Storybook
  pnpm build:storybook

  # Deploy zu real-life-stack.de/storybook-poc/
  ```

**Vorteile für Sebastian & Designer:**

✅ **Isolated Component Development**
- Components ohne App Context testen
- Schneller Feedback-Loop (HMR)
- Keine Backend/Auth nötig

✅ **Alle States visualisiert**
- Todo, Doing, Done Tasks
- Empty States
- Loading States
- Error States

✅ **Interactive Playground**
- Props live ändern (Controls)
- Events tracken (Actions)
- Accessibility prüfen (A11y Addon)

✅ **Documentation**
- Props automatisch dokumentiert
- Usage Examples
- Design System als Living Documentation

✅ **Design Handoff**
- Designer sehen Components live
- Können States testen
- Feedback direkt an Components geben

✅ **Visual Regression Testing**
- Chromatic Integration (optional)
- Screenshot-basiertes Testing
- Automatische Visual Diffs

**Package Dependencies:**

`packages/modules/package.json`:
```json
{
  "dependencies": {
    "@dnd-kit/core": "^6.1.0",
    "@dnd-kit/sortable": "^8.0.0",
    "date-fns": "^3.0.0"
  },
  "peerDependencies": {
    "react": "^19.0.0",
    "@real-life-stack/toolkit": "workspace:*"
  }
}
```

`apps/poc/package.json`:
```json
{
  "dependencies": {
    "@real-life-stack/modules": "workspace:*",
    "@real-life-stack/toolkit": "workspace:*",
    "@real-life/wot-core": "^0.2.0",
    "react": "^19.0.0",
    "react-router-dom": "^6.20.0",
    "evolu": "^4.0.0",
    "uuid": "^9.0.0"
  }
}
```

---

### Week 5: Polish & Dogfooding

**Ziel:** Team nutzt POC für eigene Tasks, Bugs fixen

#### Tasks

**Team Onboarding:**
- [ ] Anton erstellt Identity
- [ ] Sebastian erstellt Identity
- [ ] Mathias erstellt Identity
- [ ] Alle in "POC Dev Team" Gruppe

**Dogfooding:**
- [ ] Kanban Board für POC Development nutzen
  - Tasks aus diesem Plan als Kanban Items
  - Assignees setzen
  - Status tracken
- [ ] Kalender für Team-Meetings nutzen
  - Wöchentliche Syncs eintragen
  - Review-Sessions planen

**Testing Scenarios:**
- [ ] Offline-Modus
  - Device offline nehmen
  - Items erstellen
  - Online gehen → Sync prüfen
- [ ] Multi-Device
  - Gleiche Identity auf 2 Devices
  - Item auf Device 1 erstellen
  - Auf Device 2 sichtbar?
- [ ] Conflict Resolution
  - Gleichen Task auf 2 Devices ändern
  - Evolu CRDT löst Konflikt
- [ ] Recovery
  - Identity mit Mnemonic recovern
  - Alle Items wieder da?

**Bug Fixing:**
- [ ] Issues tracken (GitHub Issues oder Kanban)
- [ ] Performance optimieren
- [ ] Error Handling verbessern
- [ ] UI Polish

**Documentation:**
- [ ] User Guide für Onboarding
- [ ] Developer Docs für WotConnector
- [ ] Troubleshooting Guide

---

### Week 6 (Optional): Social Recovery & Attestations

**Ziel:** Should-Have Features für Production-Readiness

> **Status:** Verification wurde in Week 2 vorgezogen und ist DONE.
> Social Recovery und Attestations stehen noch aus.

#### Tasks

**Verification Flow:** ✅ (vorgezogen in Week 2)
- [x] QR-Code Generation (Challenge/Response als Base64)
- [x] QR-Code Scanner (html5-qrcode mit Kamera)
- [x] Verification Request erstellen (Challenge-Response-Protokoll)
- [x] Verification bestätigen (Ed25519 Signaturen)
- [x] ContactStorage (Pending → Active nach Verification)
- [ ] Verifications anzeigen (Contact Profile) - UI noch nicht fertig

**Social Recovery (ersetzt Key Rotation):**
- [ ] Shamir Secret Sharing Implementation
- [ ] Recovery Guardian Selection UI
- [ ] Recovery Flow: Guardians sammeln Shares → Identity wiederherstellen
- [ ] Siehe: `web-of-trust/docs/konzepte/social-recovery.md`

**Attestations:**
- [ ] Skill Attestation UI
- [ ] Attestation Request Flow (via MessagingAdapter)
- [ ] Attestations anzeigen (Profile)
- [ ] Alice→Bob Attestation Flow (Phase-1-Done-Kriterium)

---

## Repositories & Struktur

### 1. web-of-trust (wot-core Package)

```
web-of-trust/
├── packages/
│   └── wot-core/                    # @real-life/wot-core
│       ├── src/
│       │   ├── identity/
│       │   │   ├── WotIdentity.ts          ← Week 1 ✅
│       │   │   ├── KeyDerivation.ts        ← Week 1 ✅
│       │   │   └── Recovery.ts             ← Week 1 ✅
│       │   ├── crypto/
│       │   │   ├── encryption.ts           ← Week 1 ✅
│       │   │   └── signing.ts              ← Week 1 ✅
│       │   ├── adapters/
│       │   │   ├── interfaces/
│       │   │   │   ├── StorageAdapter.ts         ← ✅
│       │   │   │   ├── ReactiveStorageAdapter.ts ← ✅
│       │   │   │   ├── CryptoAdapter.ts          ← ✅
│       │   │   │   ├── MessagingAdapter.ts       ← ⏳ Spezifiziert
│       │   │   │   ├── ReplicationAdapter.ts     ← ⏳ Spezifiziert
│       │   │   │   └── AuthorizationAdapter.ts   ← ⏳ Spezifiziert
│       │   │   ├── storage/
│       │   │   │   ├── InMemoryStorageAdapter.ts ← ✅
│       │   │   │   └── EvoluAdapter.ts           ← Week 3
│       │   │   ├── crypto/
│       │   │   │   └── WebCryptoAdapter.ts       ← ✅
│       │   │   └── messaging/
│       │   │       └── WebSocketMessagingAdapter.ts ← Phase 2
│       │   ├── verification/
│       │   │   ├── VerificationHelper.ts   ← Week 2 ✅
│       │   │   └── ContactStorage.ts       ← Week 2 ✅
│       │   └── types/
│       │       ├── identity.ts
│       │       ├── item.ts
│       │       ├── group.ts
│       │       └── verification.ts
│       ├── package.json
│       └── tsconfig.json
└── apps/
    └── demo/                        ← Week 1-3 (Testing Ground!)
        ├── src/
        │   ├── screens/
        │   │   ├── OnboardingScreen.tsx      ← Week 1 ✅
        │   │   ├── RecoveryScreen.tsx        ← Week 1 ✅
        │   │   ├── VerificationScreen.tsx    ← Week 2 ✅
        │   │   └── ItemManagerScreen.tsx     ← Week 3
        │   ├── components/
        │   │   ├── MnemonicDisplay.tsx
        │   │   └── IdentityCard.tsx
        │   ├── App.tsx
        │   └── main.tsx
        ├── package.json
        └── vite.config.ts
```

### 2. real-life-stack (UI + Connector)

```
real-life-stack/
├── packages/
│   └── toolkit/                     # UI Components (existiert)
│       └── src/
│           ├── TaskCard.tsx
│           ├── Calendar.tsx
│           └── ...
└── apps/
    └── poc/                         ← Week 4 (NEU!)
        ├── src/
        │   ├── identity/
        │   │   ├── OnboardingFlow.tsx
        │   │   ├── LoginScreen.tsx
        │   │   └── RecoveryFlow.tsx
        │   ├── connectors/
        │   │   └── wot/
        │   │       ├── WotConnector.ts
        │   │       └── types.ts
        │   ├── modules/
        │   │   ├── kanban/
        │   │   │   ├── KanbanBoard.tsx
        │   │   │   ├── TaskCard.tsx
        │   │   │   ├── ColumnView.tsx
        │   │   │   └── CreateTaskDialog.tsx
        │   │   └── calendar/
        │   │       ├── CalendarView.tsx
        │   │       ├── EventCard.tsx
        │   │       ├── MonthView.tsx
        │   │       └── CreateEventDialog.tsx
        │   ├── App.tsx
        │   ├── main.tsx
        │   └── router.tsx
        ├── package.json
        ├── vite.config.ts
        └── index.html
```

---

## Acceptance Criteria

### Must Have (Week 5)

- [x] User kann Identity erstellen (did:key)
- [x] User kann via Mnemonic recovern
- [x] User sieht seine DID (did:key:z6Mk...)
- [ ] User kann Kanban Tasks erstellen
- [ ] User kann Tasks zwischen Spalten verschieben
- [ ] User kann Tasks assignen (Gruppenmitglieder)
- [ ] User kann Kalender Events erstellen
- [ ] Events haben start + end Zeit
- [ ] Sync funktioniert zwischen 2 Devices
- [ ] Offline-Modus funktioniert (Items werden gesynced wenn online)
- [ ] Nur Gruppenmitglieder sehen Items

### Should Have (Week 6)

- [ ] Social Recovery funktioniert (Shamir Secret Sharing)
- [x] Verification Flow (QR-Code) - ✅ in Week 2 implementiert
- [ ] Verifications werden angezeigt (Contact Profile UI)
- [ ] Attestation Flow (Alice → Bob via MessagingAdapter)

### Nice to Have (Post-POC)

- [ ] Mobile App (React Native)
- [ ] Push Notifications bei neuen Items
- [ ] Multi-Group Support
- [ ] Attestations
- [ ] Export/Import

---

## Risiken & Mitigations

### Risiko 1: Evolu Key Injection

**Problem:** Wie übergeben wir derived Key an Evolu?

**Mitigation:**
- Evolu Docs gründlich lesen
- Test Implementation vor Week 3
- Falls nicht möglich: Evolu Fork oder Alternative (Automerge)

### Risiko 2: WebSocket Relay Availability

**Problem:** Wenn Relay down, keine Cross-User Zustellung

**Mitigation:**
- Offline-Queue: Nachrichten werden lokal gepuffert
- Retry-Logik mit Backoff
- Später: Matrix-Server (Federation, dezentral)

### Risiko 3: Sync Conflicts

**Problem:** Evolu CRDT verhält sich unerwartet

**Mitigation:**
- Frühes Testing (Week 3)
- Fallback: Last-Write-Wins mit Timestamps
- Später: Manuelle Conflict Resolution UI

### Risiko 5: Performance

**Problem:** Evolu/IndexedDB zu langsam

**Mitigation:**
- Performance Budget definieren (< 100ms für CRUD)
- Pagination für lange Listen
- Virtual Scrolling für Kanban

---

## Success Metrics

### Technical

- Identity Creation < 5 Sekunden
- Recovery funktioniert 100% (Mnemonic → gleiche DID)
- Sync < 1 Sekunde (local network)
- Offline-Modus funktioniert ohne Fehler
- Keine kritischen Security Vulnerabilities

### User Experience

- Team nutzt POC täglich für eigene Tasks
- Keine Datenverluste
- < 5 kritische Bugs pro Woche (Week 5)
- Onboarding dauert < 3 Minuten

### Community Readiness

- DID Architecture ist stabil (did:key, endgültig)
- Social Recovery getestet und dokumentiert
- Migration Path dokumentiert (Evolu → Automerge, WS Relay → Matrix)
- Bereit für externe Tester

---

## Open Questions

### 1. Evolu Cloud vs. Self-Hosted?

**Entscheidung:**
- **Start:** Evolu Cloud (einfach, schnell)
- **Später:** Self-hosted Option evaluieren (falls mehr Kontrolle nötig)

### 2. Invitation Flow?

**Entscheidung:**
- **POC:** Hardcoded Group Members (Anton, Sebastian, Mathias)
- **Phase 2:** QR-Code Invitation + Group Join Request

### 3. Multi-Group Support?

**Entscheidung:**
- **POC:** Eine Gruppe "Dev Team"
- **Phase 2:** Multi-Group mit Group Creation UI

### 4. WebSocket Relay Deployment?

**Entscheidung:** Noch offen

**Optionen:**
- Self-hosted (eigener Server, volle Kontrolle)
- Managed (z.B. Fly.io, Railway)
- Eli's Server (82.165.138.182) für POC

---

## Next Steps (Week 0 - Vorbereitung)

### Sofort

1. [x] **DID-Methode:** did:key (endgültig) ✅
2. [x] **Repository Setup:** web-of-trust/packages/wot-core/ + apps/demo/ ✅
3. [ ] **MessagingAdapter Interfaces** in wot-core definieren
4. [ ] **WebSocket Relay Server** aufsetzen
5. [ ] **Team Alignment:** Rollen klären (wer macht was?)

### Nächste Schritte

1. [ ] **MessagingAdapter:** Interface + WebSocketMessagingAdapter
2. [ ] **WebSocket Relay:** Server implementieren (Node.js/Bun)
3. [ ] **Attestation Flow:** Alice → Bob via MessagingAdapter (Phase-1-Kriterium)
4. [ ] **Identity Consolidation:** Alte IdentityService/useIdentity entfernen

---

## Migration Path: POC → Production

### Phase 1: WoT Demo (aktuell)

- did:key (endgültig, kein Server)
- Evolu (lokale Persistenz)
- WebSocket Relay (Cross-User Messaging)
- Hardcoded Group
- Team Dogfooding

### Phase 2: RLS App (Community Launch)

- Automerge ersetzt Evolu (lokal + cross-user CRDT Spaces)
- Item-Keys für E2EE (symmetrische Dokumentverschlüsselung)
- Invitation Flow + Multi-Group Support
- Attestations via MessagingAdapter
- Social Recovery (Shamir)

### Phase 3: Production

- Matrix (Federation, dezentrales Messaging)
- Keyhive/BeeKEM (CRDT-native E2EE, wenn production-ready)
- Mobile App (React Native)
- AuthorizationAdapter (UCAN-like Capabilities)

### Storage-Transition: Evolu → Automerge

**WoT Demo braucht kein Automerge:** Alle WoT-Datentypen (Identity, Contacts, Verifications, Attestations) sind Single-Owner oder signiert-und-zugestellt. Kein Multi-Writer CRDT nötig.

**RLS App braucht Automerge:** Geteilte Listen, Gruppen-Spaces, kollaborative Daten erfordern Multi-Writer CRDT.

**Automerge ersetzt Evolu:** Automerge kann alles was Evolu kann (lokal + sync + multi-writer). Evolu ist das Sprungbrett, nicht das Ziel.

**E2EE-Strategie:** Automerge hat kein eingebautes E2EE. Lösung: Item-Keys (jedes Dokument hat einen symmetrischen Key, alle Space-Mitglieder kennen ihn). Clients mergen lokal, Server ist dummer Relay. Langfristig: Keyhive (CRDT-native Key Management von Ink & Switch).

---

**Fazit:** Mit did:key und der 6-Adapter-Architektur haben wir eine stabile, erweiterbare Grundlage. Der POC zeigt den Weg von der WoT Demo zur ersten RLS App — und jeder Adapter kann unabhängig ausgetauscht werden (SOLID/OCP).
