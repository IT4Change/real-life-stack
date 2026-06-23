# Connector Capabilities

**Status:** Normativer Entwurf v0.1

Diese Spec beschreibt, wie RLS optionale Connector-Fähigkeiten ausdrückt. Der Core bleibt `DataInterface`; alles Weitere wird über Capability-Interfaces und Type Guards sichtbar gemacht.

Code-Referenz: `packages/data-interface/src/index.ts`

## Prinzip

Ein Connector implementiert:

1. immer `DataInterface`,
2. nur die Capabilities, die seine Datenquelle tatsächlich tragen kann,
3. keine Stub-Methoden, nur damit ein UI-Feature zufrieden ist.

UI und Hooks dürfen optionale Fähigkeiten nur nach einem Type-Guard nutzen.

```ts
if (isWritable(connector)) {
  await connector.createItem(input)
}
```

## Capability-Katalog

| Capability | Type Guard | Verantwortung |
|---|---|---|
| `ItemWriter` | `isWritable()` | Items erstellen, aktualisieren und löschen |
| `RelationCapable` | `hasRelations()` | Related Items lesen und beobachten |
| `GroupManager` | `hasGroups()` | Groups/Spaces, Current Group, Mitglieder und Einladungen verwalten |
| `Authenticatable` | `isAuthenticatable()` | Current User, Auth State, Auth Methods und Login/Logout |
| `MultiSource` | `hasMultiSource()` | mehrere Datenquellen sichtbar machen und aktive Quelle wechseln |
| `ContactManager` | `hasContacts()` | Kontakte und Kontaktstatus verwalten |
| `MessagingCapable` | `hasMessaging()` | Relay-Status und Outbox-Pending-Count anzeigen |
| `ConfirmationCapable` | `hasConfirmations()` | Confirmations lesen und beobachten |
| `ConfirmationWriterCapable` | `hasConfirmationWriter()` | Confirmations ausstellen und Annahmestatus setzen |
| `EncounterVerificationCapable` | `hasEncounterVerification()` | QR-/Begegnungsverifikation als eigenen Ablauf bereitstellen |
| `ProfileCapable` | `hasProfile()` | eigenes Profil, öffentliche Profile und Profil-Sync |
| `EventListenerCapable` | `hasEventListener()` | eingehende Connector-Ereignisse abonnieren |
| `ItemGroupCapable` | `hasItemGroups()` | Item-zu-Group-Zuordnung lesen oder verschieben |
| `AuthorizationCapable` | `hasAuthorization()` | per-Resource-Autorisierung (UCAN/RLS) für Create/Edit/Delete |

Neue Capabilities dürfen nur eingeführt werden, wenn ein UI- oder Connector-Vertrag nicht sinnvoll über bestehende Capabilities ausdrückbar ist.

## Capability-Regeln

1. Capabilities sind technische RLS-Verträge, keine sozialen Protokolle.
2. Eine Capability beschreibt, was ein Connector liefern oder ausführen kann.
3. Die Bedeutung der Daten kommt aus Item-Schemas, Relations, RLNP, Real Life Game oder WoT, nicht aus der Capability selbst.
4. Hooks müssen fehlende Capabilities explizit behandeln.
5. UI darf aus dem Vorhandensein einer Capability keine Trust-Stufe ableiten.
6. Trust-Stufen gehören zu `ConfirmationView`, nicht zur Connector-Klasse.

## AuthorizationCapable

`AuthorizationCapable` drückt aus, ob ein Actor eine Aktion auf einer Resource ausführen darf — als UCAN-förmige Capability (`{ can, with }`). Damit deckt derselbe Vertrag das WoT/UCAN-Modell (gehaltene Capability-Kette, lokal geprüft) und GraphQL-RBAC/RLS (Server-Policy, per-Row-Flags mit den Daten) ab.

```ts
type Ability = "item/create" | "item/edit" | "item/delete"
type AuthorizationResource = Item | { space: string; type?: string }

interface AuthorizationCapable {
  can(ability: Ability, resource: AuthorizationResource): boolean
}
```

Regeln:

1. `can` ist **synchron** und löst nur aus bereits geladenem Zustand auf (gehaltene UCANs, per-Row-Permission-Flags, owner-Spalte) — nie ein Netzwerk-Roundtrip. So kann die UI pro Item in einer Liste gaten, ohne N Aufrufe.
2. Die Resource ist, **worauf die Aktion zielt:** das Item bei `item/edit`/`item/delete`, der Space (+ optional Typ) bei `item/create`. `Item` hat kein Top-Level-`space` → `"space" in resource` diskriminiert.
3. **Durchsetzung** liegt im Backend/Protokoll (Relay/Peer lehnt nicht-autorisierte Writes ab; RLS lehnt ab). `can` ist eine **UI-Affordance**, keine Sicherheitsgrenze.
4. Connectors ohne Autorisierungsmodell lassen die Capability weg (`hasAuthorization()` ⇒ `false`). Die UI fällt dann über `useItemPermissions`/`useCanCreate` auf einen **creator-owns**-Default zurück (eigenes Item editier-/löschbar; jeder schreibfähige Connector darf erstellen).
5. `!isWritable()` ⇒ keine Edit/Delete/Create-Rechte.

Konzept + UX: [concepts/item-edit-delete-2026-06.md](../concepts/item-edit-delete-2026-06.md). Hooks: toolkit `useItemPermissions(item)` → `{ canEdit, canDelete }`, `useCanCreate(space, type?)`.

## FullConnector

`FullConnector` ist ein Convenience-Typ für den frühen RLS-Kern:

```ts
type FullConnector =
  DataInterface &
  ItemWriter &
  RelationCapable &
  GroupManager &
  Authenticatable &
  MultiSource
```

Regeln:

1. `FullConnector` bedeutet nicht, dass ein Connector alle heutigen RLS-Capabilities implementiert.
2. Neuere Capabilities wie `ConfirmationCapable`, `ProfileCapable`, `ContactManager`, `MessagingCapable`, `EventListenerCapable` oder `ItemGroupCapable` müssen weiterhin separat geprüft werden.
3. `FullConnector` ist kein Ziel für jeden Connector. Ein read-only Import-Connector darf nur `DataInterface` implementieren.

## BaseConnector

`BaseConnector` ist eine abstrakte Convenience-Klasse. Sie kann Default-Verhalten bereitstellen, ersetzt aber nicht die Capability-Prüfung.

Wichtige Regel:

> Ein Default auf `BaseConnector` darf nicht automatisch bedeuten, dass die Capability fachlich unterstützt wird.

Deshalb prüfen manche Type Guards, ob eine Methode wirklich überschrieben wurde. Das gilt besonders für Confirmations und Encounter Verification.

## Delivery, Outbox und Retry

Delivery, Outbox, Retry, ACKs und Sync-Queues sind Connector-Verantwortung. Sie gehören nicht in `DataInterface` und nicht in `ConfirmationView`.

Wenn mehrere Connectoren später eine gemeinsame UI für ausstehende Operationen brauchen, soll dafür eine eigene Pending-/Sync-Operation-Capability entstehen. Diese wäre dann allgemein für Items, Relations, Profile, Confirmations, Space-Invites oder andere Operationen und nicht an Confirmations gekoppelt.

## Abgrenzung

Capabilities ersetzen nicht:

- WoT-Protokollspezifikationen,
- RLNP-Operationen,
- Game-Regeln,
- Backend-Schema-Migrationen,
- Berechtigungs- oder Safety-Policies.

Sie machen nur sichtbar, welche technische Oberfläche ein Connector für RLS-UI und Hooks anbietet.

