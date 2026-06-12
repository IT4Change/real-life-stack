# 0002: Eindeutiger `type` neben Schema-Composition — Diskussionsgrundlage für Anton

**Status:** Diskussionsentwurf (offen)
**Adressat:** Anton
**Autor:** Sebastian
**Datum:** 2026-06-12

---

## Worum es geht

Anton, wir hatten eine hitzige, aber gute Diskussion: Sollen Items einen eindeutigen `type`
(event, task, post, …) tragen — oder soll sich Bedeutung und Verhalten allein aus den
vorhandenen Feldern ergeben? Dich begeistert die Flexibilität des feld-basierten Ansatzes,
mich sorgt der Verlust einer klaren, verlässlichen Unterscheidung.

Dieses Dokument ist mein Versuch, die Punkte so zu ordnen, dass du meine Argumentation
Schritt für Schritt nachvollziehen kannst. Ich stütze mich dabei bewusst auf die **Sache
selbst** — auf das Datenmodell und die Logik dahinter —, nicht auf den aktuellen Stand der
Implementierung; denn Code ist schnell geändert und taugt darum schlecht als Beweis. Wo ich
dir recht gebe, sage ich es. Wo ich glaube, dass ein Argument nicht trägt, begründe ich es.

Mein Fazit vorweg, damit du weißt, worauf es hinausläuft: **Wir streiten gar nicht über
dasselbe.** Dein eigentliches Ziel — „Module dürfen mich nicht in ein `type`-Korsett zwingen"
— ist absolut richtig und ist im Code längst erreicht. Aber dafür muss `type` nicht
*verschwinden*; es muss nur *aufhören, die Struktur zu diktieren*. Das sind zwei verschiedene
Dinge, und der Unterschied ist der Kern dieses Dokuments.

---

## 1. Wir sind uns über mehr einig, als es im Streit klang

Bevor ich widerspreche, der gemeinsame Boden — denn der ist groß:

- **Module sollen feld-basiert rendern, nicht type-basiert.** Der Kalender soll *jedes* Item
  mit `start` zeigen, nicht nur `type: "event"`. Der Feed zeigt nicht nur Posts. Die Karte
  zeigt alles mit Position. Das war immer das Ziel und ist richtig.
- **Ein Item soll gleichzeitig in mehreren Modulen erscheinen können** (ein Workshop ist
  Termin *und* Ort). Auch das: einverstanden.
- **Die alte Layer-Doppelrolle aus Utopia-Map war ein Fehler** — Struktur und Thema in einem
  Konzept zu vermischen hat das Layer-Chaos erzeugt. Auch da sind wir einig.

Diese drei Punkte sind nicht strittig. Die Frage ist allein: **Folgt daraus, dass `type`
weg muss?** Meine Antwort: nein — und die drei Punkte erzwingen es auch nicht.

---

## 2. Der Denkfehler, den ich sehe: „Module ignorieren `type`" ≠ „`type` existiert nicht"

Das ist mein zentraler Punkt, also nehme ich ihn zuerst.

Was dich an deinem Ansatz begeistert, ist die Freiheit der **Module**, auf Felder zu schauen
statt auf `type` zu verzweigen. Diese Freiheit ist real und wertvoll. Aber sie **kostet `type`
nichts**: Ein Modul, das Felder liest, darf `type` einfach ignorieren — `type` muss dafür
nicht aus dem Datenmodell entfernt werden.

> Man muss ein Datum nicht *löschen*, um es *optional* zu behandeln.

„Module müssen nicht auf `type` schauen" (richtig, nützlich) ist nicht dasselbe wie
„`type` darf nicht existieren" (Datenvernichtung). Der erste Satz ist dein berechtigtes Ziel.
Der zweite ist eine viel stärkere, unnötige Forderung, die nichts dazugewinnt.

---

## 3. Weglassen von `type` ist Informationsverlust, kein Flexibilitätsgewinn

Hier kommt der Punkt, der mich am meisten überzeugt — und ich glaube, er ist logisch zwingend,
nicht nur Geschmackssache.

`type` ist ein **Datum** am Item. Wer `type` *plus* Felder hat, kann alles tun, was der
Nur-Felder-Konsument tut (`type` einfach ignorieren) — **und zusätzlich** Dinge, die ohne
`type` unmöglich sind. Das ist eine echte Obermenge. Mehr Information kann eine Interpretation
nie *einschränken*, nur erweitern.

### Das konkrete Beispiel

Zwei Items mit **identischen Feldern**:

```json
{ "data": { "start": "2026-07-15T18:00", "title": "Permakultur-Workshop" } }
{ "data": { "start": "2026-07-15T18:00", "title": "Steuererklärung abgeben" } }
```

Aus den **Feldern allein** sind die ununterscheidbar — beide haben `start`. Die Information
„das eine ist eine Veranstaltung, zu der man *kommt*; das andere eine Frist, die man
*erledigt*" lebt **nur in `type`**. Nimmt man `type` weg, ist diese Unterscheidung nicht
„flexibler interpretierbar" — sie ist **weg**. Kein Konsument, kein User, keine spätere
Automatik kann sie rekonstruieren, weil die erzeugende Intention nirgends mehr steht.

