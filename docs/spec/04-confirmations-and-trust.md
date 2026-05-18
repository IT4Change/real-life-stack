# Confirmations and Trust

**Status:** Normativer Entwurf v0.1

Diese Spec beschreibt, wie Real Life Stack bestaetigte Aussagen backend-agnostisch darstellen soll. Sie ersetzt nicht Web-of-Trust-Attestations und definiert kein neues kryptografisches Format. Sie definiert eine UI- und Connector-Projektion.

## Problem

RLS hat aktuell `SignedClaim` und `SignedClaimCapable`. Das funktioniert fuer den WoT-Connector, weil dort Verifikationen und Attestations tatsaechlich signiert sind.

Der Name ist fuer RLS aber zu eng:

- Ein GraphQL- oder Supabase-Backend kann eine Aktion serverseitig bestaetigen, ohne eine portable Signatur zu erzeugen.
- Ein LocalConnector kann lokale Evidence oder Demo-Daten anzeigen.
- Eine Quest- oder Game-View braucht eine einheitliche Sicht auf bestaetigte Ereignisse, ohne direkt WoT-Speicherformen zu kennen.
- Die aktuelle `SignedClaim`-Projektion verliert Trust-Informationen wie `demo`, `local`, `server-confirmed` oder `signed-attested`.

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

RLS-Views SOLLTEN mittelfristig gegen eine neutrale `ConfirmationView` arbeiten.

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

## Relation zum bestehenden SignedClaim-Vertrag

`SignedClaim` und `SignedClaimCapable` beschreiben den aktuellen engen Claim-/Attestation-Vertrag in RLS. Die neue Spec muss keine Legacy-Datenkompatibilitaet erhalten. RLS soll den Vertrag daher konsequent durch Confirmation-Semantik ersetzen.

Neue RLNP/Game-Views SOLLTEN nicht direkt voraussetzen, dass jede Confirmation ein `SignedClaim` ist.

Die Code-Migration SOLLTE nicht `SignedClaim` erweitern, sondern die derzeit vermischten Verantwortlichkeiten schneiden:

1. `SignedClaim` durch `ConfirmationView` ersetzen.
2. `SignedClaimCapable` durch `ConfirmationCapable` ersetzen.
3. QR-/Begegnungsverifikation als eigene Verification-Capability ausdruecken.
4. Delivery-/Outbox-Status aus der Confirmation-Schnittstelle entfernen.

Eine dauerhafte Kompatibilitaetsprojektion von `SignedClaim` nach `ConfirmationView` ist nicht Ziel der Spec.

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
- Das bestehende `observeDeliveryStatuses()` auf `SignedClaimCapable` SOLLTE bei der Ersetzung durch `ConfirmationCapable` nicht uebernommen werden.
- Ein Connector darf intern Outbox, Retry, ACKs, Relay-Status oder Sync-Queues verwalten.
- RLS soll diese Details nur sehen, wenn eine UI sie backend-agnostisch anzeigen muss.

Fuer v0 definiert diese Spec keine eigene Outbox-Capability.

Wenn mehrere Connectoren spaeter eine gemeinsame UI fuer ausstehende Operationen brauchen, kann RLS eine separate Sync- oder Pending-Operation-Capability definieren. Diese waere dann allgemein fuer Items, Relations, Profile, Confirmations, Space-Invites oder andere Operationen und nicht an Confirmations gekoppelt.

## Implementierungsrichtung

Diese Spec legt den neutralen Begriff und die Zielprojektion fest. Die naechste Code-Arbeit SOLLTE:

- `ConfirmationView` und `ConfirmationTrustLevel` in `data-interface` einfuehren,
- `ConfirmationCapable` als generische Capability definieren,
- QR-Verifikation aus dem generischen Confirmation-Vertrag herausloesen,
- `useClaims()` in Richtung `useConfirmations()` ersetzen,
- den WoTConnector so anpassen, dass WoT-Verifikationen und WoT-Attestations als Confirmations erscheinen,
- Delivery-/Outbox-Status im WoTConnector halten und nicht in `ConfirmationView` uebernehmen.

Diese Arbeit sollte in einem separaten Code-Slice mit Conformance-Tests erfolgen.
