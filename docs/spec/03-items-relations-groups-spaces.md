# Items, Relations, Groups and Spaces

**Status:** Normativer Entwurf v0.1

Diese Spec beschreibt die technische Projektionsfläche, auf der RLS soziale oder spielerische Semantik darstellen kann, ohne sie selbst zu besitzen.

Code-Referenzen:

- `packages/data-interface/src/index.ts`
- `packages/data-interface/src/item-types.ts`
- [reaktivitaet.md](reaktivitaet.md)

## Items

Ein `Item` ist die kleinste allgemeine RLS-Einheit für darstellbare Inhalte.

Ein Item kann zum Beispiel sein:

- Task,
- Event,
- Post,
- Place,
- Profile,
- Comment,
- Reaction,
- Quest,
- Project,
- Evidence,
- Adventure- oder Campaign-View.

Diese Liste ist offen. RLS reserviert nur den technischen Vertrag, nicht die fachliche Bedeutung.

## Item-Typen

`type` steuert, wie Module ein Item interpretieren können. Bekannte Typen im Code sind aktuell:

```text
task, event, post, place, feature, profile, reaction, comment
```

Regeln:

1. Connectoren dürfen weitere `type`-Werte liefern.
2. UI-Module dürfen bekannte Typen spezialbehandeln, müssen aber unbekannte Typen robust ignorieren oder generisch anzeigen.
3. Fachliche Semantik darf nicht allein aus `type` abgeleitet werden, wenn `schema`, `data` oder `relations` genauer sind.
4. RLNP- und Game-Typen dürfen als Items erscheinen, werden aber in ihren eigenen Repositories definiert.

## Data-Felder

`data` ist ein offenes Objekt. Module können Felder interpretieren:

| Feld | Typische View |
|---|---|
| `status` | Kanban oder Workflow |
| `start` / `end` | Kalender |
| `location` | Karte |
| `content` | Feed oder Detailansicht |
| `title` | Listen, Karten, Detailansichten |

Regeln:

1. Gemeinsame UI-Felder liegen in `data`, nicht top-level.
2. Modul-spezifische Felder dürfen existieren, müssen aber andere Module nicht brechen.
3. Ein Item kann in mehreren Modulen erscheinen, wenn seine Felder dazu passen.
4. RLS-Module dürfen keine Backend-Annahmen in `data` kodieren.

## Relations

Relations verbinden Items mit Kontext.

```ts
interface Relation {
  predicate: string
  target: string
  meta?: Record<string, unknown>
}
```

### Target-Konventionen

| Prefix | Bedeutung | Beispiel |
|---|---|---|
| `item:` | Item im selben Group-/Space-Kontext | `item:task-1` |
| `space:{id}/item:` | Item in einem anderen Space | `space:garden/item:task-1` |
| `global:` | globale Identität, meistens User-ID oder DID | `global:did:key:z6Mk...` |

Regeln:

1. Relations leben in `item.relations[]`, nicht eingebettet in `data`.
2. `predicate` ist offen und darf domänenspezifisch sein.
3. `meta` darf Zusatzinformationen tragen, ersetzt aber nicht das Ziel.
4. Cross-Space-Relations müssen für UI und Connectoren als möglich behandelt werden, auch wenn nicht jeder Connector sie voll auflösen kann.

## Forward und Reverse

Forward-Relation:

```text
Task --assignedTo--> User
```

Das Item trägt die Relation selbst. Wenige, feste Beziehungen können so modelliert werden.

Reverse-Relation:

```text
Post <--commentOn-- Comment
```

Ein anderes Item zeigt auf das aktuelle Item. Wachsende Mengen wie Kommentare, Reaktionen oder Subtasks sollen als eigene Items modelliert und per `RelationCapable` geladen werden.

Regeln:

1. Wenige, feste Beziehungen dürfen Forward-Relations sein.
2. Eigenständige oder unbegrenzt wachsende Inhalte sollen eigene Items mit Reverse-Relation sein.
3. UI soll Reverse-Relations über Hooks wie `useRelatedItems()` laden, nicht durch manuelles Filtern aller Items.
4. Details zur Reaktivität stehen in [reaktivitaet.md](reaktivitaet.md).

## Groups und Spaces

RLS verwendet technisch `Group`.

```ts
interface Group {
  id: string
  name: string
  members?: string[]
  data?: Record<string, unknown>
}
```

In WoT- und RLNP-Kontexten entspricht eine `Group` häufig einem Space.

Regeln:

1. Eine Group ist ein technischer Arbeits-, Sichtbarkeits- und Mitgliedschaftskontext.
2. Eine Group ist nicht automatisch ein Projekt, Netzwerk, Verein oder soziale Organisation.
3. Ein Projekt kann als Item existieren, als eigener Space organisiert sein oder beides verbinden.
4. Netzwerke, Labels oder White-Label-Kontexte sind nicht automatisch Groups; sie können mehrere Groups oder Spaces umfassen.
5. Group-Metadaten liegen in `Group.data` und müssen additiv erweiterbar bleiben.

## Profile

Ein Profil kann als `type: "profile"`-Item erscheinen. Gleichzeitig gibt es `ProfileCapable` für eigenes Profil, öffentliche Profile und Sync.

Regeln:

1. Profil-Items sind darstellbare Projektionen.
2. `ProfileCapable` beschreibt technische Profiloperationen.
3. Kontakte und Verifikationen sind nicht dasselbe wie Profile.
4. WoT-Identität und Attestations werden nicht im RLS-Item-Modell neu definiert.

## RLNP und Real Life Game

RLNP- und Game-Objekte können über Items, Relations, Groups und Confirmations sichtbar werden.

Beispiele:

| Bedeutung | Mögliche RLS-Projektion |
|---|---|
| Quest | `Item` mit `type: "quest"` |
| QuestRun | `Item` mit `type: "quest-run"` |
| Evidence | Feld im QuestRun, Relation zu bestehendem Item oder eigenes Item |
| Project | Item, Space oder beides |
| Badge | View auf Confirmation oder Attestation |
| Campaign | View über Items, Relations, Groups und Confirmations |

Regel:

> RLS stellt diese Formen dar und macht sie bedienbar. Die soziale Bedeutung bleibt RLNP, die Spielgestaltung bleibt Real Life Game, portable signierte Wahrheit bleibt WoT Attestation.

## Nicht-Ziele

Diese Spec definiert nicht:

- den RLNP-Quest-Vertrag,
- Adventure- oder Campaign-Regeln,
- WoT-Attestation-Formate,
- Rollen- oder Safety-Policies,
- ein geschlossenes soziales Datenmodell.

RLS bleibt die technische Projektions- und Bedienoberfläche.

