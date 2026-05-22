# RLS Architecture Spec

**Status:** Normativer Startpunkt v0.1

Real Life Stack ist ein modularer UI- und App-Baukasten für lokale Communities. Die Architektur trennt UI-Flächen strikt von Datenquellen. App Shell, Space Modules und Module Components arbeiten gegen Hooks und das `DataInterface`; Connectoren übersetzen diesen Vertrag auf konkrete Backends.

```text
App Shell / Space Modules -> hooks -> DataInterface -> connector -> data source
```

## App-Komposition

Eine RLS-App besteht aus einer globalen App Shell und dem aktuell ausgewählten Space.

```text
App
├─ App Shell
└─ Current Space
   └─ Space Modules
      └─ Module Components
```

Die App Shell ist der space-übergreifende Rahmen: Navigation, Space-Wechsel, User/Profile, Contacts, Verification, Notifications und globale Dialoge. Space Modules sind pro Space aktivierbare Oberflächen wie Feed, Map, Calendar, Kanban, Marketplace, Quests oder Campaign View. Module Components sind wiederverwendbare Bausteine innerhalb dieser Module.

Details: [01-app-composition.md](01-app-composition.md).

## Architekturregeln

1. UI-Flächen dürfen keine Backend-Annahmen treffen.
2. Hooks bleiben dünn und übersetzen Connector-Observables und Mutations in React-kompatible APIs.
3. Das `DataInterface` ist der read-only Kernvertrag für Items und Reaktivität.
4. Schreibzugriff, Relations, Groups, Profile, Auth, Contacts, Messaging und Confirmations werden über Capability-Interfaces ergänzt.
5. Connectoren implementieren den Kernvertrag und nur die Capabilities, die ihre Datenquelle tragen kann.
6. Connectoren sind für Caching, lokale Reaktivität, Optimistic Updates und Backend-Sync verantwortlich.
7. Generische Items und Relations sind die technische Projektionsfläche für soziale oder spielerische Semantik.
8. RLS besitzt nicht die Semantik von RLNP, Real Life Game oder Web of Trust. RLS macht diese Semantik darstellbar und bedienbar.

## Schichten

| Schicht | Verantwortung | Darf nicht |
|---|---|---|
| UI-Flächen | Items darstellen, Interaktionen anbieten, Views komponieren | Backend-spezifische Logik besitzen |
| Hooks | Connector-API in React State und Mutations übersetzen | Caching- oder Sync-Quelle werden |
| DataInterface | kleinster gemeinsamer Lese- und Beobachtungsvertrag | alle Connectoren zu allen Features zwingen |
| Capability-Interfaces | optionale Fähigkeiten ausdrücken | soziale Semantik hart codieren |
| Connector | Datenquelle anbinden, Reaktivität herstellen, Capabilities implementieren | UI-Layout oder Produktlogik besitzen |
| Datenquelle | Persistenz, Sync, Serverlogik oder lokale Speicherung | RLS-UI-Vertrag ersetzen |

## Kernvertrag

Der Kernvertrag besteht aus:

- `init()`,
- `dispose()`,
- `getItems()`,
- `getItem()`,
- `observe()`,
- `observeItem()`.

Dieser Kern ist bewusst read-only. Ein reiner Import-, Demo- oder Viewer-Connector kann dadurch RLS-Views bedienen, ohne Schreiboperationen, Gruppen oder Identität zu implementieren.

Details: [02-data-interface.md](02-data-interface.md).

## Capabilities

Optionale Fähigkeiten werden über Interfaces und Type Guards erkannt:

| Capability | Beispiele |
|---|---|
| `ItemWriter` | Items erstellen, aktualisieren, löschen |
| `RelationCapable` | verwandte Items abfragen und beobachten |
| `GroupManager` | Groups/Spaces lesen und verwalten |
| `Authenticatable` | Nutzer und Auth-State bereitstellen |
| `ProfileCapable` | Profile lesen, schreiben, synchronisieren |
| `ContactManager` | Kontakte und Beziehungsstatus verwalten |
| `MessagingCapable` | Relay-Status und bestehenden Messaging-Outbox-Pending-Count sichtbar machen |
| `ConfirmationCapable` | bestätigte Aussagen backend-agnostisch lesen und beobachten |
| `ConfirmationWriterCapable` | Confirmations erstellen und Annahmestatus setzen |
| `EncounterVerificationCapable` | QR-/Begegnungsverifikation als eigenen Ablauf bereitstellen |
| `EventListenerCapable` | eingehende Ereignisse anzeigen |
| `ItemGroupCapable` | Item-zu-Group-Zuordnung lesen oder verschieben |

Neue Capabilities dürfen nur eingeführt werden, wenn ein UI- oder Connector-Vertrag nicht sinnvoll über bestehende Capabilities ausdrückbar ist.

Details: [03-capabilities.md](03-capabilities.md).

## Items und Relations

Ein `Item` ist die generische, backend-agnostische Datenstruktur. Ein Item kann ein Task, Event, Place, Profile, Quest, Project oder eine andere View sein. UI-Flächen dürfen Items über `type`, `schema`, `data` und Relations interpretieren, aber sie dürfen nicht voraussetzen, dass ein bestimmtes Backend existiert.

Eine `Relation` verbindet ein Item mit einem anderen Item, Profil, Space oder externen Ziel. Relations sind die bevorzugte Form für Kontext, Zugehörigkeit und Ableitungen.

Details: [04-items-relations-groups-spaces.md](04-items-relations-groups-spaces.md).

## Groups und Spaces

RLS verwendet technisch `Group`. In RLNP- und WoT-Kontexten entspricht das meist einem Space. Eine Group oder ein Space ist ein Arbeits-, Sichtbarkeits- und Mitgliedschaftskontext. Er ist nicht automatisch ein Projekt, ein Netzwerk oder eine soziale Organisation.

Ein Projekt kann als Item existieren, als eigener Space organisiert sein oder beides verbinden.

Details: [04-items-relations-groups-spaces.md](04-items-relations-groups-spaces.md).

## Confirmations und Trust

RLS braucht eine backend-agnostische Projektion für bestätigte Aussagen. Der frühere Typ `SignedClaim` war zu eng für diese Rolle und wurde durch Confirmation-Semantik ersetzt. `ConfirmationView` ist die neutrale UI- und Connector-Projektion; portable signierte WoT-Attestations bleiben darunter eine mögliche Quelle.

Der neutrale Begriff für RLS-Views ist `Confirmation`. Details stehen in [05-confirmations-and-trust.md](05-confirmations-and-trust.md).

## Source of Truth

Diese Datei ist der Architekturanker. Die Detail-Slices [01-app-composition.md](01-app-composition.md), [02-data-interface.md](02-data-interface.md), [03-capabilities.md](03-capabilities.md), [04-items-relations-groups-spaces.md](04-items-relations-groups-spaces.md) und [05-confirmations-and-trust.md](05-confirmations-and-trust.md) konkretisieren ihn. Die frühere [architektur2.md](architektur2.md) bleibt als historische Referenz erhalten.
