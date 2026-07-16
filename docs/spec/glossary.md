# Glossar

**Status:** Lebendes Dokument

Kurzdefinitionen der RLS-Spec-Begrifflichkeit. Jeder Eintrag verweist auf die Spec-Stelle, an der der Begriff normativ definiert ist. Querverwiesene Begriffe sind *kursiv* und im selben Dokument zu finden.

Wenn ein Begriff hier und in einer Spec divergiert, gewinnt die Spec; bitte den Glossar nachziehen.

---

## Adapter

Library-agnostisches Interface, das ein *Space Module* von der Wahl einer konkreten JS-Library trennt. Das *Map*-Modul definiert z.B. den `MapAdapter` mit Methoden wie `mount`, `setMarkers`, `setView`; konkrete Implementierungen (Leaflet, MapLibre, …) leben hinter derselben Oberfläche.

Spec: [modules/map.md → §Karten-Library-Adapter](modules/map.md)

## App Shell

Globaler Rahmen einer RLS-App. Enthält Navigation, *Space*-Switcher, User Menu, Auth-Status, Notifications, Relay-Status. Lebt außerhalb einzelner *Spaces* und ist nicht selbst ein *Space Module*.

Spec: [01-app-composition.md → §App Shell](01-app-composition.md)

## Attestation

Portable, signierte *Confirmation*. Im WoT-Kontext typischerweise ein Verifiable Credential als JWS. Die kryptografische Wahrheit besitzt WoT, nicht RLS.

Spec: [05-confirmations-and-trust.md → §Begriffe](05-confirmations-and-trust.md)

## BaseConnector

Optionale TypeScript-Basisklasse, die Boilerplate für *Observable*-Verwaltung, einfache Filter und Pagination liefert. Connectoren müssen `BaseConnector` nicht erben — sie können *DataInterface* direkt implementieren.

Spec: [03-capabilities.md → §BaseConnector](03-capabilities.md)

## Capability

Optionale Connector-Fähigkeit jenseits des read-only *DataInterface*. Wird über ein TypeScript-Interface beschrieben und durch einen *Type Guard* sichtbar gemacht. Beispiele: `ItemWriter`, `MessagingCapable`, `EncounterVerificationCapable`.

Spec: [03-capabilities.md → §Capability-Katalog](03-capabilities.md)

## Claim

Eine Aussage oder Einreichung, die noch unbestätigt sein kann. Wird durch Bestätigung zur *Confirmation*, optional durch Signatur zur *Attestation*.

Spec: [05-confirmations-and-trust.md → §Begriffe](05-confirmations-and-trust.md)

## Composer

*Module Component* zum Erstellen oder Editieren eines *Items*. Setzt sich aus *Widgets* zusammen (Title, Date, Location, People, Tags) und übergibt das fertige Item an einen *Connector*. Im Code als `ContentComposer` im Toolkit. Boilerplate für Open/Close, `@context`-Ableitung und Mutations-Dispatch ist im `useItemEditor`-Hook gebündelt.

Spec: [modules/shared-components.md](modules/shared-components.md), [01-app-composition.md → §Module Components](01-app-composition.md)

## Confirmation

Bestätigte Aussage, Handlung, Teilnahme, Completion oder Beobachtung. Entsteht aus einem *Claim* durch Bestätigung und kann als *Attestation* portabel signiert werden.

Spec: [05-confirmations-and-trust.md → §Begriffe](05-confirmations-and-trust.md)

## Connector

Konkrete Implementierung von *DataInterface* plus optionaler *Capabilities* für eine bestimmte Datenquelle (Mock, IndexedDB, GraphQL, WoT/Yjs, …). UI- und Hook-Code arbeitet nur gegen die Interfaces, nie gegen einen konkreten Connector.

Spec: [02-data-interface.md](02-data-interface.md), [03-capabilities.md](03-capabilities.md)

## `@context`

Array von Vocabulary-URLs am *Item*, das deklariert, welche *Vocabularies* das Item benutzt. Erster Eintrag ist immer `base/v1`. Validatoren prüfen das Item gegen jedes Schema in der Liste.

Spec: [06-schema-composition.md → §Schema-Composition über `@context`](06-schema-composition.md)

## Current Space

