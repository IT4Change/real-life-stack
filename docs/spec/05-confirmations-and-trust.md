# Confirmations and Trust

**Status:** Normativer Entwurf v0.1

Diese Spec beschreibt, wie Real Life Stack bestätigte Aussagen backend-agnostisch darstellt. Sie ersetzt nicht Web-of-Trust-Attestations und definiert kein neues kryptografisches Format. Sie definiert eine UI- und Connector-Projektion.

## Kontext

RLS hatte ursprünglich `SignedClaim` und `SignedClaimCapable`. Das passte für den WoT-Connector, weil dort Verifikationen und Attestations tatsächlich signiert sind.

Der Name war für RLS aber zu eng:

- Ein GraphQL- oder Supabase-Backend kann eine Aktion serverseitig bestätigen, ohne eine portable Signatur zu erzeugen.
- Ein LocalConnector kann lokale Evidence oder Demo-Daten anzeigen.
- Eine Quest- oder Game-View braucht eine einheitliche Sicht auf bestätigte Ereignisse, ohne direkt WoT-Speicherformen zu kennen.
- Eine reine Signatur-Projektion verliert Trust-Informationen wie `demo`, `local`, `server-confirmed` oder `signed-attested`.

Deshalb nutzt RLS jetzt `ConfirmationView`, `ConfirmationCapable`, `ConfirmationWriterCapable` und `EncounterVerificationCapable`.

## Begriffe

| Begriff | Bedeutung |
|---|---|
| Claim | Eine Aussage oder Einreichung. Sie kann unbestätigt sein. |
| Confirmation | Eine bestätigte Aussage, Handlung, Teilnahme, Completion oder Beobachtung. |
| Attestation | Eine portable, signierte Confirmation. Im WoT-Kontext typischerweise VC-JWS. |
| Badge | Eine visuelle Darstellung einer Confirmation oder daraus abgeleiteten Anerkennung. |

Kurz:

```text
Claim -> Confirmation -> optional Attestation -> optional Badge
```

Anerkennung und Würdigung sind UI-Sprache. Sie sind kein eigener RLS-Core-Typ.

## ConfirmationView

RLS-Views arbeiten gegen eine neutrale `ConfirmationView`.

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

Diese Form ist eine RLS-Projektion. Sie ist nicht automatisch die Quelle der Wahrheit.

RLS definiert bewusst keine geschlossene Liste von Confirmation- oder Attestation-Fällen. Eine Attestation kann in Zukunft sehr unterschiedliche Dinge bestätigen: eine Begegnung, einen Beitrag, eine Quest, eine Teilnahme, eine Fähigkeit, einen Ort, eine Ressource oder ein Projektergebnis.

Die fachliche Bedeutung wird offen transportiert über:

- `claim` als menschenlesbare Aussage,
- `schema` als optionale maschinenlesbare Semantik,
- `tags` als einfache Sortierung,
- `relations` als Bezug zu Items, Profilen, Spaces, QuestRuns, Events oder anderen Kontexten,
- `trustLevel` als Aussage über Beweiskraft und Quelle.

## Trust-Level

| Trust-Level | Bedeutung | Beispiele |
|---|---|---|
| `demo` | Demo-, Seed- oder Mock-Daten ohne echte Beweiskraft | MockConnector, Storybook |
| `local` | lokal gespeicherte Aussage oder Evidence ohne externe Bestätigung | LocalConnector, Offline-Entwurf |
| `server-confirmed` | ein Server, Host, Space oder Backend hat die Aussage bestätigt | Supabase, GraphQL, REST |
| `signed-attested` | eine portable Signatur belegt die Aussage | WoT-Attestation, VC-JWS |

UI-Komponenten MÜSSEN diese Level ehrlich behandeln. Eine serverseitige Bestätigung darf nicht wie eine portable signierte Attestation dargestellt werden.

## Abgrenzung zum früheren SignedClaim-Vertrag

`SignedClaim` und `SignedClaimCapable` beschrieben den früheren engen Claim-/Attestation-Vertrag in RLS. Sie werden nicht als dauerhafte Legacy-Projektion konserviert. RLS hat den Vertrag durch Confirmation-Semantik ersetzt.

RLNP/Game-Views dürfen nicht direkt voraussetzen, dass jede Confirmation eine portable signierte WoT-Attestation ist.

Die Migration hat die zuvor vermischten Verantwortlichkeiten getrennt:

1. `ConfirmationView` ersetzt die alte Claim-Projektion.
2. `ConfirmationCapable` liest und beobachtet Confirmations.
3. `ConfirmationWriterCapable` erstellt Confirmations und setzt Annahmestatus.
4. `EncounterVerificationCapable` kapselt QR-/Begegnungsverifikation.
5. Delivery-/Outbox-Status bleibt außerhalb der Confirmation-Schnittstelle.

