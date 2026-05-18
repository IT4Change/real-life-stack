# RLNP- und Game-Integration

**Status:** Arbeitskonzept v0

Dieses Dokument beschreibt, wie Real Life Stack (RLS) das Real Life Network Protocol (RLNP) und das Real Life Game implementieren kann, ohne seine Backend-Agnostik zu verlieren.

Der wichtigste Grundsatz:

```text
RLS besitzt nicht die soziale Semantik.
RLS macht soziale Semantik darstellbar, bearbeitbar und backend-agnostisch nutzbar.
```

## Ausgangspunkt

RLS ist ein modularer Frontend- und App-Baukasten für Community-Apps.

RLS stellt bereit:

- App-Shell,
- UI-Module,
- Hooks,
- generisches `Item`-/`Relation`-Modell,
- `DataInterface`,
- Connector-Capabilities,
- Connectoren für unterschiedliche Backends.

RLS soll nicht voraussetzen, ob Daten aus WoT/Local-first, Supabase/Postgres, GraphQL, REST, IndexedDB oder Mock-Daten kommen.

RLNP und Real Life Game definieren dagegen Bedeutung:

| Ebene | Aufgabe |
|---|---|
| Web of Trust | Identität, Kontakte, Verifikationen und Attestations |
| Real Life Network Protocol | soziale Semantik: Begegnungen, Ressourcen, Bedürfnisse, Veranstaltungen, Quests, Evidence, Completion, Attestation Policies |
| Real Life Game | optionale Spielsemantik: Game Packs, Entwicklungskarte, Adventures, Campaigns, World State |
| Real Life Stack | Implementierung: UI, App-Flows, Items, Relations, Connectoren und Views |

## Leitprinzipien

### 1. Semantik bleibt außerhalb von RLS

RLS darf wissen, dass ein Item `type: "quest"` hat. RLS sollte aber nicht selbst definieren, was eine Quest sozial bedeutet.

Die Bedeutung kommt aus RLNP:

```text
Quest = freiwillige reale Handlungseinladung.
QuestRun = konkrete Durchführung einer Quest.
Evidence = Spur oder Selbst-Claim.
Attestation = portabler Beleg.
```

RLS rendert diese Objekte, validiert UI-Flows gegen Capabilities und ruft Connector-Mutationen auf.

### 2. Backend-Agnostik bleibt erhalten

Ein RLS-Modul darf nicht voraussetzen:

```text
Diese Attestation kommt aus WoT.
```

Es muss stattdessen fragen:

```text
Welche Confirmations, Completion-Informationen oder Attestations stellt dieser Connector bereit?
Welche Trust-Stufe hat diese Confirmation?
```

### 3. Gleiche Oberfläche, unterschiedliche Trust-Stufen

Ein Game- oder Quest-Flow kann mit verschiedenen Backends funktionieren. Die Aussagekraft ist aber unterschiedlich.

| Trust-Stufe | Bedeutung | Beispiel-Backend |
|---|---|---|
| `demo` | Demo- oder Mock-Daten ohne echte Beweiskraft | MockConnector |
| `local` | lokal gespeicherte Aussage oder Evidence | LocalConnector / IndexedDB |
| `server-confirmed` | ein Server oder eine Space-Rolle bestätigt etwas | Supabase / GraphQL / REST |
| `signed-attested` | eine signierte Attestation belegt die Aussage | WoT / E2EE / DID-basierte Connectoren |

Die UI darf diese Stufen nicht vermischen. Ein Badge auf Basis einer signierten Attestation ist stärker als ein serverseitig markierter Demo-Erfolg.

### 4. Views statt Protokollbesitz

RLS-Module sind Views und Interaktionsflächen.

| RLS-Modul | Zeigt typischerweise |
|---|---|
| Map | Orte, Events, Ressourcen, Quests, Adventures, Campaigns mit Ortsbezug |
| Calendar | Events, Quest-Zeiträume, Adventure-Phasen, Campaign-Zeiträume |
| Feed | sichtbare Aktivität, Dokumentation, neue Items, Attestations |
| Marketplace | Angebote, Bedürfnisse, Ressourcen und mögliche Matches |
| Profile | Person, Profilfelder, Kontakte, Confirmations, Badges, Beiträge |
| Questlog | Quests, QuestRuns, Evidence, Completion-Status |
| Campaign View | Ziel, World State, Adventures, sichtbare Ergebnisse |
| Entwicklungskarte | aus attestierten Handlungen abgeleitete Entwicklungsfelder |

