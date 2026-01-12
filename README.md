# Real Life Stack

**Modularer Baukasten für lokale Vernetzung und dezentrale Zusammenarbeit**

Lokale Gemeinschaften brauchen digitale Werkzeuge, die echte Begegnungen fördern statt ersetzen. Real Life Stack ist ein modularer Baukasten, mit dem Communities eigene Apps für lokale Vernetzung bereitstellen und an ihre Bedürfnisse anpassen können.

> **Selbstorganisation leicht gemacht** – Werkzeuge für echte Zusammenarbeit, die Gruppen dabei helfen, gemeinsam vor Ort etwas zu bewegen.

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

Real Life Stack unterstützt den gesamten Kreislauf: von der Idee über die Verabredung bis zur gemeinsamen Umsetzung vor Ort. Durch echte Zusammenarbeit entsteht ein Vertrauensnetzwerk ([Web of Trust](https://web-of-trust.de)), das die Gemeinschaft nachhaltig stärkt.

---

## Architektur

```
┌──────────────────────────────────────────────────────────┐
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐  │
│  │Kalender│ │ Karte  │ │  Feed  │ │Gruppen │ │Profile │  │
│  └────────┘ └────────┘ └────────┘ └────────┘ └────────┘  │
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

### App-Shell + UI-Module

Die oberste Schicht enthält die **App-Shell** als Container und die austauschbaren **UI-Module** (Kalender, Karte, Feed, Gruppen, Profile). Jede Community wählt die Module, die sie braucht.

### Daten- & Identitätsschnittstelle

Einheitliche API für Datenmodelle (Posts, Events, Orte, Profile) und Identität (Login, Vertrauensbeziehungen). Die Module kennen nur diese Schnittstelle, nicht das Backend.

### Connector-Schicht

Adapter-Pattern für verschiedene Backend-Anbindungen. Referenzimplementierung mitgeliefert, weitere Connectoren durch Community erweiterbar.

---

## Module

| Modul | Beschreibung |
|-------|--------------|
| [**Map**](docs/modules/map.md) | Lokale Orte, Ressourcen und Aktivitäten auf einer Karte visualisieren |
| [**Calendar**](docs/modules/calendar.md) | Events planen, Termine koordinieren, Einladungen verwalten |
| [**Feed**](docs/modules/feed.md) | Aktivitäten-Stream aus allen Modulen – was passiert in der Community? |
| **Groups** | Gruppen mit Rollen, Mitgliedschaften und gemeinsamen Ressourcen |
| **Profiles** | Nutzerprofile mit Fähigkeiten, Interessen und Vertrauensbeziehungen |

---

## Zielgruppe

- Nachbarschaftsnetzwerke und Urban-Gardening-Gruppen
- Repair-Cafés, Foodsharing-Initiativen, Solawis
- Jugendgruppen und freie Lernorte
- Sharing- und Tausch-Communities
- Organisationen, die lokale Gruppen stärken

---

## Demos

| Demo | Beschreibung |
|------|--------------|
| **[Landing Page](https://real-life-stack.de/)** | Projektübersicht und Einstieg |
| **[Reference App](https://real-life-stack.de/app/)** | Implementierung mit allen Modulen |
| **[UI-Prototyp](https://real-life-stack.de/edge/)** | Experimentelle UI-Konzepte und Komponenten |
| **[Storybook](https://real-life-stack.de/storybook/)** | Komponenten-Dokumentation |
| **[Web-of-Trust](https://it4change.github.io/web-of-trust/)** | Forschungs-Prototyp für dezentrale Identität |

---

## Forschungsprojekt: Web-of-Trust

[Web-of-Trust](https://web-of-trust.de) ist eine experimentelle Spielwiese, auf der wir Ideen und Ansätze für Real Life Stack erforschen und testen:

- **Dezentrale Identitäten** – Experimente mit did:key und Ed25519
- **Web of Trust** – QR-Code-basierte Verifizierung, JWS-Signaturen
- **Local-first** – Automerge CRDT für Offline-Fähigkeit
- **Modulare Architektur** – AppShell-Pattern für verschiedene Apps

**[Zur Landing Page →](https://web-of-trust.de)** | **[Zum Prototyp →](https://it4change.github.io/web-of-trust/)** | **[GitHub →](https://github.com/IT4Change/web-of-trust)**

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

# Entwickler-Dokumentation

## Monorepo-Struktur

```text
real-life-stack/
├── packages/
│   └── toolkit/           # @real-life-stack/toolkit - UI-Komponenten
├── apps/
│   ├── landing/           # Landing Page
│   ├── reference/         # Reference App (React 19)
│   └── prototype/         # UI-Prototyp (experimentell)
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

# Landing Page starten
pnpm dev:landing

# Toolkit bauen
pnpm build:toolkit
```

## @real-life-stack/toolkit

Das Toolkit-Package exportiert wiederverwendbare UI-Komponenten:

```typescript
import { Button, Card, Avatar, Tabs } from '@real-life-stack/toolkit'
```

**[Storybook ansehen →](https://it4change.github.io/real-life-stack/storybook/)**

```bash
# Storybook lokal starten
pnpm storybook

# Storybook bauen
pnpm build:storybook
```

### Tech Stack

- TypeScript + React 19
- Tailwind CSS v4
- Radix UI Primitives
- CVA (class-variance-authority)
- Vite

---

**Gemeinsam gestalten wir die Zukunft – lokal vernetzt, global gedacht.**
