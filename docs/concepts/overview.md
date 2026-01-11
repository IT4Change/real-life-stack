# Real Life Stack – Konzept-Übersicht

## Vision

**Selbstorganisation leicht gemacht** – Werkzeuge für echte Zusammenarbeit, die Gruppen dabei helfen, gemeinsam vor Ort etwas zu bewegen.

Real Life Stack ist ein modularer Frontend-Baukasten für lokale Vernetzung. Communities können damit eigene Apps bereitstellen, ohne von zentralen Plattformen abhängig zu sein.

---

## Architektur

```
┌──────────────────────────────────────────────────────────┐
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐  │
│  │Kalender│ │ Karte  │ │  Feed  │ │Gruppen │ │Profile │  │
│  └────────┘ └────────┘ └────────┘ └────────┘ └────────┘  │
│                                                          │
│                       App-Shell                          │
├──────────────────────────────────────────────────────────┤
│              Daten- & Identitätsschnittstelle            │
├──────────────────────────────────────────────────────────┤
│                   Connector-Schicht                      │
├──────────────────────────────────────────────────────────┤
│                       Backend                            │
│            (REST / Local-first / P2P / E2EE)             │
└──────────────────────────────────────────────────────────┘
```

### Schichten im Detail

**App-Shell + UI-Module**
Die oberste Schicht enthält die App-Shell als Container und die austauschbaren UI-Module (Kalender, Karte, Feed, Gruppen, Profile). Jede Community wählt die Module, die sie braucht.

**Daten- & Identitätsschnittstelle**
Einheitliche API für Datenmodelle (Posts, Events, Orte, Profile) und Identität (Login, Vertrauensbeziehungen). Die Module kennen nur diese Schnittstelle, nicht das Backend.

**Connector-Schicht**
Adapter-Pattern für verschiedene Backend-Anbindungen. Referenz-Implementierungen für gängige Setups, erweiterbar durch die Community.

**Backend-Optionen**
- **REST API** – Klassischer Server, einfacher Einstieg
- **Local-first** – Automerge CRDT, Offline-fähig
- **P2P** – Vollständig dezentral
- **E2EE** – Ende-zu-Ende-verschlüsselt

---

## Zielgruppen (Personas)

### 1. Die organisierte Nachbarschaft
> "Wir wollen wissen, was in unserem Kiez passiert"

- Nachbarschaftsnetzwerke
- Quartiersinitiativen
- Urban-Gardening-Gruppen

**Bedürfnisse:** Lokale Events finden, Nachbarn kennenlernen, gemeinsame Aktionen planen

### 2. Der Gemeinschaftsgarten
> "Wir koordinieren Gießdienste und Ernte"

- Gemeinschaftsgärten
- Solawis (Solidarische Landwirtschaft)
- Food-Coops

**Bedürfnisse:** Aufgabenverteilung, Ressourcen teilen, Termine koordinieren

### 3. Die Vernetzerin
> "Ich bringe Menschen und Initiativen zusammen"

- Aktivist:innen
- Community-Manager
- Lokale Multiplikatoren

**Bedürfnisse:** Überblick über Initiativen, Kontakte vermitteln, Synergien schaffen

### 4. Das Tauschnetzwerk
> "Wir teilen, was wir haben"

- Sharing-Communities
- Repair-Cafés
- Tausch- und Leihplattformen
- Foodsharing-Initiativen

**Bedürfnisse:** Ressourcen anbieten/suchen, Vertrauen aufbauen, lokale Matches finden

---

## Alleinstellungsmerkmale (USPs)

### 1. Real Life Fokus
Optimiert für echte Begegnungen, nicht für Engagement-Metriken. Keine Likes, keine unendlichen Feeds – sondern Verabredungen und gemeinsame Aktionen.

### 2. Modular & Anpassbar
Jede Community wählt die Module, die sie braucht. Kein One-Size-Fits-All, sondern Baukasten-Prinzip.

### 3. Backend-agnostisch
Die Connector-Architektur erlaubt verschiedene Backends. Von einfachem REST-Server bis zu vollständig dezentralem P2P.

### 4. Web of Trust Integration
Vertrauen entsteht durch reale Begegnungen. QR-Code-Verifizierung bei persönlichen Treffen baut ein Netzwerk gegenseitiger Bestätigungen auf.

### 5. Self-Hosting oder SaaS
Communities können selbst hosten (volle Kontrolle) oder einen gehosteten Service nutzen (einfacher Einstieg).

---

## MVP-Module

### Karte
Lokale Orte, Ressourcen und Aktivitäten auf einer Karte visualisieren.
- Pins für Events, Orte, Angebote
- Cluster-Ansicht bei vielen Einträgen
- Filter nach Kategorien

### Kalender
Events planen und Termine koordinieren.
- Monats-/Wochen-/Tagesansicht
- Einladungen und Zu-/Absagen
- Integration mit externen Kalendern (iCal)

### Feed
Aktivitäten-Stream aus der Community.
- Chronologische Darstellung
- Verschiedene Post-Typen (Text, Event, Anfrage)
- Keine algorithmische Sortierung