Der aktuell ausgewählte *Space* in der UI. Technisch im Code meist als *Group* abgebildet.

Spec: [01-app-composition.md → §Current Space](01-app-composition.md)

## `data`

Feld am *Item*, das alle vocab-spezifischen Werte trägt. *Vocabularies* wie `event/v1` oder `place/v1` definieren Pflichtfelder in `data` (z.B. `data.start`, `data.position`).

Spec: [04-items-relations-groups-spaces.md → §Data-Felder](04-items-relations-groups-spaces.md), [06-schema-composition.md](06-schema-composition.md)

## DataInterface

Read-only RLS-Kernvertrag zwischen UI/Hooks und *Connector*. Definiert nur `getItems`, `getItem`, `observe`, `observeItem`. Alles, was schreibt, authentifiziert oder Trust-Aussagen trifft, lebt in *Capabilities*.

Spec: [02-data-interface.md](02-data-interface.md)

## Filter (`ItemFilter`)

Suchbedingung an *DataInterface*-Methoden: `type`, `hasField`, `hasTag` (siehe *Tag*), `createdBy`, `source`, `limit`, `offset`. Zukünftig auch `hasSchema` (siehe *Vocabulary*).

Spec: [02-data-interface.md → §Filter](02-data-interface.md)

## FullConnector

Convenience-Typ, der *DataInterface* + die frühen Capabilities (`ItemWriter`, `RelationCapable`, `GroupCapable`) vereinigt. Bedeutet *nicht*, dass der Connector alle heutigen Capabilities implementiert — nur eine pragmatische Bündelung.

Spec: [03-capabilities.md → §FullConnector](03-capabilities.md)

## Group

Code-Begriff für den technischen Container für Mitgliedschaft und Sichtbarkeit. In der UI als *Space* sichtbar. Eine `Group` ist nicht automatisch ein Projekt, Verein oder Netzwerk — diese Bedeutungen kommen aus RLNP, nicht aus RLS.

Spec: [04-items-relations-groups-spaces.md → §Groups und Spaces](04-items-relations-groups-spaces.md)

## Item

Die kleinste RLS-Einheit für darstellbare Inhalte: Task, Event, Post, Place, Profile, Comment, Reaction. Strukturell `{ id, type, @context, createdAt, createdBy, data, relations? }`. Die fachliche Bedeutung kommt aus dem `@context`, nicht aus *`type`*.

Spec: [02-data-interface.md → §Item](02-data-interface.md), [04-items-relations-groups-spaces.md](04-items-relations-groups-spaces.md), [06-schema-composition.md](06-schema-composition.md)

## Module → siehe *Space Module*

## Module Component

Wiederverwendbarer Baustein innerhalb eines *Space Module*. Beispiele: `ItemPreview`, `ItemDetailPanel`, `ContentComposer`, `FilterBar`, `CommentSection`, `ReactionBar`. Ist nicht selbst pro Space aktivierbar. Geteilte Components mit Vertrag, Slot-Konvention und Datenanker sind in [modules/shared-components.md](modules/shared-components.md) normativ definiert.

Spec: [01-app-composition.md → §Module Components](01-app-composition.md), [modules/shared-components.md](modules/shared-components.md)

## Observable

Reaktive Datenquelle mit `current` und `subscribe`. *DataInterface*-Methoden wie `observe(filter)` liefern Observables, an die UI- und Hook-Code sich anhängen.

Spec: [02-data-interface.md → §Observable](02-data-interface.md)

## Profile

*Item* mit `@context: [..., person/v1]`. Trägt mindestens `data.displayName`, optional `data.bio`, `data.avatarUrl`, `data.position`. Wird in RLNP als sozialer Knoten gelesen.

Spec: [04-items-relations-groups-spaces.md → §Profile](04-items-relations-groups-spaces.md), [schemas/vocab/person/v1/](schemas/vocab/person/v1/)

## Relation

Gerichtete Verknüpfung zwischen zwei *Items*, ausgedrückt als `{ predicate, target }`. `predicate` ist eine freie String-ID (z.B. `assignedTo`, `commentOn`, `attendedBy`); `target` ein Item-ID-Verweis. RLS interpretiert die Bedeutung der Predicates nicht — das tun Module und Connector.