Und es schlägt direkt auf Verhalten durch: Das Workshop-Item will „Teilnehmen"-Button und
Teilnehmerliste; das Steuer-Item will ein „Erledigt"-Häkchen. **Gleiche Felder, gegensätzliche
Flows.** Das war meine ursprüngliche Sorge, und sie ist ohne `type` strukturell nicht lösbar —
egal wie clever die Felderkennung ist.

---

## 4. Deine Tag-Idee fängt das nicht auf (und re-vermischt die Achsen)

Du hast vermutet, das ließe sich über **Tags** auffangen. Die Spec geht tatsächlich in die
Richtung — `docs/spec/07-tags.md` (im Branch `spec/type-primary-reading`) schreibt explizit:

> „Marker-Farbe und Icon des Layers werden Tag-Display."
> „Damit User Themen nicht wieder in Templates abbilden, müssen Tags gleichwertig sichtbar sein."

Das ist der eingestandene Versuch, die alte `type`/Layer-Last auf Tags umzuleiten. Aber er ist
**strikt schwächer**, aus drei Gründen:

1. **Tags sind optional und unverbindlich, `type` ist garantiert und genau-eins.** Ein Tag
   `#event` kann fehlen, doppelt sein, widersprüchlich sein (`#event` *und* `#task` am selben
   Item). `type` ist dagegen genau einmal pro Item vorhanden und eindeutig. Für „verlässlich
   unterscheiden und filtern" brauchst du genau diese Garantie. Ein Tag liefert sie
   konstruktionsbedingt nicht.

2. **Tags sind eine andere Achse — Thema, nicht Intention.** Die Specs selbst betonen, Tags
   seien die *orthogonale* Kategorisierungs-Achse (Permakultur, Bildung). Die Intention „dies
   ist eine Veranstaltung" auf einen Tag zu legen, vermischt genau die zwei Achsen wieder,
   deren Trennung das ganze Modell rechtfertigt. Das ist der Utopia-Map-Fehler in neuem Gewand.

3. **Ein Pflicht-Tag `#event` mit Sonderbehandlung *ist* `type` — nur schlechter.** Wenn das
   System am Ende doch einen verlässlichen „das ist ein Event"-Marker braucht, hätten wir
   `type` reerfunden: ohne Eindeutigkeitsgarantie, ohne feste Stelle im Datenmodell. Mehr
   Komplexität für ein schwächeres `type`.

---

## 5. Der behauptete Vorteil deines Ansatzes ist app-intern nicht wirksam

Der eine Punkt, an dem dein Ansatz objektiv etwas Neues liefert, ist **komponierbare,
externe Validierung & Föderation** über `@context`-Schemas (analog W3C Verifiable Credentials).
Das ist ein echtes Konzept — und ich will es nicht kleinreden. Aber zwei Dinge daran sind
unabhängig vom aktuellen Stand der Implementierung wahr:

**Erstens: Der Nutzen ist per Konstruktion *extern*, nicht app-intern.** Worin besteht der
Gewinn von maschinenlesbaren `@context`-Schemas? Darin, dass *fremder* Code — ein anderer
Server, ein unabhängig entwickelter Connector, ein Validator, den wir nicht kontrollieren —
ein Item interpretieren und prüfen kann, **ohne unseren Code zu besitzen**. Innerhalb unserer
eigenen App ist dieser Gewinn definitionsgemäß abwesend: Wir *haben* unseren Code. Was ein
Item bei uns bedeutet, wissen wir aus unseren eigenen Typen und unserer eigenen Render-Logik.
Das ist keine Aussage über den heutigen Implementierungsstand, sondern über die *Natur* des
Vorteils: Er entsteht erst an der Grenze zwischen zwei unabhängigen Systemen. Solange es diese
Grenze nicht produktiv gibt (echte Föderation, fremde Connectoren, die signierte Items ohne
unseren Code austauschen), ist der Vorteil latent — nicht falsch, aber wirkungslos für alles,
was *innerhalb* der App passiert.

**Zweitens — und das ist der entscheidende Punkt: Dieser Vorteil ist kein Argument gegen
`type`.** Selbst wenn die Föderation morgen real wird und die Schema-Validierung voll greift,
folgt daraus nichts über `type`:

> Externe Schema-Composition und ein eindeutiger `type` schließen sich **nicht** aus.
> Beide leben auf verschiedenen Achsen — Schemas beschreiben *welche Felder* ein Item hat,
> `type` *als was* es gemeint ist. Man muss `type` nicht opfern, um die Schemas zu bekommen.

Dein eigener Branch bestätigt das übrigens: `06-schema-composition.md` behält `type` als
Template-Referenz *neben* den `@context`-Schemas. Das Schema-System ist also nie als *Ersatz*
für `type` entworfen worden — es ist eine zusätzliche, orthogonale Achse. Die Föderations-
Begründung rechtfertigt damit allenfalls den Schema-Apparat. Sie rechtfertigt nicht, `type`
wegzunehmen — diese beiden Fragen muss man strikt auseinanderhalten.