### Profile
Nutzerprofile mit Fähigkeiten und Interessen.
- Selbstbeschreibung
- Skills und Angebote
- Vertrauensbeziehungen (Web of Trust)

---

## Aktivierungskreislauf

```
Vorschlagen → Planen → Umsetzen → Vertrauen aufbauen → Erfolge teilen → ↩
```

Real Life Stack unterstützt den gesamten Kreislauf:
1. **Vorschlagen** – Ideen im Feed teilen
2. **Planen** – Events im Kalender anlegen
3. **Umsetzen** – Vor Ort zusammenkommen
4. **Vertrauen aufbauen** – Gegenseitige Verifizierung nach dem Treffen
5. **Erfolge teilen** – Dokumentation und Inspiration für andere

---

## Nächste Schritte

### Connector-API definieren
Einheitliche Schnittstelle zwischen UI-Modulen und Backend. Dokumentation der Datenmodelle und Methoden.

### Modul-Spezifikationen
Detaillierte Specs für jedes MVP-Modul:
- Datenmodell
- UI-Komponenten
- Benutzerinteraktionen
- API-Anforderungen

### Referenz-Backend
Einfache REST-Implementierung als Startpunkt für Communities, die schnell loslegen wollen.

### Web of Trust Protokoll
Formalisierung des Vertrauensprotokolls:
- did:key Identitäten
- JWS-Signaturen für Vertrauensbeziehungen
- Propagation im Netzwerk

---

## FAQ

### Was ist der Unterschied zwischen Real Life Stack und Web of Trust?

**Real Life Stack** ist der Frontend-Baukasten – die sichtbare App mit Karte, Kalender, Feed und anderen Modulen. **Web of Trust** ist das darunterliegende Protokoll für dezentrale Identität und Vertrauensbeziehungen. Real Life Stack kann Web of Trust als Backend nutzen, funktioniert aber auch mit anderen Backends.

### Brauche ich Programmierkenntnisse?

Für den **Einstieg nicht**. Die White-Label-App kann ohne Code angepasst werden (Farben, Logo, Module auswählen). Für tiefere Anpassungen oder eigene Module sind Grundkenntnisse in React/TypeScript hilfreich.

### Wie unterscheidet sich das von Facebook-Gruppen oder WhatsApp?

- **Keine Algorithmen** – Chronologischer Feed statt Engagement-Optimierung
- **Keine Werbung** – Kein Geschäftsmodell, das auf Aufmerksamkeit basiert
- **Datenhoheit** – Eure Daten bleiben bei euch (Self-Hosting möglich)
- **Fokus auf Handeln** – Optimiert für Verabredungen und gemeinsame Aktionen, nicht für endloses Scrollen

### Kann ich Real Life Stack für meine Community nutzen?

Ja! Es gibt zwei Wege:
1. **Self-Hosting** – Volle Kontrolle, ihr betreibt alles selbst
2. **Gehosteter Service** – Wir stellen die Infrastruktur bereit (in Planung)

### Ist das wirklich kostenlos?

Real Life Stack ist **Open Source** (MIT-Lizenz). Der Code ist frei verfügbar und kann ohne Einschränkungen genutzt werden. Bei Self-Hosting fallen nur eure eigenen Server-Kosten an.

### Wie funktioniert das Web of Trust?

Vertrauen entsteht durch **reale Begegnungen**:
1. Zwei Personen treffen sich vor Ort
2. Sie scannen gegenseitig ihre QR-Codes
3. Beide bestätigen die Begegnung digital (JWS-Signatur)
4. Diese Vertrauensbeziehung ist im Netzwerk sichtbar

So entsteht ein Netzwerk gegenseitiger Bestätigungen – ohne zentrale Instanz, die Identitäten verifiziert.

### Welche Backend-Optionen gibt es?

| Option | Beschreibung | Geeignet für |
|--------|--------------|--------------|
| **REST API** | Klassischer Server | Einfacher Einstieg, bekannte Technologie |
| **Local-first** | Automerge CRDT | Offline-Fähigkeit, schnelle Synchronisation |
| **P2P** | Peer-to-Peer | Maximale Dezentralität, keine Server nötig |
| **E2EE** | Ende-zu-Ende-Verschlüsselung | Sensible Daten, hohe Privatsphäre |

### Kann ich eigene Module entwickeln?

Ja! Die modulare Architektur ist genau dafür gedacht. Module kommunizieren über die Daten- & Identitätsschnittstelle mit dem Backend. Dokumentation und Beispiele folgen.

### Wie kann ich mitmachen?

- **Code beitragen** – [GitHub Repository](https://github.com/IT4Change/real-life-stack)
- **Feedback geben** – Issues erstellen oder Discussions nutzen
- **Testen** – Die Demo ausprobieren und berichten
- **Verbreiten** – Anderen Communities davon erzählen

---

## Weiterführende Dokumente

- [Module: Karte](../modules/map.md)
- [Module: Kalender](../modules/calendar.md)
- [Module: Feed](../modules/feed.md)
- [Forschungsprojekt: Web of Trust](https://github.com/IT4Change/web-of-trust)

---

*Gemeinsam gestalten wir die Zukunft – lokal vernetzt, global gedacht.*
