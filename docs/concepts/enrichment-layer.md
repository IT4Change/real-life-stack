# Enrichment Layer — Hybrid-Ansatz

## Kontext

Wir sind uns einig:
- `myReaction` und `reactions` gehören nicht ins CRDT (per-User-State bzw. Count-Konflikte)
- Die Werte müssen zur Laufzeit berechnet werden

Die Frage war: wo? Dein Vorschlag (Connector-Enrichment) und Antons Vorschlag (Hook-Berechnung) haben beide Stärken — aber in unterschiedlichen Szenarien.

## Das Reaktivitäts-Problem bei Connector-Enrichment

Dein Ansatz funktioniert hervorragend für GraphQL. Aber für den WoT-Connector (CRDT) entsteht ein Problem:

Wenn die Counts am Item angereichert werden, muss der Connector bei **jeder Änderung eines Reaction-Items** das **Ziel-Item neu ausliefern** — mit aktualisierten Counts. Dafür braucht der Connector Dependency-Tracking: "Reaction auf Post X erstellt → Post X neu enrichen → Observable für Post X neu feuern, obwohl sich Post X selbst nicht geändert hat."

Das macht den Connector zur State Machine. Im Hook-Ansatz ist das trivial — `useRelatedItems` subscribt auf Änderungen, `useMemo` rechnet neu. Das React-System übernimmt das Dependency-Tracking automatisch.

## Wo jeder Ansatz glänzt

| | Hook-Berechnung | Connector-Enrichment |
|---|---|---|
| **Reaktivität** | Trivial — Observable + useMemo | Komplex — Dependency-Tracking nötig |
| **GraphQL-Effizienz** | Schlecht — alle Reaction-Items zum Client | Gut — SQL COUNT() auf Server |
| **N+1 Subscriptions** | Ja — pro Post ein useRelatedItems | Nein — Counts direkt am Item |
| **Layout Shifts** | Ja — Counts laden nach | Nein — synchron verfügbar |
| **Connector-Komplexität** | Null | ~10 Zeilen + Invalidierungslogik |
| **CRDT-kompatibel** | Perfekt | Funktioniert, aber aufwändig |

**Hook-Berechnung** ist ideal für **Local-First / CRDT**: Alle Daten lokal im RAM, Observables und useMemo sind da, kein Dependency-Tracking nötig.

**Connector-Enrichment** ist ideal für **Client-Server / GraphQL**: Server aggregiert effizient (SQL COUNT), pusht enriched Items via Subscription, Client rendert sofort.

## Lösung: Optionale Enrichment-Felder + Smart Hook

Die Enrichment-Felder sind **optional** im Interface:

```typescript
// item-types.ts
interface Reactable {
  reactions?: Record<string, number>  // optional
  myReaction?: string                 // optional
}
```

Ein Smart Hook prüft: Hat der Connector Counts geliefert? Dann nutze sie. Sonst: berechne sie selbst.

```typescript
function useReactionCounts(item: Item) {
  const enriched = item.data?.reactions != null

  const { data: reactionItems } = useRelatedItems(
    item.id, "reactsTo",
    { direction: "to", enabled: !enriched }  // NUR wenn nötig
  )
  const { data: currentUser } = useCurrentUser()

  return useMemo(() => {
    if (enriched) {
      return {
        counts: item.data.reactions as Record<string, number>,
        myReaction: item.data.myReaction as string | undefined,
      }
    }
    const counts: Record<string, number> = {}
    let myReaction: string | undefined
    for (const r of reactionItems ?? []) {
      const emoji = r.data.emoji as string
      counts[emoji] = (counts[emoji] ?? 0) + 1
      if (r.createdBy === currentUser?.id) myReaction = emoji
    }
    return { counts, myReaction }
  }, [enriched, item.data, reactionItems, currentUser?.id])
}
```

`enabled: !enriched` bedeutet: wenn der Connector Counts liefert, wird kein `useRelatedItems`-Aufruf gemacht. Kein N+1, kein Layout Shift. Wenn der Connector keine Counts liefert, greift der Hook-Fallback.

## Was jeder Connector macht

| Connector | Enrichment? | Reaktivität |
|---|---|---|
| **GraphQL** | Ja — Server enriched via SQL COUNT | Server pusht via Subscription |
| **WoT (CRDT)** | Nein — Hook berechnet | Observable + useMemo |
| **Local** | Nein — Hook berechnet | Observable + useMemo |
| **Mock** | Nein — Hook berechnet | Observable + useMemo |

## Warum das funktioniert

- **Kein Connector wird gezwungen** Enrichment zu implementieren
- **GraphQL bekommt** die effiziente Server-Aggregation ohne Rohdaten-Transfer
- **CRDT bekommt** die einfache reaktive Hook-Berechnung ohne Dependency-Tracking
- **Die UI ist identisch** — `useReactionCounts(item)` funktioniert in beiden Fällen
- **Beide sind reaktiv**: GraphQL über Subscriptions, CRDT über Observables

## Was sich an den Interfaces ändert

`Reactable` und `Commentable` bleiben, aber die Felder werden als **optional** markiert. Die Reaction-Items und Comment-Items bleiben genau so wie sie definiert sind.
