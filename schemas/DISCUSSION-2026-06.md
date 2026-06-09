# Diskussionsgrundlage: Schema-Komposition und Online-Treffen

**Stand:** 2026-06-09 — Vorbereitung Mittwoch
**Beteiligte:** Anton, Sebastian, Claude

Zwei offene Designfragen sollen am Mittwoch besprochen werden. Diese Datei stellt sie nebeneinander und zeigt jeweils konkrete Optionen — keine Spec, keine Vorentscheidung.

---

## Frage 1 — Wie modellieren wir „dieses Item ist ein Event UND ein Ort"?

### Der Anwendungsfall

Ein „Permakultur-Workshop in der Markthalle" hat sowohl

- **Zeitbezug** (Start, Ende) → soll im **Kalender** erscheinen
- **Ortsbezug** (Position, Adresse) → soll auf der **Karte** erscheinen

Wir wollen dafür **ein** Item, nicht zwei.

### Drei Optionen

#### Option A — Typ-basiert (am einfachsten)

Jedes Item hat **genau einen Typ**. Welche Felder erlaubt sind, ergibt sich aus dem Typ.

```json
{
  "id": "abc",
  "type": "event",
  "data": {
    "title": "Permakultur-Workshop",
    "start": "2026-07-15T18:00",
    "position": { "type": "Point", "coordinates": [13.4, 52.5] },
    "address": "Markthalle 7"
  }
}
```

**Modul-Sicht:** Map filtert auf `data.position`-Vorhandensein, Calendar auf `data.start`. Funktioniert auch.

- ✅ Einfach — `type` ist eine Zeichenkette, jeder versteht es sofort
- ✅ Kein neues Konzept
- ❌ Was ist „der" Typ eines Workshops in der Markthalle? Event? Place? Beides? Willkür
- ❌ Felder eines Items sind nicht formal an Typ gebunden — ein „event" kann ungeprüft `position` haben oder nicht
- ❌ Schemas pro Typ wachsen monolithisch (Event-Schema kennt schon Place-Felder)

#### Option B — Liste aktiver Schemas (mittel)

Item hat ein Feld `schemas: string[]`. Jeder Eintrag steht für ein Vokabular mit definierten Feldern. Die Felder mehrerer Schemas liegen flach in `data`.

```json
{
  "id": "abc",
  "schemas": ["base", "event", "place"],
  "data": {
    "title": "Permakultur-Workshop",
    "start": "2026-07-15T18:00",
    "position": { "type": "Point", "coordinates": [13.4, 52.5] },
    "address": "Markthalle 7"
  }
}
```

Schema-Validation: Item ist nur gültig, wenn alle in `schemas` genannten Vokabulare einzeln gegen `data` validieren.

