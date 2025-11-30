# PTF Bewerbung - Formular-Format

---

## 1. ALLGEMEINE INFORMATIONEN

### Projekttitel

Real-Life Stack – Modularer Baukasten für lokale Vernetzung

### Name für den Account

Real-Life Stack

### Vorname / Name

Anton Tranelis

### E-Mail-Adresse

???

### GitHub-Account (optional)

<https://github.com/antontranelis>

---

## 2. PROJEKTBESCHREIBUNG (max. 100 Wörter)

Lokale Gemeinschaften brauchen digitale Werkzeuge, die echte Begegnungen fördern statt ersetzen. Real-Life Stack ist ein modularer Baukasten, mit dem Gruppen ihre eigene App für lokale Vernetzung und Zusammenarbeit bereitstellen und an ihre Bedürfnisse anpassen können. Er besteht aus einer Frontend-Komponenten-Library sowie einer darauf aufbauenden White-Label-Referenz-App.

Bausteine wie Karte, Kalender, Gruppen, Feed und Profile lassen sich flexibel kombinieren und für soziale Initiativen, ökologische Projekte oder Nachbarschaftsgruppen anpassen. Geo-Filter für den Nahbereich und ein Web-of-Trust, das durch reale Treffen entsteht, unterstützen vertrauensbasierte Kooperation vor Ort.

Eine entkoppelte Schnittstelle zwischen Frontend und Backend ermöglicht heute klassische Serverumgebungen und künftig auch dezentrale, verschlüsselte oder local-first Architekturen.


---

## 3. GESELLSCHAFTLICHE HERAUSFORDERUNG (max. 175 Wörter)

Lokale Initiativen werden zu zentralen Akteuren bei der Bewältigung heutiger sozialer und ökologischer Herausforderungen. Doch Forschungen zeigen: Steigende Bildschirmzeit verdrängt reale Begegnungen („time displacement“, Kraut et al. 1998/2002), während gleichzeitig Nachbarschaftskontakte, Vereinsbeteiligung und lokale Unterstützung seit Jahren zurückgehen (Freiwilligensurvey 2014–2021). Etablierte „Soziale Netzwerke“ sind auf Aufmerksamkeit, Reichweite und passive Kommunikation optimiert, nicht auf lokale Zusammenarbeit und reale Begegnungen.

Gleichzeitig fehlt es an offener digitaler Infrastruktur für lokale Selbstorganisation. Kleine Initiativen, Nachbarschaftsprojekte und Community-Gruppen besitzen meist nicht die Ressourcen, um eigene Systeme aufzubauen. Sie sind auf etablierte Plattformen angewiesen, die Kommunikation nach eigenen Regeln gestalten, Werbung einblenden und ihre Daten kontrollieren.

Das Problem ist zweifach: Erstens sind etablierte Plattformen nicht darauf ausgelegt, vertrauensbasierte Beziehungen und gemeinsames Handeln in der realen Welt zu unterstützen. Zweitens fehlt eine modulare anpassbare Infrastruktur, die Communities selbstbestimmt nutzen können.

Gemeinsames Handeln kann Software nicht ersetzen, aber sie kann lokale Gruppen dabei unterstützen, sich einfacher zu organisieren, ihre Daten zu schützen und reale Begegnungen zu fördern. Hier setzt Real-Life Stack an – als Werkzeug, das echte Gemeinschaft stärkt, statt sie zu ersetzen.

---

## 4. TECHNISCHE UMSETZUNG (max. 175 Wörter)

Der Real-Life Stack wird als modularer Frontend-Baukasten in TypeScript mit React oder Vue entwickelt. Er umfasst eigenständige Komponenten wie Karte (OpenStreetMap via MapLibre), Kalender (iCal / CalDAV), Gruppen, Profile und Feed, die sowohl in der Referenzanwendung als auch als wiederverwendbare Library in eigenen Projekten eingesetzt werden können.

Alle Module greifen auf eine gemeinsame Daten- und Identitätsschnittstelle im Frontend zu. Diese definiert einheitliche Funktionen zum Laden und Speichern von Gruppen, Terminen, Profilen und Vertrauensbeziehungen – unabhängig davon, welches Backend genutzt wird oder wie Identitäten verwaltet sind.

