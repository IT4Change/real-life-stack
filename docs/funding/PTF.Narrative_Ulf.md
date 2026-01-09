# Narrative

Wir möchten gegenüber dem PTF eine schlüssige Geschichte erzählen, die unsere Ziele in einem förderungswürdigen Kontext stellt und uns selber hilft unsere Mission zu verstehen.
Darüber hinaus stellt diese nochmal einen Kontext her, der uns helfen soll unsere Zielstellung auszuschärfen.

## Die Geschichte

Wir haben zwei Software-Lösungen, die ähnliche Ziele verfolgen.
- Ocelot.social (https://github.com/Ocelot-Social-Community/Ocelot-Social/) (https://ocelot.social/), ein Facebook-Ähnliches Soziales Netzwerk zum selber hosten.
- Utopia-Map (https://github.com/utopia-os/utopia-map/) (https://utopia-map.org/). Eine Karte ähnlich einer Google-Maps Karte, mit der Möglichkeit sein Profil und weitere POIs & Routen zu verorten.

Beide bestehenden Softwares erzielen Teilerfolge und sind im Einsatz.
- Ocean-Nomads. Hier wird die Karte eingesetzt, um Segler weltweit zu verorten und Segeltouren zu bewerben und durchzuführen.
- Menschlich-Wirtschaften e.G.. Hier wird ebenfalls die Karte eingesetzt, um Mitglieder der Genossenschaft und weitere Inhalte (Wanderjahr, Reiseziel, Linuxwerkstatt, ...) zu verzeichnen.
- wir.social. In unserem erweiterten Freundeskreis eingesetztes privates Social-Network, um Events und eigen geschaffenes zu präsentieren.
- freilernen.social. Ein Netzwerk einer freien Schule in Bayern, um die Kommunikation der Eltern zu vereinfachen und die Aktivitäten in der Schule und der Freizeitgestaltung der Kinder, sowie weitere Inhalte zu dokumentieren

### Die Ziele
Unsere Ziele, die wir mit unserer Software verfolgen sind die folgenden:
- Menschen wieder im echten Leben in Interaktion bringen
- Unterstützung lokaler Gemeinschaften, da diese Grundlage für lokale Interaktion sind
- Unterstützung für überregionaler/globaler Interessensgruppen (etwas das wir aktuell abbilden), um die Kommunikation und den Austausch zu fördern.

### Die Annahmen
Usere Annahmen sind die folgenden:
- Gemeinschaften haben oft ähnliche Probleme, brauchen aber teilweise spezielle Lösungen oder nur Teile eine Komplettlösungen. So erscheinen angebotene Lösungen oft zu komplex oder unpassend für das konkrete Problem.
- Gemeinschaften haben das Bedürfnis die Lösungen an ihre Gemeinschaft anzupassen. Sie wünschen die Lösung zu ihrer zu machen. Wir machen die Erfahrung, dass dies besonders durch die White-Label Option unserer beiden Softwareprodukte gewährleistet wird. Eine Gemeinschaft möchte nicht zu Plattform XY kommen und dort eine Gruppe betreiben, sondern eine eigene Plattform in ihren Namen, nach ihren Bedürfnissen gestalten.

Communities wollen: Datenbesitz, Selfhost

### Wohin wir möchten
Wir möchten aus beiden Software-Lösungen ein gemeinsames Produkt machen.
Beide SoftwareLösungen funktionieren noch nicht rund und wir möchten gerne prototypisch verschiedene Thematiken klären, bevor wir einen großen Wurf für die neue vereinte Software starten.

Thematiken, die wir gerne klären möchten
- UI & UX
  - bessere Integration von Karte & Feed. Dazu gibt es die ersten Versuche & Click Dummys
  - Wie promoten wir eine Aktion im echten Leben auf der UI, UX Optimierung auf diesen use-Case
- Gamification ->  Wie belohnen wir Interaktion im echten Leben
- Dezentralisierung & Absicherung der Software:
  - Wie bekommen wir die verschiedenen Instanzen Federiert
  - Wie können wir digital ein Web-Of-Trust zwischen den Mitgliedern aufbauen und die Vertrauenswürdigkeit sichtbar machen/nutzen
  - E2E Verschlüsselung von Kommunikation
- Verschiedene Bedarfe identifizieren und ausarbeiten (lokale Gemeinschaften)
  - Kalender - Organisieren von Veranstaltungen innerhalb einer lokal verorteten Gemeinschaft, Einladungen, Online-Veranstaltungen für überregionale Gruppen.
  - Karte - Verortung von Mitgliedern, Events und anderen geolokalisierter Daten für lokale und globale Gemeinschaften
  - Feed - Was passiert in der Gemeinschaft - Zeitliche Abfolge und personalisierte Inhalte
  - Dating - (lokal verorte) Dating-Optionen anbieten
  - Lebensmittelverteilung und Organisationsprobleme im Allgemeinen (Schulbus, Foodsharing, Solawi)
  - Arbeitseinsätze organisieren
  - Lokale Tauschgruppe
  - Teilen von Gegenständen (Kettensäge, Rasenmäher, ...)
- Lokale (Bildungs-)Angebote

Wir möchten einen Baukasten der einzelnen Module anbieten, sodass eine Gemeinschaft sich ihre Werkzeuge zusammenstellen kann, wie sie möchte. Wir würden gerne ermöglichen alle unsere Produkte auf Standards aufzubauen, sodass eine nahtlose Integration in bestehende Software möglich sein kann. ( Beispiel: Cal-Dav für den Kalender als Technologie). Wir möchten uns darauf konzentrieren praktikable Software für den realen Einsatz zu plane, prototypisch umzusetzen oder als Produkt anzubieten.

### Was wir nicht wollen
Wir wollen kein neues Protokoll entwickeln, es gibt genug davon. Weder ein neues Federierungsprotokoll noch eine Verschlüsselungstechnik. Stattdessen möchten wir gerne bestehende Technologie einsetzen.

## Prototype Fund
Im Rahmen des Prototype Funds möchten wir gerne 3 verschiedene Dinge untersuchen und Prototypen dafür entwerfen:

1. Wir möchten herausfinden, wie wir Karte, Feed & Kalender in ein UI integrieren können, sodass die Bedienung intuitiv und natürlich für den Nutzer ist. Hierzu bestehen die ersten Klick-Dummys, die Lösungen für das Problem zur Diskussion stellen. Wir diskutieren aktuell zu diesen Themen.
Ziel ist es einen Klick-Dummy zu produzieren, der alle Edge-Cases und alle User-Stories befriedigt (UI+UX)

2. Wir möchten herausfinden, wie wir die Interaktion im echten Leben befördern. Die Grundannahme ist, dass ein spielerischer Ansatz helfen kann, um die Menschen die Verbindung zwischen Real-Life & Digital-Life leben zu lassen. Diese Arbeit soll nicht zwangsläufig ein Prototyp produzieren, sondern ein Dokument der Wirkmechanismen, die wir uns vorstellen können, wie wir die Menschen zum Spielen im echten Leben, mithilfe von digitalen Mitteln, bewegen. Wir möchten einen "Papierprototypen" im Rahmen dieser Arbeit entwickeln, der es uns erlaubt die Gamification einer Echt-Welt-Probe zu unterziehen und zu messen, ob unsere Annahmen objektiv zutreffen.

3. Untersuchung, wie wir alle Anwendungen in einem Baukasten bereitstellen können ohne zu große Barrieren für die Integration mit anderen, nicht von uns produzierten, Produkten aufzubauen. Aktuell wird OAuth+OIDC als "Kleber"/Baukasten zwischen den einzelnen Anwendungen diskutiert. Ziel dieser Aufgabe ist es zu untersuchen, welche Technologie anderweitig als "Kleber" in Frage kommt, eine davon auszuwählen und einen Prototypen für ein Setup mit dieser Technologie bereitzustellen. Hierbei soll untersucht werden welche der Angeboten Open-Source-Lösungen am besten geeignet für unseren Anwendungsfall ist. Konkreter für den Fall von OIDC möchten wir gerne die angebotenen Lösungen vergleichen (Keycloak, Ory, Authentik, ...), eine auswählen und einen Prototypen für ein Setup + eine kleine Anwendung (z.B. einen Kalender (besteht bereits)) als OIDC-Client anbinden. 

Alle 3 Dinge sind jeweils ein Schritt zu dem oben beschrieben Produkt, welches wir zur Zeit entwerfen. Wir erachten die genannten 3 Prototypen/Untersuchungen für machbar und realistisch zum aktuellen Zeitpunkt umzusetzen und einen Erkenntnisgewinn und ggf. bereits eine produktiv einsetzbare Implementierung zu erzielen.

### Second Stage
Wir möchten uns darüber hinaus für die Second-Stage bewerben. Ziel ist es für uns hier bis zu 3 lokale Communities aus verschiedenen gesellschaftlichen Bereichen mit dem selben Problem (z.B. Kalender, Kommunikation, Essensverteilung, ...) zu identifizieren und mit diesen herauszufinden, ob wir eine Lösung schaffen können, die ihr Problem (teil-)löst. Im Rahmen dessen möchten wir unseren Gamification-"Papier-Prototype" anwenden, um weitere Erkenntnisse zu sammeln.

Für uns denkbar sind dabei aktuell zwei Anwendungen:
- Kalender (Einfach & mit der Gamification und der UI/UX-Untersuchung gut kompatibel)
- Lebensmittel-Verteilung (Ein reales Problem, bei dem wir bereits Kontakt zu einigen Gemeinschaften haben, die vor dieser Herausforderung stehen. Allerdings weniger kompatibel zu Gamification & UI/UX Prototyp)

Wir wünschen uns bei einer Förderung für Second Stage Unterstützung bei der Identifikation und der Kontaktaufnahme mit potentiell interessierten, lokal verorteten Gemeinschaften. Gerne aus dem gesamten Spektrum der Gesellschaft (Jung, Alt, Progressiv, Konservativ, Politisch & Unpolitisch, ...), um die erarbeiten Lösungen in den verschiedenen realen Szenarien auf die Probe zu stellen.

### Erfolgs- & Abbruchkriterien
Wir können genau dann einen Erfolg des Projektes verbuchen, wenn wir einen Erkenntnisgewinn gemacht haben. Diese wünschen wir auch zu dokumentieren und (neben den Prototypen & Dokumenten) als Ergebnis zu präsentieren.

Erkenntnisse erwarten wir dabei in folgenden Gebieten
- Was ist ein geeigneter "Kleber" für die verschiedenen Anwendungen. SII: Können bestehende Lösungen einer Gemeinschaft "angeklebt" werden.
- Welche Use-Cases gibt es für eine Karten-Feed-Kalender Anwendung. SII: Gibt es weitere, die nicht bedacht wurden.
- Wie sieht eine gute UX für eine Karten-Feed-Kalender Anwendung aus. Können wir diese Erkenntnisse prüfen (ggf. mit Gemeinschaften aus SII)
- Können wir Wirkmechanismen Identifizieren, welche es uns Erlaubt digitale Interaktion in Echt-Welt-Interaktion von Menschen zu verwandeln? Können wir prüfen ob unsere getroffenen annahmen in diesem Kontext zutreffen (SII)?

Das Projekt ist erfolgreich, wenn mindestens einer dieser Bereiche zu einer Erkenntnis führt. Eine Erkenntnis kann auch sein, dass erkannt wird was nicht funktioniert.

Ein besonderer Erfolg liegt dann vor, wenn (Teile der) erstellte(n) Prototypen für eine reale Anwendung genutzt werden können.
Weiterhin ist es ein großer Erfolg, wenn wir weitere Gruppen begeistern können unsere Software einzusetzen.

Abbruchkriterien in Rahmen des PTF gibt es nicht, da eine Finanzierung sichergestellt ist und somit der Rahmen für diese Forschung abgesichert ist (sofern wir gefördert werden).

Das Gesamt-Projekt muss dann abgebrochen werden, wenn sich unsere Grundannahmen als grundlegend falsch oder unerreichbar herausstellen.
Dieser Fall ist eher unrealistisch, wird aber der Vollständigkeit halber hier aufgezählt:
- Es ist nicht möglich Menschen vom Bildschirm in der Reale Welt zur Interaktion zu bewegen.
- Lokale Gemeinschaften setzen gerne auf die Lösung XY und sind 100% zufrieden mit einer zentralisierten Lösung
- Alle lokalen Gemeinschaften setzen die Supa-Dupa-Software ein. Andere Software ist nicht notwendig.
- (Lokale) Gemeinschaften existieren nicht mehr.

Wir sehen den Bedarf und die Anwendung unserer bestehenden Software bestätigt unsere Annahme. Wir arbeiten an diesen Lösungen seit einiger Zeit im Rahmen von Auftragsarbeit und als Hobby.

### Abgrenzung - Bestehende Lösungen
Wir möchten auch die Frage beantworten, warum wir der Meinung sind, dass wir die beschriebene Software entwickeln wollen und nicht Software XY verwenden.
Wir sind der Meinung, dass die Kombination an Software, die uns vorschwebt in dieser Form noch nicht existiert, aber ein Bedarf dafür besteht. Wir möchten aber nochmals betonen, dass wir das Rad nicht neu erfinden möchten, sondern auf allen Wegabschnitten bestehende Libraries, Protokolle und Software einsetzen möchten. Uns ist darüber hinaus die Integrationsfähigkeit und die Interoperabilität unserer Software wichtig und das lässt sich nur durch das Einhalten von Standards erreichen.

Im folgenden haben wir Software gelistet die Teile unserer Vorstellung bereits realisieren und analysieren was diese können und was nicht.
Grob (und vereinfacht zusammengefasst) kann man sagen, dass all die Software sehr spezifisch auf bestimmte Use-Cases zugeschnitten ist und teilweise sehr wenig Flexibilität besteht sie in andere Lösungen zu integrieren. Besonders dasjenige Werkzeuge, in dessen Rahmen Studien durchgeführt werden, die herausfinden, dass immer mehr als ein Tool benutzt wird, weist besonders wenige Schnittstellen auf (Karrot).

Die meisten der gelistete Software-Entwicklungen sind in dieser Form auch als Teil unserer wahrscheinlich wenig praktikabel, da sie bereits eine Vielzahl an Anwendungen kombinieren und dabei nicht alles als Schnittstelle/Protokoll oder Standard exponiert. Mobilizon legt großen Wert auf Schnittstellen ist daher ein potentieller Kandidat.

Fast alle haben gemein, dass sie versuchen mehrere Gruppen/Gemeinschaften auf eine Plattform zu bekommen. Ein diametraler Unterschied zu unserem Ansatz, der die einzelne Gruppe in den Mittelpunkt stellt.

Wir tendieren dazu kleinere Anwendungen (z.B. ein Kalender/einen Cal-Dav Server) einzusetzen anstatt bereits vollständig integrierter Lösungen. Wir wünschen diese Integration ausschließlich im Frontend zu vollziehen und die bestmögliche Nutzererfahrung zu erzielen. Eine Integration von Daten kann dabei im Frontend passieren oder wahrscheinlicher in einem, für das spezielle Frontend konzipierte Backend, was die einzelnen Daten/Protokolle bedient und die Inhalte integriert und aggregiert an das Frontend liefert. Das stellt sicher, dass wir die Anwendung sehr feingranular an einzelne Communities anpassen können ohne an Usability einzubüßen.

Hinweis: Teile der folgenden Sektionen (einzelne Software Analysen) sind mit Hilfe von KI entstanden.

#### Mobilizon
Mobilizon ist eine föderierte Event- und Gruppen-Plattform, entwickelt von der französischen Non-Profit-Organisation Framasoft als freie Alternative zu Facebook Events und Meetup.com.

Kernfunktionen: Events, Gruppen, Federation

Was Mobilizon abdeckt:

✅ Events & Kalender
✅ Gruppen
✅ Karten-Integration
✅ Federation (ActivityPub)

Was fehlt:

❌ Kein Social Feed im klassischen Sinne
❌ Keine nahtlose Integration Feed-Karte-Kalender
❌ Keine Gamification (bewusst!)
❌ Keine Food-Sharing/Lebensmittelverteilung
❌ Kein modularer Baukasten-Ansatz

Anpassung ist limitiert auf:
- White-Label: Jede Instanz hat eigene URL, Logo, Branding
- Administrator kann entscheiden:
  - Welche Instanzen zur Federation zugelassen werden
  - Registrierungsregeln
  - Moderationsrichtlinien

Feature-Modularität ❌

Große Limitation: Mobilizon ist monolithisch, nicht modular
Man bekommt alle Features oder muss im Code Features herausentfernen
Kein Baukasten-System wie bei Bonfire

#### Karrot

Karrot ist eine freie, Open-Source-Plattform zur Organisation von Grassroots-Initiativen, ursprünglich entwickelt für Food-Sharing-Communities, aber zunehmend für andere lokale, autonome, freiwillige Gemeinschaften genutzt.

Kernfunktionen: Koordination von Face-to-Face-Aktivitäten (Food-Sharing, Verteilung, Meetings), Gruppen-Management, Aktivitäten-System.

Karrot deckt ab:
- Food-Sharing Communities (euer Lebensmittelverteilungs-Use-Case!)
- Activity-basierte lokale Organisation
- Demokratische, autonome Gruppen

Was fehlt:
- Multi-Purpose Community-Plattformen
- Integration verschiedener Bedürfnisse in einem System
- Federation zwischen Communities
- Social-Media-Aspekte (Feed, Discovery)
- Event-Bewerbung (öffentliche Events)

#### Bonfire

Bonfire ist ein modulares, Open-Source-Framework für den Aufbau föderierter digitaler Räume, das Communities ermöglicht, ihre eigenen Social-Media-ähnlichen Plattformen zu gestalten und zu betreiben.

Kernfunktionen: Modulare Architektur, "Flavours" - Vorkonfigurierte Varianten:

Flavors:
- Bonfire Social 1.0 (gerade released, June 2025): Twitter/Mastodon-ähnlich
- Bonfire Cooperation (pre-alpha): Ökonomische Aktivitäten, Ressourcen-Koordination
- Bonfire Classic: Forum-ähnlich

Was Bonfire abdeckt:
- Community-first Philosophy
- ActivityPub Federation
- Lokale Autonomie
- Kann OIDC/OAuth + weitere Identity-Typen

#### Nextcloud

Ist eher für kleine Firmen geeignet als für Communities

#### nebenan.de

Ist wieder eine Plattform für alle

## Über uns

Wir sind
- Mathias Lenz (https://github.com/mahula)
- Sebastian Stein (https://github.com/sebastian2357)
- Anton Tranelis (https://github.com/antontranelis)
- Ulf Gebhardt (https://github.com/ulfgebhardt)

Wir wünschen uns nachhaltige Lösungen zu schaffen, die von vielen eingesetzt werden können. Wir glauben, dass Open-Source Lösungen dabei eine Wichtige Rolle spielen, diese Ziele zu erreichen.
Wichtige Maxime unsere Ausrichtung sind dabei die Dezentralisierung und die Ermächtigung des Einzelnen. Auch lokale, selbstorganisierte Gemeinschaften sind uns wichtig, da diese Grundlage für einen positiven Gesellschaftlichen Wandel sein können. Eine Vielfalt in der Landschaft der Gemeinschaften ist dabei der Schlüssel für eine Gesellschaft, die Platz für jeden Einzelnen hat.

Wenn ihr mehr über uns wissen möchtet, freuen wir uns über eine Einladung oder einen Anruf.

### Hintergund

Wir sind im gemeinnützigen busFaktor() e.V. engagiert, benannt nach dem [Busfaktor](https://en.wikipedia.org/wiki/Bus_factor), der sich um das verbreiten des Wissens zu Software und deren Entwicklung bemüht, um besagten Faktor zu erhöhen. Mehr hierzu: https://www.busfaktor.org/

Als Freelancer haben wir das ein oder andere Projekt gemeinsam bestritten und organisieren, bzw vermarkten, uns unter dem Namen IT4C (IT Team For Change). Dabei handelt es sich nicht um eine Organisation, sondern um ein loses Entwickler-Kollektiv. Mehr hierzu: https://it4c.dev/