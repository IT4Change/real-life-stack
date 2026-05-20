# RLS Architecture Spec

**Status:** Normativer Startpunkt v0.1

Real Life Stack ist ein modularer UI- und App-Baukasten fuer lokale Communities. Die Architektur trennt UI-Module strikt von Datenquellen. Module arbeiten gegen Hooks und das `DataInterface`; Connectoren uebersetzen diesen Vertrag auf konkrete Backends.

```text
UI modules -> hooks -> DataInterface -> connector -> data source
```

## Architekturregeln

1. UI-Module duerfen keine Backend-Annahmen treffen.
2. Hooks bleiben duenn und uebersetzen Connector-Observables und Mutations in React-kompatible APIs.
3. Das `DataInterface` ist der read-only Kernvertrag fuer Items und Reaktivitaet.
4. Schreibzugriff, Relations, Groups, Profile, Auth, Contacts, Messaging und Confirmations werden ueber Capability-Interfaces ergaenzt.
5. Connectoren implementieren den Kernvertrag und nur die Capabilities, die ihre Datenquelle tragen kann.
6. Connectoren sind fuer Caching, lokale Reaktivitaet, Optimistic Updates und Backend-Sync verantwortlich.
7. Generische Items und Relations sind die technische Projektionsflaeche fuer soziale oder spielerische Semantik.
8. RLS besitzt nicht die Semantik von RLNP, Real Life Game oder Web of Trust. RLS macht diese Semantik darstellbar und bedienbar.

## Schichten

| Schicht | Verantwortung | Darf nicht |
|---|---|---|
| UI-Module | Items darstellen, Interaktionen anbieten, Views komponieren | Backend-spezifische Logik besitzen |
| Hooks | Connector-API in React State und Mutations uebersetzen | Caching- oder Sync-Quelle werden |
| DataInterface | kleinster gemeinsamer Lese- und Beobachtungsvertrag | alle Connectoren zu allen Features zwingen |
| Capability-Interfaces | optionale Faehigkeiten ausdruecken | soziale Semantik hart codieren |
| Connector | Datenquelle anbinden, Reaktivitaet herstellen, Capabilities implementieren | UI-Layout oder Produktlogik besitzen |
| Datenquelle | Persistenz, Sync, Serverlogik oder lokale Speicherung | RLS-UI-Vertrag ersetzen |

## Kernvertrag

Der Kernvertrag besteht aus:

- `init()`,
- `dispose()`,
- `getItems()`,
- `getItem()`,
- `observe()`,
- `observeItem()`.

Dieser Kern ist bewusst read-only. Ein reiner Import-, Demo- oder Viewer-Connector kann dadurch RLS-Views bedienen, ohne Schreiboperationen, Gruppen oder Identitaet zu implementieren.

## Capabilities

Optionale Faehigkeiten werden ueber Interfaces und Type Guards erkannt:

| Capability | Beispiele |
|---|---|
| `ItemWriter` | Items erstellen, aktualisieren, loeschen |
| `RelationCapable` | verwandte Items abfragen und beobachten |
| `GroupManager` | Groups/Spaces lesen und verwalten |
| `Authenticatable` | Nutzer und Auth-State bereitstellen |
| `ProfileCapable` | Profile lesen, schreiben, synchronisieren |
| `ContactManager` | Kontakte und Beziehungsstatus verwalten |
| `MessagingCapable` | Relay-Status und bestehenden Messaging-Outbox-Pending-Count sichtbar machen |
| `ConfirmationCapable` | bestaetigte Aussagen backend-agnostisch lesen und beobachten |
| `ConfirmationWriterCapable` | Confirmations erstellen und Annahmestatus setzen |
| `EncounterVerificationCapable` | QR-/Begegnungsverifikation als eigenen Ablauf bereitstellen |
| `EventListenerCapable` | eingehende Ereignisse anzeigen |

Neue Capabilities duerfen nur eingefuehrt werden, wenn ein UI- oder Connector-Vertrag nicht sinnvoll ueber bestehende Capabilities ausdrueckbar ist.

## Items und Relations

Ein `Item` ist die generische, backend-agnostische Datenstruktur. Ein Item kann ein Task, Event, Place, Profile, Quest, Project oder eine andere View sein. Module duerfen Items ueber `type`, `schema`, `data` und Relations interpretieren, aber sie duerfen nicht voraussetzen, dass ein bestimmtes Backend existiert.

Eine `Relation` verbindet ein Item mit einem anderen Item, Profil, Space oder externen Ziel. Relations sind die bevorzugte Form fuer Kontext, Zugehoerigkeit und Ableitungen.

## Groups und Spaces

RLS verwendet technisch `Group`. In RLNP- und WoT-Kontexten entspricht das meist einem Space. Eine Group oder ein Space ist ein Arbeits-, Sichtbarkeits- und Mitgliedschaftskontext. Er ist nicht automatisch ein Projekt, ein Netzwerk oder eine soziale Organisation.

Ein Projekt kann als Item existieren, als eigener Space organisiert sein oder beides verbinden.

## Confirmations und Trust

RLS braucht eine backend-agnostische Projektion fuer bestaetigte Aussagen. Der fruehere Typ `SignedClaim` war zu eng fuer diese Rolle und wurde durch Confirmation-Semantik ersetzt. `ConfirmationView` ist die neutrale UI- und Connector-Projektion; portable signierte WoT-Attestations bleiben darunter eine moegliche Quelle.

Der neutrale Begriff fuer RLS-Views ist `Confirmation`. Details stehen in [04-confirmations-and-trust.md](04-confirmations-and-trust.md).

## Source Of Truth

Diese Datei ist der Architekturanker. Die fruehere [architektur2.md](architektur2.md) bleibt als Ausgangsdokument erhalten und wird schrittweise in kleinere normative Spec-Slices ueberfuehrt.