Unterhalb dieser Ebene liegt eine schlanke Connector-Struktur. Sie legt fest, wie Backends angebunden werden, und wir liefern eine erste Implementierung mit. Weitere Connectoren (z. B. REST, GraphQL, local-first, p2p oder E2EE-basierte Systeme) können von Communities selbst entwickelt werden. Die offene Identitätsschnittstelle soll perspektivisch auch schlüsselbasierte Accounts und DIDs unterstützen.

Zusätzlich entsteht eine selbsthostbare White-Label-App mit einer intuitiven Admin-Konfigurationsoberfläche, über die Gruppen ohne technisches Know-how Module aktivieren, Farben, Inhalte und Grundeinstellungen anpassen können. Ein leichtgewichtiges Node.js-Backend im Docker-Setup ermöglicht einen schnell einsatzfähigen Start.

---

## 5. AKTUELLER STAND (max. 100 Wörter)

Auf Basis der Erfahrungen mit der [Utopia Map](https://github.com/utopia-os/utopia-map/) (seit 2022) und [ocelot.social](https://github.com/Ocelot-Social-Community/Ocelot-Social) (seit 2018) werden derzeit Anforderungsdokumente, User Stories und konzeptionelle Architekturüberlegungen erarbeitet. Es existiert ein React-basierter [Click-Dummy](https://it4change.github.io/real-life-stack/edge/), der zeigt, wie Karte, Kalender und Feed integriert werden können.

Das Datenmodell, die Backend-Architektur, die Identitätslösung sowie die Integrationsschicht zwischen Frontend-Modulen und Backend sind jedoch noch nicht implementiert. In der Förderphase sollen die Architektur finalisiert, der modulare Stack als Komponenten-Library sowie eine White-Label-Referenz-App technisch umgesetzt werden.

---

## 6. LINK ZUM PROJEKT (optional)

[https://github.com/IT4Change/real-life-stack](https://github.com/IT4Change/real-life-stack)

---

## 7. INNOVATION (max. 100 Wörter)

Projekte wie Karrot, Bonfire und Mobilizon decken einzelne Aspekte unseres Ansatzes ab: Karrot stärkt Face-to-Face-Aktivitäten, bietet aber keine modulare oder föderierbare Architektur. Bonfire ist modular, jedoch nicht auf hyperlokale Begegnungen oder Geo-Mechanismen ausgerichtet. Mobilizon ermöglicht Events und Gruppen im Fediverse und bietet Ortsfilter, verfügt aber weder über modulare Komponenten noch über eine Geo-Logik für lokale Selbstorganisation.

Real-Life Stack kombiniert diese Ansätze in einer wiederverwendbaren Infrastruktur: ein modularer Frontend-Baukasten mit einheitlicher Daten- und Identitätsschnittstelle, backend-agnostisch und auf lokale Kooperation optimiert. Geo-Filter und ein Web-of-Trust durch reale Treffen fördern vertrauensbasierte Zusammenarbeit und Datenhoheit.

---

## 8. ZIELGRUPPE (max. 100 Wörter)

Unsere Zielgruppen sind lokale Gemeinschaften, die ihre Umgebung selbstorganisiert gestalten: Nachbarschaftsnetzwerke, Urban-Gardening-Gruppen, Repair-Cafés, Foodsharing-Initiativen, Solawis, Gemeinschaftsgärten, Jugendgruppen und freie Lernorte. Sie brauchen digitale Werkzeuge, die nicht auf Online-Interaktion, sondern auf reale Begegnungen, lokale Kooperation und echte soziale Netzwerke im direkten Kontakt ausgelegt sind. Auch Sharing- und Tausch-Communities benötigen digitale Infrastruktur, um Ressourcen und Fähigkeiten sichtbar zu machen und gegenseitige Unterstützung zu organisieren.

Die Sekundärzielgruppe sind Organisationen, die lokale Gruppen stärken, sowie Entwickler*innen, die Community-Tools bauen.

Wir erreichen sie über bestehende Netzwerke unserer Projekte, über Pilotgruppen, die in den Entwicklungsprozess eingebunden sind, sowie über Workshops und Präsentationen auf Konferenzen und Community-Treffen.

---

## 9. MEILENSTEINE (max. 100 Wörter)

### M1: Architektur & Grundlagen (Monat 1)

- Definition der Daten- und Identitätsschnittstelle
- Connector-Struktur mit Referenz-Connector
- Projekt-Setup (Monorepo, TypeScript, CI/CD Pipeline inkl. autom. Testing)

### M2: Kernmodule (Monate 2-4)

- Map-Modul (MapLibre, Geo-Queries, Clustering)
- Kalender-Modul (Events, iCal / CalDAV-Integration)
- Feed-Modul (Aktivitäten-Timeline)
- Profile-Modul
- Gruppen-Modul (Membership, Rollen)
- regelmäßige Usability Tests

### M3: Integration & Referenz-App (Monat 5)

- White-Label-Referenz-App mit allen Modulen
- Docker-Setup für Selfhosting
- Admin Dashboard

### M4: Vorbereitung für Roll-Out und Second Stage (Monat 6)

- Stage/Demo Umgebung einrichten
- Website mit Dokumentation und Tutorials
- User-Testing mit Pilotgruppen
- Integration von Analytics und weitere Metriken

---

## 10. TEAM (max. 30 Wörter)

Das Projekt wird von einem multidisziplinären Team entwickelt, das über langjährige Erfahrung mit Open-Source-Community-Tools verfügt:

- **Anton Tranelis** — Projektkoordination, System-Architektur, Full Stack  
  <https://github.com/antontranelis>

- **Ulf Gebhardt** — Full Stack, DevOps, Infrastruktur  
  <https://github.com/ulfgebhardt>

- **Sebastian Stein** — Frontend-Entwicklung, UX/UI  
  <https://github.com/sebastian2357>
  
- **Mathias Lenz** — Qualitätssicherung, Testing, Dokumentation  
  <https://github.com/mahula>

---

## 11. ERFAHRUNG (max. 100 Wörter)

**Anton Tranelis**:

- [Utopia Map](https://github.com/utopia-os/utopia-map) - Initiator und Maintainer (Projektkoordination, Architektur, Entwicklung, UX)
- geo-Engine (webbasierte Kartenplattform zum Erfassen und Teilen von Ortsbezogenen Informationen) - Projektkoordination, Entwicklung, UX
- Charge&Fuel App (mobile App zum Laden und Tanken von Elektro- und Hybridfahrzeugen) - Anforderungsmanagement

**Ulf Gebhardt:**
- [Utopia Map](https://github.com/utopia-os/utopia-map) - Entwicklung, Github-Verwaltung, Github-Workflows, Typisierungen, Reviews, Hosting
- [ocelot.social](https://github.com/Ocelot-Social-Community/Ocelot-Social) - Entwicklung, Testing, Öffentlichkeitsarbeit, Hosting, Refactoring, Bumps, Entwicklungskoordination
- [DEMOCRACY App](https://github.com/demokratie-live) - Architektur & Entwicklung

**Sebastian Stein**:

- [ocelot.social](https://github.com/Ocelot-Social-Community/Ocelot-Social) - Entwicklung, UX
- Vairnana (ehemalige App mit Umkreissuche zur Förderung von Nachhaltigkeit im stationären Einzelhandel) - Gründer, Entwicklung, UX 
- [ESD](https://www.keysight.com/de/de/product/SL1091A/sl1091a-scienlab-energy-storage-discover-software.html) - Entwicklung, UX

**Mathias Lenz:**

- [Utopia Map](https://github.com/utopia-os/utopia-map) - Entwicklung, Testautomatisierung, DevOps
- [ocelot.social](https://github.com/Ocelot-Social-Community/Ocelot-Social) - Entwicklung, Testautomatisierung, DevOps, Dokumentation
---

## 12. ARBEITSSTUNDEN

1900

---

## 13. MOTIVATION (max. 100 Wörter)

Wir erleben täglich, wie lokale Initiativen an fehlenden digitalen Werkzeugen scheitern. Bestehende Plattformen passen nicht zu ihren Bedürfnissen, sind zu komplex oder zu unflexibel. Gleichzeitig fehlt Communities das technische Know-how, eigene Lösungen zu bauen.

Mit ocelot.social und Utopia Map haben wir gesehen, dass selbsthostbare, anpassbare Tools funktionieren – aber jedes Projekt muss zu viel selbst entwickeln. Real-Life Stack ist unsere Antwort: Wir schaffen wiederverwendbare Infrastruktur, die anderen hilft, schneller zu starten.

Uns treibt die Vision einer dezentralen, selbstbestimmten digitalen Welt an, in der Gemeinschaften Kontrolle über ihre Daten haben und Tools nutzen können, die echte Begegnungen fördern.

---

## 14. SECOND-STAGE-FÖRDERUNG

Ja

---

## 15. SECOND STAGE: SCHWERPUNKT (max. 175 Wörter)

In der Second Stage wollen wir uns intensiv auf die Zusammenarbeit mit realen Communities konzentrieren. Wir arbeiten direkt mit verschiedenen Gruppen zusammen und unterstützen sie bei der Einführung unserer Software und beobachten gemeinsam, wie sie sie im Alltag nutzen.

Dabei wollen wir verstehen, welche Funktionen echte Begegnungen, lokale Vernetzung und Kooperation fördern – und welche nicht. Dafür werten wir Metriken zu Aktivität, Vernetzung und Real-Life-Treffen aus, führen Interviews und übersetzen diese Erkenntnisse in weitere Optimierungen des Stacks.

Parallel erforschen wir, wie spielerische Mechanismen wie Quests, Badges und Fortschrittsanzeigen Menschen motivieren, neue Kontakte zu knüpfen, Treffen zu organisieren oder an ihnen teilzunehmen sowie eigene Gruppen und Projekte zu starten.

Wir entwickeln ein Playbook für neue Communities – mit Hosting-Guides, Einstiegsmaterialien und einer Roadmap, die zeigt, wie Gruppen den Stack einsetzen, anpassen und erweitern können.

Wir bereiten unsere Ergebnisse in Tutorials, Blogbeiträgen, Videos und Interviews so auf, dass weitere Communities inspiriert werden. Damit schaffen wir eine stabile Grundlage, auf der Communities den Real-Life Stack eigenständig nutzen und gemeinsam mit ihm wachsen können.

---

## 16. SECOND STAGE: MEILENSTEINE (max. 100 Wörter)

### M1: Community-Onboarding & Testing (Monate 7-8)

- 3 Pilot-Communities onboarden (Nachbarschaft, Bildung, Ressourcen-Sharing)
- Stage-1-Prototypen deployen und im Real-World-Einsatz begleiten
- Integration von Gamification-Elementen 
- Metriken erfassen: Nutzungsverhalten, Vernetzungsdynamik, Real-Life-Begegnungen, Commitment-Gap

### M2: Iteration & Skalierung (Monat 9)

- Learnings aus M1 in Produkt integrieren
- 3-5 weitere Communities onboarden (Self-Service mit Dokumentation)
- Best-Practices dokumentieren (Admin-Guides, Community-Building-Playbooks)

### M3: Impact & Nachhaltigkeit (Monat 10)

- Impact-Report: Welche Aktivierungs-Mechanismen funktionieren?
- Sustainability-Strategie (Community-Support-Modell, Post-Förderungs-Roadmap)
- Conference-Präsentationen (z.B. FOSDEM, GPN, Bits & Bäume)
- Öffentlichkeitsarbeit (Tutorials, Videos, Blog, Interviews)

---

## 17. BESTÄTIGUNGEN

```
✅ Ich habe die Checkliste für Bewerber*innen gelesen.

✅ Ich bin über 18 Jahre alt und habe meinen Hauptwohnsitz in Deutschland.

✅ Ich bin damit einverstanden, die Projektergebnisse unter einer Open-Source-Lizenz 
   (MIT oder Apache 2.0) öffentlich zugänglich über GitHub zur Verfügung zu stellen.
```

---

## LETZTE PRÜFUNG VOR EINREICHUNG

- [ ] Alle Teammitglieder haben zugestimmt
- [x] E-Mail-Adresse ist korrekt und wird regelmäßig gecheckt
- [ ] GitHub-Links funktionieren
- [ ] Externe Person hat Bewerbung gelesen
- [ ] Lizenz wurde im Team entschieden (MIT empfohlen)
- [ ] Projekttitel wurde final bestätigt
