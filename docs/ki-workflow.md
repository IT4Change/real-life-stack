# Entwicklung mit KI — Workflow für stabile, hochwertige Module

## Kontext

KI-Assistenten können produktiv Code schreiben — aber sie machen Fehler. Was sie zuverlässig macht, ist nicht fehlerfreies Schreiben beim ersten Mal, sondern ein Workflow, der Fehler systematisch aufdeckt und behebt.

Dieses Dokument beschreibt einen erprobten Workflow für die Zusammenarbeit mit einem KI-Assistenten (z.B. Claude Code) bei der Entwicklung von wiederverwendbaren Modulen/Libraries.

---

## Kernprinzip

**Test-First, iterativ, ein Modul nach dem anderen.**

Die KI schreibt zuerst Tests, dann die Implementierung, lässt die Tests laufen, fixt Fehler, lässt erneut laufen — so lange, bis alles grün ist. Der Mensch reviewt das Ergebnis. Erst wenn ein Modul stabil ist, beginnt das nächste.

---

## Workflow pro Modul

1. **API-Design** — Schnittstelle und Verhalten gemeinsam definieren
2. **Tests schreiben** — Erwartetes Verhalten als Tests formulieren (vor der Implementierung)
3. **Implementieren** — Code schreiben, Tests laufen lassen, iterieren bis grün
4. **Aufräumen** — Refactoring mit Tests als Sicherheitsnetz
5. **Review** — Mensch schaut drüber, gibt Feedback, KI passt an
6. **Nächstes Modul** — Erst wenn das aktuelle stabil ist

### Warum diese Reihenfolge?

- Tests vor Implementierung zwingt dazu, die API wirklich durchzudenken
- Edge Cases werden entdeckt, bevor sie in der Implementierung vergessen werden
- Die KI kann iterieren (Tests laufen → Fehler sehen → fixen → erneut laufen), was ihre größte Stärke ist
- Refactoring nach dem Grün-werden ist sicher, weil die Tests als Netz dienen
- Kein Modul wird „halb fertig" liegen gelassen

---

## Wo die KI stark ist

- **Reine Logik** — Parser, State-Management, Algorithmen, Berechnungen
- **Gut definierte APIs** — klare Eingabe/Ausgabe, spezifiziertes Verhalten
- **Tests schreiben** — systematisch, inklusive Edge Cases
- **Iterieren** — Fehler finden und beheben über mehrere Zyklen

## Wo der Mensch aufpassen muss

- **Plattform-spezifischer Code** — Audio, Kamera, Dateisystem, native APIs. Die KI kann Tests schreiben, aber nicht auf dem Gerät ausführen.
- **Große Module in einem Rutsch** — besser in kleine, testbare Einheiten aufteilen und sequenziell bauen
- **Architektur-Entscheidungen** — die KI schlägt vor, der Mensch entscheidet
- **"Sieht gut aus"-Falle** — generierter Code kann plausibel aussehen und trotzdem falsch sein. Tests sind der einzige ehrliche Prüfer.

---

## Modul-Reihenfolge

Module nach Abhängigkeiten sortieren. Fundament zuerst:

1. **Module ohne Abhängigkeiten** — reine Utility-Module, kleine Bausteine
2. **Module mit wenigen Abhängigkeiten** — können die bereits getesteten Module nutzen
3. **Komplexe Module** — bauen auf dem stabilen Fundament auf

**Niemals ein Modul beginnen, dessen Abhängigkeiten noch nicht stabil sind.**

---

## Test-Strategie

### Test-Pyramide

```
        /\
       /  \         Integrationstests (wenige)
      /    \         → Module im Zusammenspiel
     /------\
    /        \       Komponententests (mittel)
   /          \       → Klassen mit gemockten Abhängigkeiten
  /------------\
 /              \    Unit-Tests (viele)
/                \    → Einzelne Funktionen, reine Logik
```

### Unit-Tests (Fundament)

- Testen die interne Logik einzelner Funktionen und Klassen
- Keine externen Abhängigkeiten, keine Mocks nötig
- Schnell, deterministisch, viele davon

### Komponententests

- Testen eine Klasse mit ihren direkten Abhängigkeiten
- Externe Abhängigkeiten (Netzwerk, Dateisystem, Hardware) werden gemockt
- Verifizieren, dass Interfaces korrekt genutzt werden

### Integrationstests

- Testen das Zusammenspiel mehrerer Module
- Echte Instanzen statt Mocks (wo möglich)
- Wenige, aber für kritische Pfade

### Was mocken, was nicht?

| Abhängigkeit | Mocken? | Begründung |
|---|---|---|
| Reine Logik (eigene Module) | Nein — echte Instanz | Schnell, deterministisch |
| Hardware-APIs (Audio, Kamera) | Ja | Braucht Gerät |
| Netzwerk (HTTP, WebSocket) | Ja | Nicht deterministisch |
| Dateisystem / Datenbank | Ja | Plattform-spezifisch |
| Timer / Uhrzeit | Kommt drauf an | Fake-Timer für zeitbasierte Tests |

---

## Testname-Konvention

Format: `should [erwartetes Verhalten] when [Bedingung]`

```
should return null when key does not exist
should notify subscriber when value changes
should not fire events during bulk restore
should match with high confidence when all required groups match
```

---

## Coverage

Kein starres Prozentziel. Stattdessen pragmatisch:

- **Muss getestet werden:** Kernlogik, Zustandsübergänge, Berechnungen
- **Sollte getestet werden:** Fehlerbehandlung, Event-Emission, Edge Cases
- **Kann übersprungen werden:** Reine Datenklassen, triviale Getter/Setter, UI-Code

---

## Anweisungen an die KI

Beim Start eines Moduls der KI explizit mitgeben:

1. Lies zuerst die API-Spezifikation / das Interface
2. Schreibe Tests, die das erwartete Verhalten abdecken — vor der Implementierung
3. Implementiere das Modul
4. Führe die Tests aus
5. Wenn Tests fehlschlagen: analysiere den Fehler, fixe ihn, führe die Tests erneut aus
6. Wiederhole bis alle Tests grün sind
7. Räume den Code auf (Refactoring), führe die Tests danach erneut aus
8. Sage erst "fertig", wenn alle Tests grün sind und der Code aufgeräumt ist

---

## Zusammenfassung

| Prinzip | Umsetzung |
|---|---|
| Tests zuerst | Verhalten als Tests definieren, bevor implementiert wird |
| Iterieren | Tests laufen → fixen → erneut laufen, bis grün |
| Ein Modul nach dem anderen | Nie paralleles Halbfertiges |
| Abhängigkeiten respektieren | Fundament zuerst, darauf aufbauen |
| Mensch entscheidet | KI schlägt vor, Mensch reviewt und gibt frei |
| Kein blindes Vertrauen | Tests sind der einzige ehrliche Prüfer |