- ✅ Komposition explizit sichtbar
- ✅ Schemas bleiben klein und fokussiert (Event hat nur Zeit-Felder, Place nur Orts-Felder)
- ✅ Felder eines Items sind formal definiert
- ✅ Keine externen URLs, keine `@`-Syntax — ist „normales" JSON
- ✓ `type` kann zusätzlich als UI-Hint bleiben („was ist das Hauptsächlich"), strukturell unnötig
- ❌ Neues Konzept im Item — `schemas` muss kommuniziert werden

#### Option C — JSON-LD `@context` (am ausführlichsten)

Wie B, aber `schemas` heißt `@context` und enthält URLs zu maschinen-lesbaren Vokabularien (W3C-Standard, identisches Pattern wie WoT-Attestations).

```json
{
  "id": "abc",
  "@context": [
    "https://real-life-stack.org/vocab/base/v1",
    "https://real-life-stack.org/vocab/event/v1",
    "https://real-life-stack.org/vocab/place/v1"
  ],
  "type": ["Event", "Place"],
  "data": {
    "title": "Permakultur-Workshop",
    "start": "2026-07-15T18:00",
    "position": { "type": "Point", "coordinates": [13.4, 52.5] },
    "address": "Markthalle 7"
  }
}
```

- ✅ Konsistent mit WoT-Welt (eine Konvention für RLS und WoT)
- ✅ Maschinen-lesbar im Linked-Data-Sinne (RDF-Tooling, externe Konsumenten verstehen das Item)
- ✅ Vocab-Versionierung über URL-Pfad (`/v1`, `/v2`)
- ❌ JSON-LD-Komplexität (`@context`, `@id`, `@type`, `xsd:`-Namespaces): mehr Konzepte für Code-Reader
- ❌ Externe URL-Auflösung (oder Lokales Caching) nötig, damit JSON-LD-Tooling sinnvoll wird
- ❌ Felder mit gleichem Namen, aber unterschiedlicher Semantik aus zwei Vokabularien müssen via Aliasing aufgelöst werden — extra Lernkurve

### Vergleich auf einen Blick

| | A: Typ | B: schemas[] | C: @context |
|---|---|---|---|
| Komposition möglich? | Nein, indirekt | Ja, explizit | Ja, explizit |
| Standardisiert (extern)? | Nein | Nein | Ja (W3C JSON-LD) |
| Aufwand fürs Lesen | Minimal | Niedrig | Mittel |
| Standard-Tooling | Custom | Custom (JSON-Schema) | JSON-LD-Tools, RDF |
| Konsistent mit WoT? | Nein | Teilweise | Ja |
| Späterer Wechsel A → C | Bruch | Sanft (Feld umbenennen) | — |

### Was machen wir am Mittwoch?

**Vorschlag zur Diskussion:** Mit **Option B** starten. Konzeptionell wie C, aber ohne JSON-LD-Sprech. Wenn später die Interop mit WoT/Linked-Data wichtig wird, ist der Wechsel auf C eine Feldumbenennung (`schemas` → `@context`, optional URLs statt Kurz-Namen).

---

## Frage 2 — Hat ein Online-Treffen einen Ort?

### Stand heute

Im `LocationWidget` (Sebastian) wechseln User zwischen „Vor Ort" und „Online":

- **Vor Ort:** Adresse und optional Position auf der Karte
- **Online:** Meeting-Link (z.B. Zoom, Jitsi)

Beides liegt im selben Widget unter einem Toggle. Im aktuellen `WidgetData` (nach Refactor):

```ts
{
  address?: string         // Vor-Ort-Modus
  position?: GeoJSONPoint  // Vor-Ort-Modus
  locationName?: string    // Vor-Ort-Modus
  meetingLink?: string     // Online-Modus
}
```

### Die konzeptionelle Reibung

Im Vokabular-Sinne:

- **`place/v1`** modelliert geografische Verortung — Position, Adresse, benannter Ort. Etwas, das auf der Karte erscheinen kann.
- **Ein Zoom-Link ist kein geografischer Ort.** Er ist eine Verbindung zu einem digitalen Raum.

Wenn `meetingLink` in `place/v1` läge, wäre die Bedeutung des Vokabulars uneinheitlich. Die Folge wäre auch: ein Online-Event mit `meetingLink` würde das `place`-Schema erfüllen und wäre damit „karten-fähig" — obwohl es nichts zum Anzeigen gibt.

### Drei Optionen

#### Option I — `meetingLink` ins `event`-Vokabular (aktueller Stand der Schemas)

```text
event/v1: start, end, duration, rrule, meetingLink ←
place/v1: position, address, locationName
```

Konsequenz: Auch ein Workshop, der nur in der Markthalle ist (kein Online-Anteil), trägt das Event-Vokabular mit `meetingLink: undefined`. Online-only-Events tragen nur `event`, kein `place`.

- ✅ Saubere Trennung: place ist immer geografisch
- ❌ Konzeptionell ist `meetingLink` keine Event-Eigenschaft, sondern eine „Wo findet das statt"-Eigenschaft
- ❌ Sebastians LocationWidget-UI (ein Eingabefeld mit Toggle) kollidiert mit dieser Modellierung

#### Option II — Eigenes `meeting`-Vokabular für Online

```text
event/v1:   start, end, duration, rrule
place/v1:   position, address, locationName        ← geografisch, „Map-fähig"
meeting/v1: meetingLink, platform                  ← digital, NICHT „Map-fähig"
```

Items haben optional `place` ODER `meeting` ODER beides (hybrid: vor Ort + Live-Stream).

- ✅ Beide Konzepte präzise getrennt
- ✅ Map filtert sauber auf `place`; ein Online-Meeting taucht nicht auf der Karte auf
- ✅ Hybrid (vor Ort + Live-Stream) ist natürlich
- ❌ Widget-UI muss zwei separate Eingaben anbieten, oder weiter mit Toggle und intern auf zwei Vokabulare schreiben

#### Option III — `place`-Vokabular um digitale „Orte" erweitern

```text
place/v1: position?, address?, locationName?, meetingLink?
```

Eines von position, address, meetingLink muss da sein. Map filtert nicht auf place selbst, sondern auf `position`-Vorhandensein.

- ✅ Widget-UI bleibt wie gebaut
- ❌ Die Aussage „Item hat `place`" verliert ihre Bedeutung (kann geografisch ODER digital sein)
- ❌ Map-Filter wird verkomplizierender („hat `place` UND `position`")

### Was machen wir am Mittwoch?

**Vorschlag zur Diskussion:** **Option II** — eigene Vokabulare für `place` (geografisch) und `meeting` (digital). Sebastians Widget-UI bleibt für User unverändert (ein Eingabe-Bereich für „Wo"), schreibt aber intern in das passende Vokabular. Map filtert klar auf `place` mit Position.

---

## Frage 3 — Wie identifizieren wir Nutzer (`createdBy`, `assignee`)?

### Der Anwendungsfall

In jedem Item steht `createdBy` (wer hat es angelegt). In Tasks steht `assignee` (wer ist zuständig). Beides muss eine Person eindeutig identifizieren.

RLS soll **backend-agnostisch** bleiben — ein WoT-Connector identifiziert per **DID**, ein klassischer SaaS-Connector per **E-Mail-Adresse** oder **opaker User-ID**, ein Directus per **UUID**.

### Drei Optionen

#### Option α — DID-Pflicht im Schema

```json
"createdBy": {
  "type": "string",
  "pattern": "^did:[a-z0-9]+:.+"
}
```

- ✅ Konsistent mit WoT-Welt, sofortige Trust-Verbindung
- ❌ Bricht jeden Connector, der keine DIDs vergibt
- ❌ Nicht backend-agnostisch — gegen RLS-Architekturprinzip

#### Option β — Beliebiger String, Format ist Connector-Sache (aktuell)

```json
"createdBy": {
  "type": "string",
  "minLength": 1
}
```

Beispiele:
- `did:key:z6Mki…` (WoT-Connector)
- `lena@example.com` (Mock-/Local-Connector)
- `user-42` (klassisches Backend mit numerischer ID)

- ✅ Backend-agnostisch
- ✅ Bestehende Connectoren laufen ohne Schema-Anpassung
- ❌ Items aus verschiedenen Connectoren tragen Identifier in verschiedenen Formaten — Vergleich ist Connector-übergreifend nicht trivial
- ❌ Keine Aussage über Format-Validität durch Schema (z.B. `"foo"` ist gültig)

#### Option γ — Typisiertes Identitäts-Objekt

```json
"createdBy": {
  "scheme": "did" | "email" | "userId" | "urn",
  "value": "z6MkiTBz…"
}
```

- ✅ Explizit über die Identifizierungs-Methode
- ✅ Verschiedene Connectoren können sich auf gemeinsame Schemes einigen, ohne den Wert zu erraten
- ❌ Schwerer zu schreiben (zwei Felder statt String), mehr Komplexität
- ❌ Bricht jedes bestehende Item bei der Migration

### Was machen wir am Mittwoch?

**Vorschlag zur Diskussion:** **Option β** behalten (aktueller Stand). Format ist eine **Connector-Vereinbarung**, nicht eine Schema-Pflicht. Hooks und UI können später eine helper-Schicht bekommen, die Identitäten normalisiert (Display-Name aus Lookup, Trust-Check usw.) — das ist eine separate Capability, kein Item-Schema-Thema.

---

## Was wir am Mittwoch entscheiden sollten

1. **Komposition:** B (`schemas: string[]`) oder C (`@context`-URLs)? → bestimmt wie ein Item aussieht
2. **Online-Treffen:** I, II oder III? → bestimmt wo `meetingLink` lebt
3. **Identifier-Format:** α, β oder γ? → bestimmt ob das Schema die Form von `createdBy`/`assignee` festlegt
4. Konsequenzen für `LocationWidget`-Refactor: bleibt UI gleich? Wird Widget aufgespalten?

Keines davon ist eine sofortige Code-Entscheidung — der aktuelle Refactor läuft mit C + I + β. Wechsel auf B oder II ist eine kleine Schema-Umbenennung, kein Architektur-Bruch.
