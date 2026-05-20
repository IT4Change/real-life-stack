# Web of Trust

> Dezentrales Vertrauensnetzwerk für lokale Gemeinschaften

**Status:** Historisches RLS-Konzeptdokument. Die normative Protokollquelle ist [wot-spec](https://github.com/real-life-org/wot-spec); die aktuelle Referenzimplementierung liegt in [web-of-trust](https://github.com/real-life-org/web-of-trust).

---

## Vision

Menschen vernetzen sich wieder lokal - basierend auf echten Begegnungen statt Algorithmen. Ein Netzwerk, das nur wächst, wenn Menschen sich im echten Leben treffen und füreinander bürgen.

---

## Kernkonzept

### Das Problem

| Heute | Besser |
|-------|--------|
| Globale Plattformen, lokale Einsamkeit | Digitale Tools für echte Nachbarschaft |
| Daten bei Konzernen | Daten bei dir |
| Vertrauen durch Sternebewertungen | Vertrauen durch persönliche Begegnungen |
| Account-Erstellung alleine am Bildschirm | Onboarding durch einen Menschen |
| Abhängigkeit von Servern | Funktioniert offline |

### Die Lösung: Drei Säulen

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   VERIFIZIEREN  │ ──► │   KOOPERIEREN   │ ──► │   ATTESTIEREN   │
│                 │     │                 │     │                 │
│ Identität durch │     │ Verschlüsselte  │     │ Sozialkapital   │
│ persönliches    │     │ Inhalte teilen  │     │ durch echte     │
│ Treffen         │     │ (Kalender,      │     │ Taten aufbauen  │
│ bestätigen      │     │ Karte, Projekte)│     │                 │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

**Verifizieren ≠ Vertrauen**

Die Verifizierung bestätigt nur: "Das ist wirklich diese Person." Das eigentliche Vertrauen entsteht durch Attestationen über Zeit.

---

## Wie es funktioniert

### Szenario: Erstes Treffen

```
Anna (hat die App)          Ben (neu)
        │                       │
        │   "Scann mal meinen   │
        │    QR-Code"           │
        │◄──────────────────────│
        │                       │
        │                       ▼
        │               ┌───────────────┐
        │               │ App öffnen    │
        │               │ QR scannen    │
        │               │ Annas Profil  │
        │               │ erscheint     │
        │               └───────────────┘
        │                       │
        │                       ▼
        │               ┌───────────────┐
        │               │ "Identität    │
        │               │ bestätigen"   │
        │               │ [Button]      │
        │               └───────────────┘
        │                       │
        │                       ▼
        │               ┌───────────────┐
        │               │ Ben hat noch  │
        │               │ keine ID      │
        │               │ → Wird jetzt  │
        │               │   generiert   │
        │               └───────────────┘
        │                       │
        ▼                       ▼
   Ben ist jetzt          Ben sieht jetzt
   in Annas Netzwerk      Annas Content
```

### Was passiert technisch?

1. Ben scannt Annas QR-Code (enthält Annas öffentlichen Schlüssel + DID)
2. Ben erstellt seine eigene DID (falls noch nicht vorhanden)
3. Ben signiert: "Ich bestätige Annas Identität"
4. Ben speichert Annas öffentlichen Schlüssel
5. Annas verschlüsselter Content wird für Ben entschlüsselbar

### Szenario: Attestation erstellen

```
Ben hilft im Gemeinschaftsgarten
              │
              ▼
┌─────────────────────────────┐
│ Anna öffnet Bens Profil     │
│ → "Attestation erstellen"   │
│                             │
│ ┌─────────────────────────┐ │
│ │ "Ben hat 3 Stunden im   │ │
│ │  Garten geholfen"       │ │
│ │                         │ │
│ │ Tags: [Garten] [Helfen] │ │
│ └─────────────────────────┘ │
│                             │
│ [Signieren & Teilen]        │
└─────────────────────────────┘
              │
              ▼
    Attestation wird Teil
    von Bens Profil
              │
              ▼
    Andere in Annas Netzwerk
    sehen: "Ben kann Garten"
```

---

## Personas

### 🌱 Greta (62) - Die Gärtnerin

**Hintergrund:** Aktiv im Gemeinschaftsgarten, nicht technikaffin, hat ein Smartphone aber nutzt hauptsächlich WhatsApp.

**Bedürfnisse:**
- Wissen wer wann gießt
- Neue Helfer finden
- Sich nicht mit Technik beschäftigen müssen

**Wie Web of Trust hilft:**
- Ihr Nachbar Tom richtet die App ein
- Tom verifiziert sie persönlich
- Sie sieht den Gartenkalender
- Wenn jemand hilft, tippt sie "Danke" → Attestation

**Kritischer Moment:** Key-Backup. Tom hilft ihr, die Recovery-Phrase sicher aufzubewahren.

---

### 🔧 Kemal (34) - Der Macher

**Hintergrund:** Kann alles reparieren, kennt viele Leute, organisiert Nachbarschaftshilfe.

**Bedürfnisse:**
- Überblick wer was kann
- Anfragen koordinieren
- Nicht von WhatsApp-Gruppen-Chaos abhängig sein

**Wie Web of Trust hilft:**
- Verifiziert aktiv neue Leute bei Treffen
- Erstellt Attestationen: "Kann Fahrräder", "Kann Elektrik"
- Sieht auf der Karte wer in der Nähe was anbietet

**Kritischer Moment:** Will 50 Leute auf einmal einladen. Geht nicht - jeder muss einzeln verifiziert werden. Das ist ein Feature, kein Bug.

---

### 🎓 Lena (28) - Die Skeptikerin

**Hintergrund:** Softwareentwicklerin, Privacy-bewusst, hat schon viele "dezentrale" Projekte scheitern sehen.

**Bedürfnisse:**
- Verstehen wie es technisch funktioniert
- Sicher sein dass ihre Daten wirklich verschlüsselt sind
- Kein Vendor-Lock-in

**Wie Web of Trust hilft:**
- Open Source, kann den Code prüfen
- E2E-Verschlüsselung, Schlüssel lokal
- Daten exportierbar

**Kritischer Moment:** Fragt nach Skalierung. Antwort: "Skaliert absichtlich nicht über persönliche Beziehungen hinaus."

---

### 👨‍👩‍👧 Familie Yilmaz - Die Neuzugezogenen

**Hintergrund:** Neu in der Stadt, kennen niemanden, wollen Anschluss finden.

**Bedürfnisse:**
- Nachbarn kennenlernen
- Vertrauenswürdige Angebote finden (Babysitter, Handwerker)
- Teil einer Gemeinschaft werden

**Wie Web of Trust hilft:**
- Beim Straßenfest: Erste Verifizierungen
- Sehen sofort wer schon Attestationen hat
- Können selbst Attestationen sammeln

**Kritischer Moment:** Anfangs sehen sie wenig Content. Das Netzwerk wächst nur durch echte Begegnungen - das dauert, ist aber der Punkt.

---

## User Stories

### Onboarding & Verifizierung

| Als... | möchte ich... | damit... |
|--------|---------------|----------|
| Neuer Nutzer | durch einen persönlichen QR-Scan ongeboardet werden | ich sofort Teil eines Netzwerks bin |
| Bestehender Nutzer | neue Leute bei Treffen verifizieren | mein Netzwerk wächst |
| Nutzer | sehen welche Kontakte ich verifiziert habe | ich den Überblick behalte |
| Nutzer | einen Kontakt "ausblenden" können | ich dessen Content nicht mehr sehe ohne Drama |

### Content & Kollaboration

| Als... | möchte ich... | damit... |
|--------|---------------|----------|
| Nutzer | einen Termin mit einer Gruppe teilen | wir uns koordinieren können |
| Nutzer | einen Ort auf der Karte markieren | andere ihn finden |
| Nutzer | auch ohne Internet Content erstellen | es im Garten funktioniert |
| Nutzer | sehen wann zuletzt synchronisiert wurde | ich weiß ob alles aktuell ist |

### Attestationen

| Als... | möchte ich... | damit... |
|--------|---------------|----------|
| Nutzer | eine Attestation für jemanden erstellen | dessen Beitrag sichtbar wird |
| Nutzer | Attestationen einer Person sehen | ich einschätzen kann was sie kann |
| Nutzer | meine eigenen Attestationen sehen | ich mein "Profil" kenne |
| Nutzer | Attestationen mit Tags versehen | sie filterbar sind |

### Sicherheit & Recovery

| Als... | möchte ich... | damit... |
|--------|---------------|----------|
| Nutzer | meine Recovery-Phrase sicher speichern | ich meinen Key wiederherstellen kann |
| Nutzer | verstehen was passiert wenn ich den Key verliere | ich die Konsequenzen kenne |
| Nutzer | meine Daten exportieren | ich nicht eingesperrt bin |

---

## FAQ

### Grundlagen

**Was unterscheidet das von WhatsApp-Gruppen?**
- Deine Daten liegen bei dir, nicht bei Meta
- Funktioniert offline
- Attestationen bauen ein sichtbares "Sozialkapital" auf
- Keine Gruppen-Chaos mit 200 ungelesenen Nachrichten

**Warum muss ich jemanden persönlich treffen?**
Das ist der Kern des Konzepts. Die persönliche Verifizierung ist der Sybil-Resistenz-Mechanismus. Ohne sie könnte jeder 1000 Fake-Accounts erstellen.

**Was sehe ich wenn ich niemanden verifiziert habe?**
Nichts außer deinem eigenen Profil. Das Netzwerk ist nur so groß wie deine echten Beziehungen.

**Kann ich Leute einladen ohne sie zu treffen?**
Nein. Das ist Absicht. Jede Beziehung im Netzwerk basiert auf einer echten Begegnung.

### Vertrauen & Attestationen

**Was ist der Unterschied zwischen Verifizierung und Attestation?**
- **Verifizierung:** "Ich habe diese Person getroffen, das ist wirklich sie"
- **Attestation:** "Diese Person hat X getan / kann Y"

Verifizierung ist der Identitätsanker. Attestationen sind das eigentliche Vertrauen.

**Kann ich eine Attestation zurücknehmen?**
Nein. Attestationen sind signierte Aussagen über vergangene Ereignisse. Wenn sich die Beziehung ändert, erstellst du einfach keine neuen mehr.

**Was wenn jemand Mist baut?**
Du blendest die Person aus. Sie behält ihre alten Attestationen (sie hat die guten Taten ja wirklich getan), aber du siehst ihren Content nicht mehr. Andere können das auch tun.

**Können Attestationen gefälscht werden?**
Nein. Jede Attestation ist kryptographisch von der erstellenden Person signiert.

### Technisches

**Was passiert wenn ich mein Handy verliere?**
Wenn du deine Recovery-Phrase hast: Alles wiederherstellbar.
Wenn nicht: Deine digitale Identität ist weg. Du musst neu anfangen und dich erneut verifizieren lassen.

**Funktioniert das offline?**
Ja. Du kannst Content erstellen, Leute verifizieren (per QR-Scan), Attestationen erstellen. Synchronisiert wird wenn wieder Internet da ist.

**Wo liegen meine Daten?**
Lokal auf deinem Gerät. Verschlüsselt. Nur Leute die du verifiziert hast können sie entschlüsseln.

**Gibt es einen Server?**
Für die Synchronisation zwischen Geräten braucht es Infrastruktur. Diese speichert aber nur verschlüsselte Blobs - der Betreiber kann nichts lesen.

**Welche Protokolle nutzt ihr?**
Wir sind in der Erprobungsphase und testen verschiedene Ansätze:
- **DIDs** für dezentrale Identitäten
- **E2E-Verschlüsselung** für alle Inhalte
- **MLS** wird evaluiert für Gruppenverschlüsselung
- **CRDTs** (z.B. Automerge) werden getestet für Local-First Sync

Nichts davon ist in Stein gemeißelt - wir lernen was funktioniert.

### Skalierung & Grenzen

**Was wenn das 10.000 Leute nutzen?**
Das Netzwerk "skaliert" nicht im klassischen Sinne. Du siehst immer nur den Content von Leuten die du (direkt oder indirekt) verifiziert hast. Bei 10.000 Nutzern gibt es viele kleine, überlappende Netzwerke.

**Kann ich Leute sehen die "Freunde von Freunden" sind?**
Im Basisfall: Nein. Du siehst nur Content von Leuten die du selbst verifiziert hast. Erweiterungen für Vertrauensketten sind denkbar, aber nicht im ersten Schritt.

**Was wenn jemand Gatekeeper spielt?**
Da es keine zentrale Instanz gibt, kann niemand andere ausschließen. Wenn Person A dich nicht verifizieren will, findest du einen anderen Weg ins Netzwerk.

---

## Abgrenzung

### Was Web of Trust NICHT ist

- ❌ Ein soziales Netzwerk zum Content-Konsum
- ❌ Eine Alternative zu Instagram/TikTok
- ❌ Ein Bewertungsportal
- ❌ Blockchain/Crypto (keine Token, keine Spekulation)
- ❌ Eine App die "viral gehen" soll

### Was Web of Trust IST

- ✅ Ein Werkzeug für bestehende Gemeinschaften
- ✅ Eine sichere Art Informationen lokal zu teilen
- ✅ Ein System das echte Beziehungen digital abbildet
- ✅ Infrastruktur die der Gemeinschaft gehört

---

## Offene Fragen (Erprobungsphase)

Diese Fragen erforschen wir aktiv:

1. **UX für Key-Management:** Wie machen wir Recovery-Phrase verständlich für nicht-technische Nutzer?

2. **Sync-Protokoll:** Welches CRDT-Framework funktioniert am besten? (Automerge, Yjs, andere?)

3. **Gruppen-Verschlüsselung:** Ist MLS die richtige Wahl oder gibt es einfachere Ansätze?

4. **Offline-First Grenzen:** Wie lange kann jemand offline sein bevor Konflikte entstehen?

5. **Vertrauensketten:** Sollte es "Freund-von-Freund"-Sichtbarkeit geben? Wenn ja, wie?

6. **Attestation-Spam:** Brauchen wir Rate-Limiting oder reguliert sich das sozial?

7. **Multi-Device:** Wie synchronisiert man Keys sicher zwischen Geräten?

---

## Nächste Schritte

Die aktuelle Referenzimplementierung ist verfügbar: [github.com/real-life-org/web-of-trust](https://github.com/real-life-org/web-of-trust)

Wir suchen:
- Gemeinschaften die es ausprobieren wollen
- Feedback zu UX und Konzept
- Entwickler die mitbauen wollen

---

*Dieses Dokument ist ein lebendiges Konzept und wird basierend auf Erkenntnissen aus der Erprobung aktualisiert.*