Eine dauerhafte Kompatibilitätsprojektion von der früheren Signed-Claim-Form nach `ConfirmationView` ist nicht Ziel der Spec.

Mögliches Mapping für bestehende WoT-Daten:

| Quelle | ConfirmationView |
|---|---|
| Verification | `trustLevel: "signed-attested"`, `schema: "wot:verification"` |
| WoT Attestation | `trustLevel: "signed-attested"`, optionales Attestation-Schema |
| Quest-Completion-Attestation | `trustLevel: "signed-attested"`, Relation zum QuestRun |

Mögliches Mapping für serverseitige Backends:

| Quelle | ConfirmationView |
|---|---|
| Server bestätigt QuestRun | `trustLevel: "server-confirmed"`, Relation zum QuestRun |
| Host bestätigt Teilnahme | `trustLevel: "server-confirmed"`, Relation zum Event |
| importierte externe Bescheinigung | Trust-Level je nach Quelle, optionales externes Schema |

## UI-Regeln

1. Eine Confirmation ist keine Bewertung einer Person.
2. Eine Confirmation ist kontextbezogen und soll den Anlass sichtbar machen.
3. Trust-Level dürfen in der UI verdichtet werden, aber nicht verfälscht werden.
4. Badges und Entwicklungskarten dürfen aus Confirmations abgeleitet werden.
5. Eine nicht akzeptierte oder private Confirmation darf nicht ungefragt öffentlich angezeigt werden.
6. UI-Flächen dürfen nicht voraussetzen, dass `signed-attested` verfügbar ist.

## Connector-Regeln

Ein Connector, der Confirmations bereitstellt, MUSS für jede Confirmation ein Trust-Level liefern.

Ein Connector DARF Confirmations aus unterschiedlichen Quellen normalisieren:

- WoT-VC-JWS,
- serverseitige Rows,
- lokale Evidence,
- importierte externe Daten,
- Demo-Daten.

Ein Connector DARF nur dann `signed-attested` setzen, wenn die zugrunde liegende Aussage kryptografisch signiert und verifizierbar ist.

## Delivery, Outbox und Sync-Status

Delivery und Outbox sind Connector-Verantwortung. Sie beschreiben den Transport- oder Sync-Zustand einer lokalen Operation, nicht die fachliche Bedeutung einer Confirmation.

RLS hat heute bereits eine kleine Messaging-Oberfläche: `MessagingCapable` kann Relay-Status und einen Outbox-Pending-Count anzeigen. Das ist ein Statussignal des Connectors, nicht die fachliche Confirmation-Schnittstelle.

Deshalb gilt:

- Delivery-/Outbox-Status gehört nicht in `ConfirmationView`.
- Delivery-/Outbox-Status gehört nicht in `ConfirmationCapable`.
- Der frühere Delivery-Status-Observer wurde nicht in `ConfirmationCapable` übernommen.
- Ein Connector darf intern Outbox, Retry, ACKs, Relay-Status oder Sync-Queues verwalten.
- RLS soll diese Details nur sehen, wenn eine UI sie backend-agnostisch anzeigen muss.

Für v0 definiert diese Spec keine eigene Outbox-Capability.

Wenn mehrere Connectoren später eine gemeinsame UI für ausstehende Operationen brauchen, kann RLS eine separate Sync- oder Pending-Operation-Capability definieren. Diese wäre dann allgemein für Items, Relations, Profile, Confirmations, Space-Invites oder andere Operationen und nicht an Confirmations gekoppelt.

## Implementierte RLS-Schnittstellen

Diese Spec ist in der RLS-Codeoberfläche durch folgende Typen und Guards verankert:

- `ConfirmationView` und `ConfirmationTrustLevel`,
- `ConfirmationCapable` mit `getConfirmations()` und `observeConfirmations()`,
- `ConfirmationWriterCapable` mit `issueConfirmation()` und `setConfirmationAccepted()`,
- `EncounterVerificationCapable` mit `createVerificationChallenge()`, `prepareVerificationResponse()` und `confirmVerificationResponse()`,
- Type Guards `hasConfirmations()`, `hasConfirmationWriter()` und `hasEncounterVerification()`,
- Toolkit-Hook `useConfirmations()`.

Der WoTConnector projiziert WoT-Verifikationen und WoT-Attestations als `signed-attested` Confirmations. Andere Connectoren dürfen dieselbe View mit `demo`, `local` oder `server-confirmed` liefern, wenn die darunterliegende Quelle keine portable Signatur ist.