Spec: [04-items-relations-groups-spaces.md → §Relations](04-items-relations-groups-spaces.md)

## Schema

JSON-Schema (Draft 2020-12) pro *Vocabulary* unter `docs/spec/schemas/vocab/<name>/v1/schema.json`. Validiert die Struktur, die das jeweilige Vocab für ein *Item* fordert. Die CI prüft demo-data und Examples gegen diese Schemas (siehe [README → Stufe 2](README.md)).

Spec: [schemas/README.md](schemas/README.md), [06-schema-composition.md](06-schema-composition.md)

## Space

User-sichtbarer Arbeits-, Sichtbarkeits- und Mitgliedschaftskontext. Technisch im Code als *Group* abgebildet. „Space" ist die UI-Sprache, „Group" der Code-Begriff für dieselbe Sache.

Spec: [04-items-relations-groups-spaces.md → §Groups und Spaces](04-items-relations-groups-spaces.md), [01-app-composition.md → §Current Space](01-app-composition.md)

## Space Module

Aktivierbare Oberfläche innerhalb eines *Space* (Feed, Map, Calendar, Kanban, Marketplace, Quests, …). Arbeitet gegen *DataInterface* und optionale *Capabilities*. Besitzt nicht die soziale Semantik von RLNP, die Spielregeln des Real Life Game oder die kryptografische Wahrheit von WoT.

Spec: [01-app-composition.md → §Space Modules](01-app-composition.md), [modules/](modules/)

## Tag

Orthogonale Kategorisierungs-Achse zu *Schemas*. Tags beschreiben die Themenzuordnung, Schemas die Struktur. Top-level am Item als `item.tags: string[]`; perspektivisch auch als strukturierte URN-Tags mit optionalen Tag-*Items* für Display und Hierarchie. Filterbar im `ItemFilter` über `hasTag` (AND).

Spec: [07-tags.md](07-tags.md)

## Trust-Level

UI-Information darüber, wie eine *Confirmation* abgesichert ist (unverified / signed / attested / web-of-trust-confirmed). Wird vom *Connector* berechnet; UI darf nicht selbst Vertrauen aus der Capability-Liste eines Connectors ableiten.

Spec: [05-confirmations-and-trust.md → §Trust-Level](05-confirmations-and-trust.md)

## `type`

> **Offene Frage.** Wird zwischen Anton und Sebastian diskutiert (siehe PR #37, Branch `spec/type-primary-reading`).

Bis dahin gilt der Stand aus 06: `type` ist ein optionaler UI-Hint, kein struktureller Filter. Die fachliche Bedeutung eines *Items* kommt aus dem `@context`, nicht aus `type`.

Spec: [06-schema-composition.md → §Item mit `@context` Regel 5](06-schema-composition.md)

## Type Guard

TypeScript-Funktion mit Signatur `(c: DataInterface) => c is CapabilityType`. Schaltet capability-spezifische Pfade frei:

```ts
if (isWritable(connector)) { await connector.createItem(...) }
```

Spec: [03-capabilities.md → §Prinzip](03-capabilities.md)

## Vocabulary (Vocab)

Additive Definition von Property-Namen und Strukturen über eine `context.jsonld` (JSON-LD) und ein `schema.json` (JSON-*Schema*). Standardvokabulare in v0.1: `base/v1`, `event/v1`, `place/v1`, `task/v1`, `person/v1`. *Items* deklarieren ihre aktiven Vocabularies über `@context`.

Spec: [06-schema-composition.md](06-schema-composition.md), [schemas/README.md](schemas/README.md)

## Widget

*Composer*-Baustein für ein einzelnes Datenfeld oder einen Feld-Cluster. Beispiele: `TitleWidget`, `DateWidget`, `LocationWidget`, `PeopleWidget`. Vom Composer zusammengesetzt; eigene Widgets können per Konfiguration ergänzt werden.

Spec: [code-and-storybook-mapping.md](code-and-storybook-mapping.md)

## Workspace

Code-Speak für die UI-State-Auswahl eines *Space* plus dessen Modul-Konfiguration. Häufig mit dem `WorkspaceSwitcher`. Bedeutet kein separates Backend; ist reine View-Wahl über *Groups*/*Spaces*.

Spec: [code-and-storybook-mapping.md](code-and-storybook-mapping.md)