Die Module besitzen nicht die soziale Bedeutung dieser Objekte. Sie machen sie nutzbar.

## Item- und Relation-Projektion

RLS kann RLNP- und Game-Objekte als generische Items darstellen.

```ts
type Item = {
  id: string
  type: string
  createdAt: string
  createdBy: string
  schema?: string
  schemaVersion?: number
  data: Record<string, unknown>
  relations?: Relation[]
}

type Relation = {
  predicate: string
  target: string
  meta?: Record<string, unknown>
}
```

### RLNP-Objekte

| Semantik | RLS-Projektion |
|---|---|
| Profil | `type: "profile"` |
| Ort | `type: "place"` |
| Veranstaltung | `type: "event"` |
| Ressource | `type: "resource"` |
| Projekt | `type: "project"` oder eigener Space; bei Bedarf beides |
| Dokumentation | `type: "documentation"` oder `type: "post"` mit Relation |
| Quest | `type: "quest"` |
| QuestRun | `type: "quest-run"` |

Angebote und Bedürfnisse sind in v0 keine eigenen Item-Typen. Sie erscheinen zunächst als Profilfelder oder Tags, z.B. `data.offers[]` und `data.needs[]`. Eigene Offer- oder Need-Items werden erst sinnvoll, wenn sie einen eigenen Lifecycle brauchen: Verfügbarkeit, Ablaufdatum, Ort, Reservierung, Matching, Status oder mehrere Beteiligte.

Commons ist in v0 ebenfalls kein eigener Item-Typ. Commons beschreibt eher einen sozialen Zustand oder Verantwortungsrahmen einer Ressource, eines Ortes oder eines Projekts. Eine Ressource kann z.B. als gemeinsam gepflegt markiert werden; ein Ort kann Commons-Charakter haben; ein Projekt kann Commons aufbauen oder verwalten.

Ein Projekt kann als Item, als Space oder als Kombination aus beidem erscheinen. Als Item beschreibt es das Vorhaben und kann auf Map, Feed, Questlog oder Campaign View sichtbar sein. Als Space bildet es den Arbeits-, Mitgliedschafts- und Sichtbarkeitskontext. Ein kleines Projekt kann also ein `project`-Item in einem bestehenden Space sein; ein größeres Projekt kann zusätzlich einen eigenen Space bekommen.

Die genaue Typisierung darf sich entwickeln. Wichtig ist: Das RLS-Item bleibt generisch; die Semantik wird über `type`, `schema`, `data` und `relations` projiziert.

### Game-Objekte

| Semantik | RLS-Projektion |
|---|---|
| Game Pack | `type: "game-pack"` |
| Adventure | `type: "adventure"` |
| Campaign | `type: "campaign"` |
| World State Metric | Datenfeld oder eigenes Item, abhängig vom Connector |
| Avatar-Item | Darstellung auf Basis von Badge-/Attestation-Views |

Für v0 reicht es vermutlich, World-State-Metriken als `data.worldState[]` in Campaign-Items zu modellieren. Wenn Metriken später geteilt, versioniert oder wiederverwendet werden sollen, können sie eigene Items werden.

## Relations

RLS-Relations verbinden Items, ohne die Semantik hart in UI-Module einzubauen.

Beispiele:

```json
{
  "predicate": "containsQuest",
  "target": "item:quest:material-besorgen",
  "meta": {
    "required": true,
    "phase": "vorbereitung",
    "order": 1
  }
}
```

```json
{
  "predicate": "usesGamePack",
  "target": "item:game-pack:commons-builder"
}
```

```json
{
  "predicate": "locatedAt",
  "target": "item:place:gartenkreis"
}
```

RLS braucht dafür keine Quest-, Adventure- oder Campaign-Spezialdatenbank. Es braucht gute Relation-Queries, stabile Relation-Konventionen und UI-Komponenten, die diese Relationen lesen können.

## Claims, Confirmations, Attestations und Trust

RLS hat bereits `SignedClaimCapable`. Das passt grundsätzlich zu WoT-Verifikationen und Attestations, ist aber für backend-agnostische RLNP/Game-Flows noch zu eng benannt.

Für das Integrationskonzept ist wichtig:

```text
Game- und Quest-Views sollten gegen "Confirmations" arbeiten,
nicht direkt gegen eine bestimmte WoT-Speicherform.
```

Ein Connector kann Confirmations unterschiedlich bereitstellen:

- als signierte WoT-Attestation,
- als serverseitig bestätigte Row,
- als lokale Demo- oder Testdaten,
- als importierte externe Bescheinigung.

