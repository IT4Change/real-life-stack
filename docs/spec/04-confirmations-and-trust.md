# Confirmations and Trust

**Status:** Normativer Entwurf v0.2

Diese Spec beschreibt, wie Real Life Stack bestaetigte Aussagen backend-agnostisch darstellt. Sie ersetzt nicht Web-of-Trust-Attestations und definiert kein neues kryptografisches Format. Sie definiert eine UI- und Connector-Projektion.

## Kontext

RLS hatte urspruenglich `SignedClaim` und `SignedClaimCapable`. Das passte fuer den WoT-Connector, weil dort Verifikationen und Attestations tatsaechlich signiert sind.

Der Name war fuer RLS aber zu eng:

- Ein GraphQL- oder Supabase-Backend kann eine Aktion serverseitig bestaetigen, ohne eine portable Signatur zu erzeugen.
- Ein LocalConnector kann lokale Evidence oder Demo-Daten anzeigen.
- Eine Quest- oder Game-View braucht eine einheitliche Sicht auf bestaetigte Ereignisse, ohne direkt WoT-Speicherformen zu kennen.
- Eine reine Signatur-Projektion verliert Trust-Informationen wie `demo`, `local`, `server-confirmed` oder `signed-attested`.

Deshalb nutzt RLS jetzt `ConfirmationView`, `ConfirmationCapable`, `ConfirmationWriterCapable` und `EncounterVerificationCapable`.

## Begriffe

| Begriff | Bedeutung |
|---|---|
| Claim | Eine Aussage oder Einreichung. Sie kann unbestaetigt sein. |
| Confirmation | Eine bestaetigte Aussage, Handlung, Teilnahme, Completion oder Beobachtung. |
| Attestation | Eine portable, signierte Confirmation. Im WoT-Kontext typischerweise VC-JWS. |
| Recognition | Die menschenlesbare Anerkennung oder Wuerdigung, die aus einer Confirmation abgeleitet werden kann. |
| Badge | Eine visuelle Darstellung einer Confirmation oder Recognition. |

Kurz:

```text
Claim -> Confirmation -> optional Attestation -> optional Recognition/Badge
```

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

RLS definiert bewusst keine geschlossene Liste von Confirmation- oder Attestation-Faellen. Eine Attestation kann in Zukunft sehr unterschiedliche Dinge bestaetigen: eine Begegnung, einen Beitrag, eine Quest, eine Teilnahme, eine Faehigkeit, einen Ort, eine Ressource oder ein Projektergebnis.

Die fachliche Bedeutung wird offen transportiert ueber:

- `claim` als menschenlesbare Aussage,
- `schema` als optionale maschinenlesbare Semantik,
- `tags` als einfache Sortierung,
- `relations` als Bezug zu Items, Profilen, Spaces, QuestRuns, Events oder anderen Kontexten,
- `trustLevel` als Aussage ueber Beweiskraft und Quelle.

## Trust-Level

| Trust-Level | Bedeutung | Beispiele |
|---|---|---|
| `demo` | Demo-, Seed- oder Mock-Daten ohne echte Beweiskraft | MockConnector, Storybook |
| `local` | lokal gespeicherte Aussage oder Evidence ohne externe Bestaetigung | LocalConnector, Offline-Entwurf |
| `server-confirmed` | ein Server, Host, Space oder Backend hat die Aussage bestaetigt | Supabase, GraphQL, REST |
| `signed-attested` | eine portable Signatur belegt die Aussage | WoT-Attestation, VC-JWS |

UI-Komponenten MUESSEN diese Level ehrlich behandeln. Eine serverseitige Bestaetigung darf nicht wie eine portable signierte Attestation dargestellt werden.

## Abgrenzung zum frueheren SignedClaim-Vertrag

`SignedClaim` und `SignedClaimCapable` beschrieben den frueheren engen Claim-/Attestation-Vertrag in RLS. Sie werden nicht als dauerhafte Legacy-Projektion konserviert. RLS hat den Vertrag durch Confirmation-Semantik ersetzt.

RLNP/Game-Views duerfen nicht direkt voraussetzen, dass jede Confirmation eine portable signierte WoT-Attestation ist.

Die Migration hat die zuvor vermischten Verantwortlichkeiten getrennt:

1. `ConfirmationView` ersetzt die alte Claim-Projektion.
2. `ConfirmationCapable` liest und beobachtet Confirmations.
3. `ConfirmationWriterCapable` erstellt Confirmations und setzt Annahmestatus.
4. `EncounterVerificationCapable` kapselt QR-/Begegnungsverifikation.
5. Delivery-/Outbox-Status bleibt ausserhalb der Confirmation-Schnittstelle.

