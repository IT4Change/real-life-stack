# Real Life Stack

**Modularer Baukasten für lokale Vernetzung und dezentrale Zusammenarbeit**

Lokale Gemeinschaften brauchen digitale Werkzeuge, die echte Begegnungen fördern statt ersetzen. Real Life Stack ist ein modularer Baukasten, mit dem Communities eigene Apps für lokale Vernetzung bereitstellen und an ihre Bedürfnisse anpassen können.

> **Meeting-Time statt Screen-Time** – Software, die Menschen zusammenbringt statt sie am Bildschirm zu halten.

## Monorepo-Struktur

```text
real-life-stack/
├── packages/
│   └── toolkit/           # @real-life-stack/toolkit - UI-Komponenten
├── apps/
│   └── reference/         # Reference App (React 19)
├── prototypes/            # UI-Prototypen (Legacy)
└── docs/                  # Dokumentation
    ├── modules/           # Modul-Spezifikationen
    ├── concepts/          # Konzept-Dokumente
    └── funding/           # Förderantrag
```

## Schnellstart

```bash
# Dependencies installieren
pnpm install

# Reference App starten
pnpm dev:reference

# Toolkit bauen
pnpm build:toolkit
```

## @real-life-stack/toolkit

Das Toolkit-Package exportiert wiederverwendbare UI-Komponenten:

```typescript
import { AppShell, MapView, FeedView } from '@real-life-stack/toolkit'
```

**[Storybook ansehen →](https://it4change.github.io/real-life-stack/storybook/)**

```bash
# Storybook lokal starten
pnpm storybook
```

---

## Das Problem

Lokale Initiativen werden zu zentralen Akteuren bei der Bewältigung sozialer und ökologischer Herausforderungen. Doch:

- **Etablierte Plattformen** sind auf Aufmerksamkeit und Reichweite optimiert, nicht auf lokale Zusammenarbeit
- **Kleine Initiativen** besitzen nicht die Ressourcen, eigene Systeme zu bauen
- **Fehlende Infrastruktur** zwingt Communities auf Plattformen, die ihre Daten kontrollieren

## Die Lösung

Real Life Stack bietet eine gemeinsame technische Grundlage:

- **Modularer UI-Baukasten** – Karte, Kalender, Gruppen, Profile, Feed als wiederverwendbare Komponenten
- **White-Label-App** – Sofort einsetzbar, ohne Programmierkenntnisse anpassbar
- **Backend-agnostisch** – Connector-Architektur für REST, Local-first, P2P oder E2EE
- **Vertrauensbasierte Identität** – Web of Trust durch reale Begegnungen

### Der Aktivierungskreislauf

```
Vorschlagen → Planen → Umsetzen → Vertrauen aufbauen → Erfolge teilen → ↩
```

Real Life Stack unterstützt den gesamten Kreislauf: von der Idee über die Verabredung bis zur gemeinsamen Umsetzung vor Ort. Durch echte Zusammenarbeit entsteht ein Vertrauensnetzwerk (Web of Trust), das die Gemeinschaft nachhaltig stärkt.

---

## Demos

### UI-Prototyp

**[Live Demo ansehen →](https://it4change.github.io/real-life-stack/edge/)**

Testet UI-Konzepte und Komponenten-Design:
- Karte, Kalender, Feed-Ansichten
- Navigation und responsive Layout
- Smart Post Input-Widget

### Forschungs-Prototyp (Web-of-Trust)

**[Live Demo ansehen →](https://web-of-trust.de)**

Experimentelle Spielwiese für technische Ansätze:
- Dezentrale Identitäten (did:key)
- Web of Trust via QR-Code-Verifizierung
- Local-first mit Automerge CRDT
- Modulare AppShell-Architektur

---

## Architektur

```
┌─────────────────────────────────────────┐
│      UI-Module                          │
│  (Karte, Kalender, Feed, Gruppen, ...)  │
├─────────────────────────────────────────┤
│      Daten- & Identitätsschnittstelle   │
├─────────────────────────────────────────┤
│      Connector-Schicht                  │
├─────────────────────────────────────────┤
│      Backend                            │
│  (REST / Local-first / P2P / E2EE)      │
└─────────────────────────────────────────┘
```

### Frontend-Baukasten

- TypeScript + React/Vue
- Klare Daten- und Identitätsschnittstelle
- Erweiterbare Modulstruktur
- Themebares Design-System (Tailwind CSS)

### Connector-Schicht

- Definiert Muster zur Backend-Anbindung
- Referenzimplementierung mitgeliefert
- Weitere Connectoren durch Community erweiterbar

---

## Module

| Modul                              | Beschreibung                                                        |
|------------------------------------|---------------------------------------------------------------------|
| [**Map**](docs/modules/map.md)          | Lokale Orte, Ressourcen und Aktivitäten auf einer Karte visualisieren |
| [**Calendar**](docs/modules/calendar.md)| Events planen, Termine koordinieren, Einladungen verwalten          |
| [**Feed**](docs/modules/feed.md)        | Aktivitäten-Stream aus allen Modulen – was passiert in der Community? |
| **Groups**                         | Gruppen mit Rollen, Mitgliedschaften und gemeinsamen Ressourcen     |
| **Profiles**                       | Nutzerprofile mit Fähigkeiten, Interessen und Vertrauensbeziehungen |

---

## Forschungsprojekt: Web-of-Trust

[Web-of-Trust](https://github.com/IT4Change/web-of-trust) ist eine experimentelle Spielwiese, auf der wir Ideen und Ansätze für Real Life Stack erforschen und testen:

- **Dezentrale Identitäten** – Experimente mit did:key und Ed25519
- **Web of Trust** – QR-Code-basierte Verifizierung, JWS-Signaturen
- **Local-first** – Automerge CRDT für Offline-Fähigkeit
- **Modulare Architektur** – AppShell-Pattern für verschiedene Apps

Das Projekt dient der Forschung und dem Prototyping – es ist kein fertiger Tech-Stack, sondern eine lebendige Experimentierumgebung, in der wir verschiedene technische Ansätze ausprobieren.

**[Live Demo →](https://web-of-trust.de)**

---

## Team

Das Projekt wird von einem Team mit langjähriger Erfahrung in Open-Source-Community-Tools entwickelt:

- **Anton Tranelis** – Projektkoordination, System-Architektur, Full Stack
- **Ulf Gebhardt** – Full Stack, DevOps, Infrastruktur
- **Sebastian Stein** – Frontend-Entwicklung, UX/UI
- **Mathias Lenz** – Qualitätssicherung, Testing, Dokumentation

### Referenzprojekte

- [Utopia Map](https://github.com/utopia-os/utopia-map/) – Kartenplattform für lokale Vernetzung
- [ocelot.social](https://github.com/Ocelot-Social-Community/ocelot.social) – Soziales Netzwerk für Communities

---

## Zielgruppe

- Nachbarschaftsnetzwerke und Urban-Gardening-Gruppen
- Repair-Cafés, Foodsharing-Initiativen, Solawis
- Jugendgruppen und freie Lernorte
- Sharing- und Tausch-Communities
- Organisationen, die lokale Gruppen stärken

---

**Gemeinsam gestalten wir die Zukunft – lokal vernetzt, global gedacht.**
