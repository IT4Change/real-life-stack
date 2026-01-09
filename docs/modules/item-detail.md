# Item Detail

* Zeigt alle Details für unterschiedliche [Eintrags-Typen](../concepts/item-types.md)
* Bestehen je nach Eintrags-Typ aus untrschiedlichen Subkomponenten

## Elemente

### Header

* Einträge haben immer einen Header
  * Kann ein Banner-Bild haben
  * das Bannerbild blendet sich aus beim Herunterscrollen in der Detail-Ansicht
  * Kann ein Profilbild / Avatar haben
  * Sollen die Adresse des Eintrags anzeigen (Geocoder)
  * Sollen die Entfernung des Eintrags von der jeweiligen Position des Nutzer
  * Hat einen Call-to-Action-Button
  * Hat einen Navigations-Button
  * Hat einen Share-Button

### Text

* Zeigt mit Markdown formatierten Text an

### Mediengalerie

* Zeigt eine Galerie mit zugehörigen Bildern oder Videos an
* Durch Klicken auf ein Galerie-Element wird das Bild (in einer Lightbox) geöffnet

### Veranstaltungsfunktionen

* Zeigt Startzeit und Datum der Veranstaltung an
* Kann Endzeit und Datum der Veranstaltung anzeigen
* Kann eine Schaltfläche „Teilnehmen” oder „Anmelden” anzeigen
* Kann eine Liste der Teilnehmer mit Status (eingeladen, bestätigt, ...) enthalten

### Kommentare / Reaktionen

* Ermöglicht es Benutzern, Kommentare zu einem Element zu hinterlassen
* Kann Benutzern anbieten, auf ein Element zu reagieren (Daumen hoch, Herz, +1, ... )

### Crowdfunding

* Zeigt ein oder mehrere zugehörige Crowdfunding-Projekte mit ...
  * gesammelter Geldsumme
  * Anzahl der Spenden oder Spender
  * Spenden-Button
  * kann das Finanzierungsziel und den Fortschritt anzeigen

### Mitglieder / Besucher

* Zeigt alle Personen an, die mit dem Element in Verbindung stehen

### Bevorstehende Veranstaltungen

* Zeigt eine Liste der mit dem Element verbundenen Veranstaltungen an

### Projekte

* Zeigt eine Liste der mit dem Element verbundenen Projekte an

### Quests / Aufgaben

* Zeigt eine Liste der mit dem Element verbundenen Quests / Aufgaben an

### Abzeichen

* Zeigt eine Liste der Abzeichen (Erfolge) an

### Kontaktinformationen

* Zeigt Kontaktinformationen an

Übersetzt mit DeepL.com (kostenlose Version)

## Layout

* Die Detailansicht auf Mobilgeräten sollte am oberen Rand einen Grip haben der es ermöglicht die Ansicht größer oder kleiner zu ziehen
* Wenn das Grip weit nach oben gezogen wird, soll die Detailansicht maximiert werden. Wenn das Grip weit nach unten gezogen wird soll die Detailansicht geschlossen werden.
* Die Karte sollte den Marker im freien Bereich über der Detailansicht zentrieren (auf mobilgeräten)
* Die Karte sollte den Marker im freien Bereich links neben der Detailansicht zentrieren (auf Desktop)

* Beim Klick auf einen Eintrag mit Geostandort wird vom Feed auf die Karte gewechselt
  * die Detailansicht legt sich über die Karte
  * Der entspechende Marker wird auf der Karte zentriert
  * Desktop
    * Die Vorschau aus dem Feed expandiert zur Detailansicht, während sie auf die rechte Bildschirmhälfte (Heroanimation, hält den Fokus) wandert, während gleichzeit im hintergrund auf die karte gewechselt wird
    * Links ist die Karte zu sehen
  * Mobile
    * Sie füllt die unteren 70% des Bildschrims
    * Oben ist die Karte zu sehenaktuelle
* Beim Klick auf einen Eintrag ohne Geostandort legt sich die Detailansicht als Modal über den Feed
