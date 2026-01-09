# Input Form

* Als Nutzer möchte ich Einträge verschiedener Art posten können (siehe [Eintrags-Types](../concepts/item-types.md))
* Als Nutzer möchte ich gerne zu einer Vorschau meines Eintrags (Detailansicht und/oder Preview) wechseln können
* Als technisch nicht versierter Nutzer möchte ich nicht durch unnötige Button irritiert werden
* Ich möchte den Typ meines Eintrags während des Erstellen ändern können (z.B. einen Post beim Erstellen  zu einer Veranstaltung oder Projekt machen)
* Ich möchte den Typ meines Eintrags später ändern können (z.B. einen Post nachträglich zu einem Event machen)

## Input Widgets

* Das Inputformular soll je nach Context (Eintrags-Typ) aus unterschiedlichen Widgets/Input-Elmenten zusammengesetzt werden
  * Post
    * Text
  * Veranstaltung
    * Titel
    * Text
    * Zeit
    * Ort
    * Menschen (heißen hier "Teilnehmer einladen")
  * Gruppe
    * Titel (heißt hier Name)
    * Text
    * Menschen (heißt hier "Mitglieder einladen")
  * Anzeigen
    * Titel
    * Text
    * Tags
* Ganz oben im Formular soll über ein Tab-Menü der Typ des Eintrags gewählt werden können (dieser definiert die angezeigten Input-Elemente) 
* Es sollen bei Bedarf zusätzliche Input-Elemente hinzugefügt werden können
* Nicht benötigte Input-Elemente sollen entfernt werden können
* Die Input Elemente haben eine feste Reihenfolge. Neu hinzugefügte Elmente werden an der ensprechenden Stelle hinzugefügt (Title, Text, Medien, Zeit, Ort, Menschen, Tags)
* Unten im Textfeld (dieses ist in jedem Fall immer Sichtbar) befinden sich kleine Icons, die die nicht angezeigten Input-Elemente definieren. Beim Klick auf ein solches Icon öffnet sich das entsprechende Input-Element und das Icon verschwindet. Beim entfernen, des entsprechenden Input-Elements aus dem Formular, wird das Icon wieder eingeblendet.
* Es soll immer die Sichtbarkeit des Eintrags (öffentlich, privat) gewählt werden können

### Titel
* Sollte immer oben als erstes Widget über dem Text platziert werden.

### Text
* Ich möchte den Text strukturieren (H1, H2, H3, Aufzählung, Quoute, Image) mit hilfe einer Leiste am oberen Rand des Textfelds
* Markdown soll automatisch erkannt werden
* Über "@" soll ein beliebiger User/Eintrag verlinkt werden können (Autovervollständigung bestehender User und Einträge)
* Über "#" soll ein Hashtag/Schlagwort generiert und gesetzt werden können (Autovervollständigung für existierende Schlagworte)
  
### Ort
* Als Nutzer möchte ich einen Standort durch seine Adresse auswählen können (Autovervollständigung mit hilfe von Geocode)
* Als Nutzer möchte ich alternativ einen Standort auf der Karte auswählen können
  * Die Karte soll erst sichtbar werden, wenn ich einen Button gedrück habe um das Layout nicht zu überladen
  * Nach dem Auswählen soll der Standort als Address-String angegeben werden (Karte wieder ausgeblendet)
* Als Nutzer möchte ich einen Standort nach seinen Koordinaten finden können
* Über eine Checkbox/Toggel kann man "Online-Veranstaltung" aktivieren. Dann wird das Orts-Input-feld zu einem "Link"-Textfeld geändert.

### Medien
* Ich möchte Bilder und Videos hinzufügen können
* Ich möchte eine Vorschau der hinzugefügten Medien sehen können
* Ich möchte Medien per Drag and Drop hinzufügen können
* Ich möchte Medien vom Dateisystem auswählen können
* Ich möchte die Reihenfolge der Medien per Drag and Drop ändern können

### Datum
- Das Datums widget sollte immer aus dem startzeitpunkt (datum + uhrzeit) bestehen
- Es sollte optional auch ein Ende definiert werden können
- Außerdem sollten Wiederholungen definiert werden können

### Menschen

- Ich möchte besthende User hinzufügen können
- "@"-Verlinkungen im Text-Widget sollen automatisch übernommen werden
- Autovervollständigung bestehender User

### Tags / Schlagwörter

- Ich möchte besthende und neue Schlagwörter hinzufügen können
- "#"-Erwähnungen im Text-Widget sollen automatisch übernommen werden
- Autovervollständigung bestehender Schlagwörter

### Sichtbarkeit

* Als Nutzer möchte ich eine öffentlichen Eintrag erstellen können, damit ich den Link verteilen kann und auch Gäste ihn direkt sehen kann.
* Als Nutzer möchte ich einen privaten Post erstellen können, den nur User aus meinem Netzwerk sehen können, wenn sie eingeloggt sind.