Die UI braucht dafür mindestens:

```ts
type ConfirmationTrustLevel =
  | "demo"
  | "local"
  | "server-confirmed"
  | "signed-attested"

type ConfirmationView = {
  id: string
  subjectId: string
  issuerId?: string
  claim: string
  schema?: string
  tags?: string[]
  relations?: Relation[]
  createdAt: string
  trustLevel: ConfirmationTrustLevel
  source?: string
  isAccepted?: boolean
}
```

Das ist kein neuer verbindlicher API-Vorschlag in diesem Konzept, sondern verweist auf die Spezifikationsrichtung in [../spec/04-confirmations-and-trust.md](../spec/04-confirmations-and-trust.md): RLS-Views brauchen eine normalisierte Sicht auf Confirmations, egal aus welchem Backend sie kommen. RLS sollte dabei keine geschlossene Liste von Attestation-Faellen definieren. Die fachliche Bedeutung kommt ueber `claim`, `schema`, `tags` und `relations`; `trustLevel` beschreibt die Beweiskraft.

## Connector-Capabilities

Backend-Agnostik bedeutet nicht, dass jeder Connector alles können muss.

RLS besitzt dafür bereits Capability-Interfaces und Type Guards. Für RLNP/Game geht es nicht darum, ein neues Capability-System einzuführen, sondern die bestehenden Capabilities semantisch auf Quests, Evidence, Confirmations und World-State-Views zu mappen.

Bestehende RLS-Capabilities:

| RLS-Capability | Bedeutung für RLNP/Game |
|---|---|
| `DataInterface` | Items lesen und beobachten |
| `ItemWriter` / `isWritable()` | Items erstellen, aktualisieren und löschen |
| `RelationCapable` / `hasRelations()` | Related Items und Kontextbezüge abfragen |
| `GroupManager` / `hasGroups()` | Spaces/Gruppen lesen und verwalten |
| `ProfileCapable` / `hasProfile()` | Profile lesen, schreiben und synchronisieren |
| `SignedClaimCapable` / `hasSignedClaims()` | bestehender enger Claim-/Attestation-Vertrag; soll durch Confirmation-Semantik ersetzt werden |
| `ContactManager` / `hasContacts()` | Kontakte und Beziehungsstatus abbilden |
| `MessagingCapable` / `hasMessaging()` | Relay-Status und bestehenden Messaging-Outbox-Pending-Count anzeigen |
| `EventListenerCapable` / `hasEventListener()` | eingehende Verifikationen, Confirmations oder Space-Einladungen anzeigen |

Offen ist nicht die Grundmechanik, sondern die RLNP/Game-Semantik darüber:

- QuestRuns können als normale Items abgebildet werden, brauchen aber noch etablierte Views und Mutationsmuster.
- Evidence kann als Feld im QuestRun, als Relation zu bestehenden Items oder später als eigenes Item erscheinen.
- World-State-Metriken können clientseitig aus Items, Relations und Confirmations berechnet oder connectorseitig geliefert werden.
- Trust-Stufen wie `demo`, `local`, `server-confirmed` und `signed-attested` sollten in Views sichtbar werden, ohne das bestehende Interface unnötig an WoT zu binden.

Ein Supabase-Connector könnte z.B. dieselben RLS-Capabilities für Items, Relations, Groups, Profile und Confirmations anbieten, aber nur `server-confirmed` statt `signed-attested` liefern.

Ein WoT-Connector kann signierte Verifikationen und Attestations als Confirmations liefern, aber World-State-Metriken lokal oder clientseitig berechnen.

## Supabase-/GraphQL-Beispiel

Ein GraphQL- oder Supabase-Backend kann RLNP/Game-Semantik implementieren, ohne WoT als Speicher- und Sync-Schicht zu nutzen.

Mögliche Abbildung:

| Semantik | Supabase/Postgres |
|---|---|
| Item | `items` Tabelle |
| Relation | `relations` Tabelle oder JSONB-Feld |
| Space | `spaces` Tabelle + Memberships |
| Quest | `items.type = 'quest'` |
| QuestRun | `items.type = 'quest-run'` |
| Evidence | JSONB in QuestRun oder eigene `items.type = 'evidence'` |
| Confirmation / Attestation | `confirmations`, `claims` oder `attestations` Tabelle |
| Campaign | `items.type = 'campaign'` |
| World State | SQL View, Materialized View oder GraphQL Resolver |