Eine dauerhafte Kompatibilitaetsprojektion von der frueheren Signed-Claim-Form nach `ConfirmationView` ist nicht Ziel der Spec.

Moegliches Mapping fuer bestehende WoT-Daten:

| Quelle | ConfirmationView |
|---|---|
| Verification | `trustLevel: "signed-attested"`, `schema: "wot:verification"` |
| WoT Attestation | `trustLevel: "signed-attested"`, optionales Attestation-Schema |
| Quest-Completion-Attestation | `trustLevel: "signed-attested"`, Relation zum QuestRun |

Moegliches Mapping fuer serverseitige Backends:

| Quelle | ConfirmationView |
|---|---|
| Server bestaetigt QuestRun | `trustLevel: "server-confirmed"`, Relation zum QuestRun |
| Host bestaetigt Teilnahme | `trustLevel: "server-confirmed"`, Relation zum Event |
| importierte externe Bescheinigung | Trust-Level je nach Quelle, optionales externes Schema |

## UI-Regeln

1. Eine Confirmation ist keine Bewertung einer Person.
2. Eine Confirmation ist kontextbezogen und soll den Anlass sichtbar machen.
3. Trust-Level duerfen in der UI verdichtet werden, aber nicht verfaelscht werden.
4. Badges und Entwicklungskarten duerfen aus Confirmations abgeleitet werden.
5. Eine nicht akzeptierte oder private Confirmation darf nicht ungefragt oeffentlich angezeigt werden.
6. UI-Module duerfen nicht voraussetzen, dass `signed-attested` verfuegbar ist.

## Connector-Regeln

Ein Connector, der Confirmations bereitstellt, MUSS fuer jede Confirmation ein Trust-Level liefern.

Ein Connector DARF Confirmations aus unterschiedlichen Quellen normalisieren:

- WoT-VC-JWS,
- serverseitige Rows,
- lokale Evidence,
- importierte externe Daten,
- Demo-Daten.

Ein Connector DARF nur dann `signed-attested` setzen, wenn die zugrunde liegende Aussage kryptografisch signiert und verifizierbar ist.

## Delivery, Outbox und Sync-Status

Delivery und Outbox sind Connector-Verantwortung. Sie beschreiben den Transport- oder Sync-Zustand einer lokalen Operation, nicht die fachliche Bedeutung einer Confirmation.

RLS hat heute bereits eine kleine Messaging-Oberflaeche: `MessagingCapable` kann Relay-Status und einen Outbox-Pending-Count anzeigen. Das ist ein Statussignal des Connectors, nicht die fachliche Confirmation-Schnittstelle.

Deshalb gilt:

- Delivery-/Outbox-Status gehoert nicht in `ConfirmationView`.
- Delivery-/Outbox-Status gehoert nicht in `ConfirmationCapable`.
- Der fruehere Delivery-Status-Observer wurde nicht in `ConfirmationCapable` uebernommen.
- Ein Connector darf intern Outbox, Retry, ACKs, Relay-Status oder Sync-Queues verwalten.
- RLS soll diese Details nur sehen, wenn eine UI sie backend-agnostisch anzeigen muss.

Fuer v0 definiert diese Spec keine eigene Outbox-Capability.

Wenn mehrere Connectoren spaeter eine gemeinsame UI fuer ausstehende Operationen brauchen, kann RLS eine separate Sync- oder Pending-Operation-Capability definieren. Diese waere dann allgemein fuer Items, Relations, Profile, Confirmations, Space-Invites oder andere Operationen und nicht an Confirmations gekoppelt.

## Implementierte RLS-Schnittstellen

Diese Spec ist in der RLS-Codeoberflaeche durch folgende Typen und Guards verankert:

- `ConfirmationView` und `ConfirmationTrustLevel`,
- `ConfirmationCapable` mit `getConfirmations()` und `observeConfirmations()`,
- `ConfirmationWriterCapable` mit `issueConfirmation()` und `setConfirmationAccepted()`,
- `EncounterVerificationCapable` mit `createVerificationChallenge()`, `prepareVerificationResponse()` und `confirmVerificationResponse()`,
- Type Guards `hasConfirmations()`, `hasConfirmationWriter()` und `hasEncounterVerification()`,
- Toolkit-Hook `useConfirmations()`.

Der WoTConnector projiziert WoT-Verifikationen und WoT-Attestations als `signed-attested` Confirmations. Andere Connectoren duerfen dieselbe View mit `demo`, `local` oder `server-confirmed` liefern, wenn die darunterliegende Quelle keine portable Signatur ist.