---

## 6. Die Filter-Regel im Branch beruht auf einem Kategorienfehler

Dein Branch `spec/type-primary-reading` definiert `type` als „Template-Referenz" und stellt
eine Regel auf (`06-schema-composition.md`, Abschnitt „Templates", Regel 3):

> „Modul-Aktivierung, **Filterung** und Validierung laufen **nie** über das Template."

Bei *Modul-Aktivierung* gebe ich dir vollkommen recht (siehe Abschnitt 7). Aber das Wort
**Filterung** gehört nicht in diese Aufzählung — und zwar aus einem prinzipiellen Grund, nicht
weil irgendein heutiger Code es anders macht. Die Regel wirft zwei Dinge zusammen, die ihrer
Natur nach verschieden sind:

| Frage | Wer stellt sie? | Worauf beruht die Antwort? |
|---|---|---|
| „Erscheint dieses Item im Kalender?" | das **System** | **Feld-Präsenz** (`start`). Nie `type`. |
| „Zeig mir nur Veranstaltungen." | der **User** | seine **Intention** — und die lebt in `type`. |

Die erste Frage ist ein Modul-Mechanismus: Sie muss feld-basiert sein, sonst verschwinden Items
zu Unrecht (ein Task mit Fälligkeitsdatum gehört in den Kalender). Die zweite Frage ist **keine
Modul-Aktivierung** — sie ist eine User-Abfrage. Sie nach `type` zu beantworten ist nicht „die
Module verzweigen auf `type`", sondern „der Mensch wählt nach dem, als was Dinge gemeint sind".

Warum das nicht über Felder gehen kann, ist genau mein Argument aus Abschnitt 3: Ein Task mit
Deadline und ein Event haben beide `start`. Eine feld-basierte Abfrage `hasField: start` liefert
dem User **beide** — also genau nicht „die Veranstaltungen", sondern „alles mit einem Datum".
Die Intention, die der User meint, ist aus den Feldern nicht rekonstruierbar; sie steht nur in
`type`. Eine Regel, die das Filtern nach `type` verbietet, verbietet damit ein User-Bedürfnis,
das auf keinem anderen Weg erfüllbar ist.

Das ist kein Detail: Es ist exakt mein ursprüngliches Anliegen („ich will eindeutig nach Events
filtern"). Die Branch-Regel verbietet es per Federstrich — nicht weil es technisch unmöglich
wäre, sondern weil sie User-Filter fälschlich als Modul-Mechanismus einordnet und beide mit
demselben Verbot belegt.

---

## 7. Wo ich dir recht gebe — und der Vorschlag zur Versöhnung

Damit das hier kein Einseiter wird: Dein berechtigtes Anliegen ist, dass **Modul-Sichtbarkeit
nicht über `type` läuft**. Das ist richtig und soll so bleiben. Der Fehler in der aktuellen
Branch-Regel ist allein, dass sie Modul-Sichtbarkeit und User-Filter in einen Topf wirft
(Abschnitt 6). Trennt man die beiden, lösen sich Streit und Widerspruch auf. Mein Vorschlag:

> **Trenne Modul-Sichtbarkeit (feld-basiert, nie `type`) von User-Filtern (dürfen `type`,
> Felder und Tags nutzen).** Ein Filter nach `type` ist legitim, solange er nur User-Queries
> bedient und nicht die Modul-Aktivierung steuert.

Damit bekommst **du** deine feld-basierten Module (volle Flexibilität, kein type-Korsett) und
die UI ein verlässliches Event-Filter — ohne Widerspruch. Es ist keine Konzession, die einer
von uns macht; es ist die saubere Trennung zweier Achsen, die ohnehin verschieden sind.

---

## 8. Zusammenfassung in einer Tabelle

| Behauptung | mit `type` + Feldern | nur Felder (Tags als Auffang) |
|---|---|---|
| Module rendern feld-basiert | ✅ | ✅ |
| Item gleichzeitig in mehreren Modulen | ✅ | ✅ |
| Gleiche Felder, verschiedene Intention unterscheidbar | ✅ | ❌ Information existiert nicht mehr |
| Verlässlich nach „Events" filtern | ✅ | ❌ Tag optional/uneindeutig |
| Achsen Struktur/Thema sauber getrennt | ✅ | ❌ Tags müssen Intention mittragen |
| Externe Schema-Validierung / Föderation | ✅ (koexistiert mit `type`) | ✅ (aber kein Argument gegen `type`) |

**Kernsatz:** Das Weglassen von `type` fügt keine Flexibilität hinzu — die kommt vollständig
aus feld-lesenden Modulen, die mit `type` koexistieren. Es *entfernt* aber Interpretations-
information, die nirgends sonst lebt. Du hast das richtige Mittel (Module lesen Felder) an das
falsche Ziel (`type` abschaffen) gekoppelt.