Die UX kann dieselbe bleiben wie bei einem WoT-Connector. Die Trust-Anzeige muss aber ehrlich sein:

```text
server-confirmed != signed-attested
```

Wenn später WoT-Signaturen ergänzt werden, kann dasselbe RLS-Modul stärkere Confirmations anzeigen, ohne dass die Campaign- oder Quest-UI neu erfunden werden muss.

## Game-Integration

Das Real Life Game sollte in RLS als optionale UI- und Semantik-Erweiterung erscheinen.

RLS braucht dafür keine neue Grundarchitektur. Es braucht Views:

- Game Pack Editor oder Viewer,
- Adventure Detail View,
- Campaign Detail View,
- World State Panel,
- Entwicklungskarte,
- Badge-/Avatar-Item-Darstellung.

Diese Views lesen normale Items, Relations und Confirmations.

Beispiel:

```text
Campaign View
  liest campaign Item
  liest usesGamePack Relation
  liest includesAdventure Relations
  berechnet oder lädt World State
  zeigt Trust-Level der zugrunde liegenden Werte
```

## Was RLS nicht tun sollte

RLS sollte nicht:

- RLNP-Begriffe unabhängig vom RLNP neu definieren,
- Game-Mechaniken wie XP, Level oder Skill Trees als Standard voraussetzen,
- WoT als einzig mögliches Backend erzwingen,
- serverseitige Bestätigungen als signierte Attestations darstellen,
- Quest-Completion-Logik hart in UI-Komponenten einbauen,
- Marketplace, Map oder Calendar als eigene soziale Protokolle behandeln.

## Konsequenzen für bestehende RLS-Dokumente

Einige ältere RLS-Dokumente stammen aus einer Zeit vor der klaren Trennung zwischen RLNP und Real Life Game.

Gezielt zu prüfen:

| Datei | Einordnung |
|---|---|
| `docs/modules/quests.md` | Enthält noch XP, Level-Anforderung, Fähigkeitenbaum und QR-Belohnungslogik; sollte an RLNP/Game angepasst oder als Legacy markiert werden. |
| `docs/concepts/gamification.md` | Sehr roher Vorläufer; sollte durch Verweis auf Real Life Game ersetzt oder archiviert werden. |
| `docs/concepts/overview.md` | Kann als RLS-Übersicht bleiben, braucht aber klarere Abgrenzung zu RLNP/Game. |
| README | Sollte langfristig stärker sagen: RLS ist App-/UI-Baukasten, nicht soziales Protokoll. |

Dieses Dokument ist der Maßstab für diese spätere Aufräumrunde.

## Umsetzungspfad

### Phase 1: Konzept und Cleanup

- Dieses Integrationskonzept schärfen.
- Legacy-Quest- und Gamification-Dokumente markieren oder aktualisieren.
- RLS-README/Overview mit der neuen Abgrenzung aktualisieren.

### Phase 2: Daten- und Capability-Lücken schließen

- Prüfen, ob `RelationCapable` Schreiboperationen braucht.
- `SignedClaimCapable` nicht als dauerhafte Legacy-Projektion behandeln, sondern durch `ConfirmationCapable` ersetzen; QR-Verifikation getrennt modellieren und Delivery/Outbox im Connector lassen.
- Feature-Items um RLNP/Game-Capabilities erweitern.

### Phase 3: Erste UI-Slices

- Questlog auf RLNP-Quest/QuestRun ausrichten.
- Campaign View mit World State Panel bauen.
- Entwicklungskarte als reine View über attestierte Handlungen bauen.

### Phase 4: Backend-Profile

- MockConnector: Demo-Daten für Quests, Adventures, Campaigns.
- GraphQL/Supabase: server-confirmed Confirmations und World-State-Views.
- WoTConnector: signed-attested Confirmations und lokale/verschlüsselte Daten.

## Offene Fragen

- Wie schneiden wir die Code-Migration von `SignedClaim`/`SignedClaimCapable` zu `ConfirmationView`/`ConfirmationCapable`, ohne QR-Verifikation wieder in den generischen Confirmation-Vertrag zu mischen?
- Soll Evidence als eigenes Item modelliert werden oder zunächst im QuestRun liegen?
- Braucht `RelationCapable` eine Schreib-Capability?
- Wie werden World-State-Metriken bei lokalen und serverseitigen Connectors konsistent berechnet?
- Welche Trust-Stufen sollen in der UI sichtbar sein und wie stark?
- Wie viel RLNP-Schemawissen darf ein RLS-Modul direkt importieren?
