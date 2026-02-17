# Framework-Vergleich: React.js Web-App → Native App

Vergleich der gängigen Frameworks, um eine bestehende React.js Web-App als native Mobile-App in den App Store / Play Store zu bringen.

---

## 1. Capacitor (Ionic) — unsere Wahl

**WebView-basiert, 100% Code-Reuse**

Capacitor bettet die bestehende Web-App in eine native WebView ein und bietet über eine Bridge Zugriff auf native APIs. Frontend-Framework-agnostisch, geistiger Nachfolger von Cordova.

| Vorteile | Nachteile |
|---|---|
| Bestehende React-App funktioniert 1:1 | UI läuft in WebView, kein echtes natives Rendering |
| Tailwind, Radix UI, Leaflet etc. funktionieren sofort | Performance bei aufwendigen Animationen begrenzt |
| Einfache Plugin-API (Swift/Kotlin) | Keyboard/Focus-Quirks auf Mobilgeräten möglich |
| Cordova-Plugin-Kompatibilität | Für "nativen Look" muss CSS nachgearbeitet werden |
| Vite + HMR auf dem Device | |

---

## 2. React Native

**Echtes natives UI-Rendering, aber kompletter Umbau**

React Native (Meta) verwendet React-Syntax, rendert aber in echte native UI-Komponenten statt in eine WebView.

| Vorteile | Nachteile |
|---|---|
| Echte native UI-Komponenten | **Nur 20-40% Code-Reuse** — gesamte UI muss umgeschrieben werden |
| Bessere Performance bei Animationen/Scrolling | Tailwind, Radix UI, Leaflet — **nichts davon funktioniert** |
| Riesige Community | `<div>` → `<View>`, CSS → StyleSheet — fundamentaler Umbau |
| Von Meta aktiv entwickelt | Upgrades zwischen Major-Versionen oft schmerzhaft |

---

## 3. Expo (basiert auf React Native)

**React Native mit vereinfachtem Tooling + Cloud-Builds**

Expo ist ein Framework und eine Plattform rund um React Native, das die Entwicklung vereinfacht und Cloud-Build-Services anbietet.

| Vorteile | Nachteile |
|---|---|
| Alle React-Native-Vorteile + einfacherer Einstieg | Gleicher Umbau-Aufwand wie React Native |
| Cloud-Builds (kein lokales Xcode nötig) | Abhängigkeit von Expo-Infrastruktur |
| Over-the-Air-Updates ohne Store-Review | SDK-Upgrades können Breaking Changes bringen |
| "DOM Components" für schrittweise Migration | |

---

## 4. Tauri Mobile (seit v2.0)

**WebView + Rust-Backend, ähnlich wie Capacitor**

Tauri kombiniert Web-Technologien mit einem Rust-Backend. Seit Version 2.0 (Oktober 2024) werden neben Desktop auch iOS und Android unterstützt.

| Vorteile | Nachteile |
|---|---|
| 100% Code-Reuse (WebView-basiert) | **Mobile-Support noch unreif** (Alpha-Qualität) |
| Sehr kleine Bundle-Größen | Plugin-Ökosystem deutlich kleiner |
| Rust-Backend für performance-kritische Ops | Rust-Kenntnisse nötig für native Erweiterungen |
| Sicherheitsfokussiert | Doku für Mobile teilweise veraltet |

---

## 5. PWA (Progressive Web App)

**Kein natives Wrapping, nur Web-Erweiterung**

Eine PWA erweitert die Web-App mit Service Workers, Web App Manifest und modernen Web-APIs für app-ähnliches Verhalten.

| Vorteile | Nachteile |
|---|---|
| Kein Umbau nötig | **Apple App Store lehnt reine PWAs ab** |
| Kein Store-Review-Prozess | Eingeschränkter Zugriff auf native APIs (besonders iOS) |
| Automatische Updates | Kein Bluetooth, NFC, erweiterte Biometrie auf iOS |
| Eine Codebasis für alles | Keine Store-Sichtbarkeit |

---

## 6. Cordova (Apache)

**Vorgänger von Capacitor, de facto abgelöst**

Apache Cordova ist das Original-Framework für hybride Mobile-Apps. Es bettet Web-Apps in eine WebView ein und bietet Zugriff auf native APIs über JavaScript-Plugins.

| Vorteile | Nachteile |
|---|---|
| 100% Code-Reuse | **Überholt durch Capacitor** |
| Riesige Plugin-Bibliothek | Viele Plugins veraltet |
| Noch aktiv gewartet | Kein Vite-Support, kein TypeScript-First |
| | Community schrumpft |

---

## Bewertungsmatrix

| Kriterium | Capacitor | React Native | Expo | Tauri | PWA | Cordova |
|---|---|---|---|---|---|---|
| Code-Reuse | 100% | 20-40% | 20-40% | 100% | 100% | 100% |
| Umbau-Aufwand | Minimal | Sehr hoch | Hoch | Minimal | Minimal | Minimal |
| UI-Performance | Gut | Sehr gut | Sehr gut | Gut | Ausreichend | Gut |
| Native API-Zugriff | Sehr gut | Exzellent | Sehr gut | Eingeschränkt | Eingeschränkt | Gut |
| App Store tauglich | Ja | Ja | Ja | Ja | **Nein (Apple)** | Ja |
| Plugin-Ökosystem | Groß | Sehr groß | Groß | Klein | N/A | Groß (veraltet) |
| Mobile-Reife | Hoch | Sehr hoch | Sehr hoch | **Niedrig** | Mittel | Hoch |
| Zukunftssicherheit | Hoch | Sehr hoch | Sehr hoch | Mittel | Hoch | **Niedrig** |

---

## Fazit: Warum Capacitor

**Capacitor ist die richtige Wahl für unser Projekt.**

1. **Wir haben bereits eine funktionsfähige React+Vite+Tailwind-App** mit Radix UI, Leaflet, Framer Motion etc. — all diese Bibliotheken funktionieren in Capacitor ohne Änderungen, wären aber in React Native/Expo komplett unbrauchbar.

2. **React Native / Expo wäre nur dann besser**, wenn wir die App von Grund auf neu bauen würden und "nativ anfühlende" UI-Elemente Priorität hätten. Für ein bestehendes Web-Projekt ist der Migrationsaufwand unverhältnismäßig.

3. **Tauri Mobile ist noch nicht reif genug** für Produktions-Apps im App Store.

4. **PWA fällt aus**, da Apple reine PWAs im App Store ablehnt.

5. **Cordova ist überholt** — Capacitor ist der direkte, bessere Nachfolger.

---

*Erstellt: Februar 2026*