## Designs

<img width="719" height="380" alt="image_2025-09-21_14-54-36" src="https://github.com/user-attachments/assets/9b94213a-9b42-4348-a488-a819df4662ed" />
<img width="769" height="638" alt="image_2025-09-21_14-55-10" src="https://github.com/user-attachments/assets/27089c55-3967-4580-aea9-ea20b9f7e830" />
<img width="759" height="507" alt="image_2025-09-21_14-55-55" src="https://github.com/user-attachments/assets/b5670170-4bec-4ca3-b023-6e42cf606c6e" />
<img width="734" height="480" alt="image_2025-09-21_14-56-14" src="https://github.com/user-attachments/assets/6d559c7c-e429-49ec-a8f8-02b234a15e73" />


## User stories

This user stories descripe how and why certain users want to contribute certain content. This stories descripe different types of content, including implicit content like authorship and in what combinations those datasets occur.

### US01 - Funny Video
An user wants to post a Video he just found on the Internet. He downloaded the video and reuploads it on the platform.
E.g. "Funny Cat Video.wmv"

### US02 - Article
An user wants to publish an article about a topic he currently is researching. He provides a title image, a title and text including images.
E.g. "Article about Black Holes"

### US03 - Question
An user is new and just wants to ask a simple question. He provides the question as text.
E.g. "Am I in the right place here?"

### US04 - Online-Event
An user wants to promote an online video call event in the future. He provides a location link, a title image, a title, a date+timespan & a description text 
E.g. "My new Breathwork Coaching Season has started"

### US05 - Offline-Event
An user wants to promote a gathering event in the future. He provides a location position, a title image, a title, a date+timespan & a description text 
E.g. "Join our IT4C Meetup Event in Kassel"

### US06 - Short News
An user wants to promote a recent development in his life without a lot of details. He provides an Text and sometimes he would also provide an image.
E.g. "I got my drivers license"

### US07 - Reminder
The system reminds all users of a short fact. Provides a text and possibly an related user.
E.g. "Peter has birthday today"

### US08 - Location
An user provides location information for a thing. He descries the thing with a short text.
E.g. "Apple tree"

### US09 - Past Event
An user describes an event which had taken place. He provides a location position. a title video, a title, a data+timespan in the past, a description text with lots of images and a list of users who have participated in that event.
E.g. "Around he Fire - last weekend was wonderful"

### US10 - Event gets an update
An user has posted about an event in the past and now wants to post an update with images, statement about how the event was and list of participants. The images and statement should inform all users again about this event.
E.g. "The fire was wonderful - look at all those happy faces"

### US11 - Call to Action
An user wants to promote some link and urges others to click his link. He provides an CTA Link, Title, Title Image, Text with embeded Video and Product Images
E.g. "Buy the new beauty products from SkinCancerTM"

## Data

This table describes which data is provided by the user for each user story above. It also defines wether this input is implicit or explicit and how the input is received

| Data              | Implicit | Method              | US01 | US02 | US03 | US04 | US05 | US06 | US07 | US08 | US09 | US10 | US11 |
|-------------------|----------|---------------------|----- |------|------|------|------|------|------|------|------|------|------|
| Title Video       | No       | File Upload         | x    |      |      |      |      |      |      |      | x    |      |      |
| Title Image       | No       | File Upload         |      | x    |      | x    | x    | -    |      |      |      | x    | x    |
| Title Text        | No       | Input Text          |      | x    |      | x    | x    |      |      |      | x    | x    | x    |
| Text              | No       | Input Text          |      |      | x    | x    | x    | x    | x    | x    |      | x    |      |
| Text w. Images    | No       | Input + File Upload |      | x    |      |      |      |      |      |      | x    |      | x    |
| Text w. Video emb.| No       | Input Text          |      |      |      |      |      |      |      |      |      |      | x    |
| Images            | No       | File Upload         |      |      |      |      |      |      |      |      |      | x    | x    |
| Date+Timespan     | No       | Input Calendar      |      |      |      | x    | x    |      |      |      | x    | x    |      |
| Location Link     | No       | Input Link          |      |      |      | x    |      |      |      |      |      |      |      |
| Location Position | No       | Input Link          |      |      |      |      | x    |      |      | x    | x    | x    |      |
| User Related      | No       | Input User          |      |      |      |      |      |      | -    |      | x    | x    |      |
| Update            | No       | ???                 |      |      |      |      |      |      |      |      |      | x    |      |
| CTA               | No       | Input Link          |      |      |      |      |      |      |      |      |      |      | x    |
| Author            | Yes      | Token               | x    | x    | x    | x    | x    | x    | x    | x    | x    | x    | x    |
| Date              | Yes      | Servertime          | x    | x    | x    | x    | x    | x    | x    | x    | x    | x    | x    |
