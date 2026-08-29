# Prototype Feature Inventory (apps/prototype)

**Status:** Inventar (kein normativer Text)
**Quelle:** `apps/prototype` (`@real-life-stack/app`, Sebastians UI-Prototyp), read-only durchgegangen am 2026-06-17.
**Zweck:** Erfassen, welche Funktionalitaeten aus dem Prototyp es wert sind, in den produktiven RLS-Stack (`packages/toolkit`, `apps/reference`, `packages/data-interface`) zu uebernehmen, und mit welchem groben Aufwand/Risiko.

## Lesehinweise

- Dieses Dokument ist **deskriptiv**, nicht normativ. Es legt keine Regeln fest.
- **Relevanz** bezieht sich auf den Nutzen fuer RLS gegenueber dem aktuellen Stand des Toolkits.
- **Belegt durch** nennt immer die konkrete Prototyp-Datei.
- **Bereits in RLS** verweist auf vorhandene Toolkit-/Reference-Aequivalente, damit Doppelarbeit vermeidbar ist (Stand: Unified-Module-UX-Sprint, siehe [unified-module-ux-2026-06.md](./unified-module-ux-2026-06.md)).
- Spalte **Visuell pruefen?**: „Ja" heisst, Anton sollte das Feature im laufenden Prototyp durchklicken, weil sein Wert primaer in Interaktion/Animation/Timing liegt und nicht aus dem Code allein eindeutig ist. „Nein" heisst, Funktion und Datenfluss sind aus dem Code eindeutig.

## Wichtiger Kontext zum Datenstand des Prototyps

Der Prototyp ist ein reiner UI-Prototyp ohne das RLS-Data-Interface. Er liest und schreibt direkt aus `localStorage` (`posts`, `users`, `conversations`, `messages`, `notifications`) und schreibt neue Eintraege unter einem **anderen** Key (`socialPosts`) als er liest (`posts`), siehe `SmartPostWidget.tsx` `handleSubmit` vs. `MainContent.tsx`. Viele Aktionen (Teilen, Spenden, Beitreten, Filter im Feed, Sidebar-Menue) sind absichtlich Platzhalter mit „Feature nicht implementiert"-Toast. Der Wert liegt durchgehend in **UI-Bausteinen und Interaktionsmustern**, nicht in der Datenlogik.

## High Relevance

| Feature | Belegt durch (Datei/Komponente) | Was es tut | Bereits in RLS? | Aufwand/Risiko | Visuell pruefen? |
|---|---|---|---|---|---|
| Messaging / Chat (komplett) | `components/messages/MessagingWidget.tsx`, `MessageThread.tsx`, `MessageBubble.tsx`, `MessageInput.tsx`, `ConversationList.tsx`, `ConversationItem.tsx`, `NewChatDialog.tsx`, `hooks/useMessages.ts` | Vollstaendiges 1:1- und Gruppen-Chat-UI: Conversation-Liste mit Suche, Split-View (Desktop) bzw. sequentielle Navigation (Mobile), Thread mit Reply, Anhang-Preview (Bild/Datei via `URL.createObjectURL`), Emoji-Reaktionen pro Nachricht, Pin/Mute, Direkt- und Gruppen-Conversation anlegen. | Nein. `data-interface` hat eine `MessagingCapable`-Capability (`hasMessaging()`, `index.ts`), die aber nur Relay-Status liefert (`getRelayState`, `getOutboxPendingCount`); kein Chat-/Conversation-Baustein in `packages/toolkit` oder `data-interface`. Fazit „Nein" bleibt. | Hoch. Groesster Block. UI ist weitgehend uebernehmbar, aber Persistenz/Transport (Data-Interface, ggf. WoT-Messaging-Adapter) fehlt komplett und ist das eigentliche Risiko. Als Toolkit-Modul mit Adapter-Anbindung planen. | Ja |
| Emoji-Reaction-Picker mit Kategorien + Suche | `components/ui/EmojiReactionPicker.tsx` | Picker mit Kategorie-Tabs, Volltextsuche ueber deutsche/englische Emoji-Namen, „Zuletzt verwendet"-Sektion, Reaktions-Count-Badge pro Emoji, Click-Outside-Close. | Teilweise. Toolkit hat `reactions/reaction-picker.tsx` + `reaction-bar.tsx`, aber **ohne** Kategorien/Suche/Recent (grep nach `categor|search|recent` in der Picker-Datei leer). | Mittel. Die Emoji-Namen-Map ist gross, aber statisch und gut portierbar. Risiko: Bundle-Groesse der Namens-Map; ggf. lazy laden. Sauber gegen die bestehende `reaction-constants.ts` mergen statt parallel. | Ja |
| Standort-Widget mit Geocoding + Karten-Picker | `components/widgets/LocationWidget.tsx` | Adresssuche und Reverse-Geocoding via Nominatim (OpenStreetMap), Klick-auf-Karte zum Setzen der Position, Online-/Offline-Toggle (Link vs. Adresse). | Nein. Toolkit hat `composer/widgets/location-widget.tsx`, aber Nominatim/Geocoding existiert nur in dieser Prototyp-Datei (einziger Treffer im Repo). | Mittel. Nominatim-Anbindung ist klein, aber externe Abhaengigkeit mit Rate-Limits/Privacy-Implikationen (Nutzungsrichtlinie, evtl. eigener Tile/Geocode-Endpoint). In das bestehende Location-Widget integrieren. | Ja |
| Adaptives Detail/Profil-Panel mit Drag-Bottom-Sheet | `components/profile/ProfileView.tsx` | Drei Darstellungsmodi (`overlay`, `sidebar`, `draggable`), mobiles Bottom-Sheet mit Snap-States (small/medium/maximized/free), Drag-to-close, Banner-Collapse beim Scrollen, manueller Moduswechsel. | Teilweise. Toolkit hat `layout/adaptive-panel.tsx` + `module-panel`. Ob die feinkoernigen Snap-States und der Drag-to-close des Prototyps darin enthalten sind, ist offen. | Mittel bis hoch. Gesten-/Animationslogik (`@use-gesture/react` + framer-motion) ist fummelig und stark vom Gefuehl abhaengig. Klaeren, was `adaptive-panel` schon kann, bevor portiert wird. | Ja |

## Medium Relevance

| Feature | Belegt durch (Datei/Komponente) | Was es tut | Bereits in RLS? | Aufwand/Risiko | Visuell pruefen? |
|---|---|---|---|---|---|
| In-App-Notifications (Bell + Panel) | `components/notifications/NotificationBell.tsx`, `NotificationPanel.tsx`, `NotificationItem.tsx`, `hooks/useNotifications.ts` | Glocke mit Unread-Badge, Desktop-Dropdown- und Mobile-Fullscreen-Panel, Gruppierung Neu/Gelesen, „alle als gelesen", Klick auf Notification navigiert zum betroffenen Post (Feed oder Karte). | Nein. Kein Notification-Baustein im Toolkit gefunden. | Mittel. UI klar; offen ist die Quelle der Notifications (Events aus dem Data-Interface, vgl. `use-incoming-events.tsx`). | Ja |
| Eintragstyp-FAB mit Typ-Auswahl | `App.tsx` (FAB + DropdownMenu), `hooks/useComposer.ts`, `hooks/useScrollFab.ts` | Floating-Action-Button oeffnet Dropdown zur Auswahl des Eintragstyps (FAB nutzt das aus `SmartPostWidget.tsx` importierte `POST_TYPES`: Post/Veranstaltung/Projekt/Anzeige), startet den passenden Composer; FAB blendet beim Scrollen weicher aus. | Teilweise. Toolkit hat `create-fab` + `feed-composer-trigger`, aber die **Typ-Vorauswahl per Dropdown** und das Scroll-Fade sind hier eigenstaendig. | Niedrig bis mittel. Kleiner Baustein, gut isolierbar. Hinweis: Prototyp-`POST_TYPES` sind inkonsistent (siehe Abschnitt „Drift"). | Ja |
| Composer Live-Vorschau (Markdown) | `components/SmartPostWidget.tsx` (Toggle Bearbeiten/Vorschau) | Umschalter zwischen Formular und gerenderter Markdown-Vorschau (`react-markdown` + `remark-gfm`), inkl. Medien-Grid, Datum, Ort, Personen, Tags. | Unklar/teilweise. Toolkit-`content-composer` existiert; ob ein Vorschau-Toggle dabei ist, ist nicht verifiziert. | Niedrig. Reine View-Logik. | Ja |
| Inline @/#-Mentions im Textfeld | `components/widgets/TextWidget.tsx` (`handleTextChange`, `onMention`) | Tippt man `@name `/`#tag ` im Beschreibungsfeld, wird automatisch das Personen- bzw. Tags-Widget aktiviert und der Eintrag uebernommen. | Teilweise. Toolkit hat `composer/widgets/text-widget.tsx` (+ `tiptap-editor`); diese spezifische Mention-zu-Widget-Verdrahtung ist im Prototyp eigenstaendig. | Mittel. Aktuell sehr simpel (Split auf Leerzeichen). Im Toolkit existiert ein Tiptap-Editor, in den dieses Verhalten anders eingebettet werden muesste. | Ja |
| Medien-Widget mit Drag-Reorder | `components/widgets/MediaWidget.tsx` | Upload per Drag-and-Drop, Vorschau-Grid, Neuanordnung der Medien per Drag (`react-dnd`). | Teilweise. Toolkit hat `composer/widgets/media-widget.tsx`; ob Reorder dort enthalten ist, ist offen. | Niedrig bis mittel. `react-dnd` ist eine zusaetzliche Abhaengigkeit; pruefen, ob das Toolkit-Widget bereits ein anderes DnD nutzt. | Ja |
| Profil-Sektion: Crowdfunding | `components/profile/components/Crowdfunding.tsx` | Fortschrittsbalken raised/goal, Spenderzahl, Liste letzter Spenden, Spenden-Button (Platzhalter). | Nein (im Profil/Detail). | Niedrig. Reine Anzeige; Daten in `Post.crowdfunding` vorhanden. Aktion ist Platzhalter. | Nein |
| Profil-Sektion: Quests | `components/profile/components/Quests.tsx` | Quest-Detail (Schwierigkeit/Zeit/Belohnung) oder Quest-Liste; Aktionen Platzhalter. Passt zum geplanten Quests-Modul. | Nein. Vgl. Konzept [gamification.md](./gamification.md). | Niedrig. Liste nutzt teils Mock-Daten; bei Uebernahme an echte Items binden. | Nein |
| Profil-Sektion: EventFunctions | `components/profile/components/EventFunctions.tsx` | Event-Datum/-Zeit, „Am Event teilnehmen" (Platzhalter), Teilnehmerliste mit Status (confirmed/invited), eingebettete Mini-Karte. | Teilweise. Detail-Panel existiert; diese eventspezifische Funktionsleiste ist eigenstaendig. | Niedrig bis mittel. Teilnahme-Aktion braucht Data-Interface-Anbindung. | Nein |
| Profil-Sektion: ContactInfo / Badges / Members / Projects / ComingEvents | `components/profile/components/ContactInfo.tsx`, `Badges.tsx`, `Members.tsx`, `Projects.tsx`, `ComingEvents.tsx` | Personen-/Projekt-Profil-Bloecke: Kontaktdaten, Auszeichnungen, Mitgliederliste, verknuepfte Projekte, kommende Events (Relation-basiert via `profileAdapter.ts`). | Teilweise. RLS hat Relations (siehe [relations.md](./relations.md)) und Profil; diese konkreten Sektionsdarstellungen sind eigenstaendig. | Niedrig. Anzeige-Komponenten; Datenableitung in `lib/profileAdapter.ts` belegt. | Nein |
| Type-getriebene Profil-Konfiguration | `lib/profileConfig.ts`, `lib/profileAdapter.ts` | Pro Item-Typ (person/event/project/quest/offer) wird konfiguriert, welche Sektionen erscheinen; Adapter mappt `Post` auf `ProfileData` inkl. Distanzberechnung und Relations. | Teilweise. RLS hat `item-types.md` + Detail-Panel; dieses deklarative Sektions-Mapping ist als Muster interessant. | Niedrig. Gutes Vorbild fuer datengetriebene Detail-Komposition; an RLS-Item-Typen anpassen. | Nein |
| Reaktions-Leiste am Detail-Footer | `components/profile/ProfileBottomBar.tsx`, `ProfileReactionsBar.tsx` | Fixierte untere Leiste mit Reaktionen + Kommentar-Eingabe im Detail. | Teilweise. Toolkit hat `reaction-bar`; die Footer-Integration im Detail ist eigenstaendig. | Niedrig. | Ja |
| Lightbox fuer Galerie | `components/profile/components/Lightbox.tsx`, `MediaGallery.tsx` | Klick auf Galeriebild oeffnet Vollbild-Lightbox mit Navigation und Bildbeschreibung. | Unklar. Kein dedizierter Lightbox-Treffer im Toolkit gesehen. | Niedrig. Eigenstaendige UI; Galerie faellt aktuell auf Mock-Bilder zurueck, wenn keine Medien vorhanden. | Ja |

## Low Relevance

| Feature | Belegt durch (Datei/Komponente) | Was es tut | Bereits in RLS? | Aufwand/Risiko | Visuell pruefen? |
|---|---|---|---|---|---|
| View-zu-View-Deeplinking Feed/Karte/Kalender | `hooks/useAppNavigation.ts`, `components/shared/PostCard.tsx` | Klick auf Ort/Zeit eines Posts springt in Karte bzw. Kalender und oeffnet dort das Detail; Back-Button kehrt mit gemerkter Scrollposition zurueck. | Teilweise. RLS hat alle drei Module bereits; das spezifische Cross-View-Springen ist als Muster notierenswert. | Niedrig. An RLS-Routing/`ModulePanel` koppeln statt Prototyp-Logik (DOM-Query auf `.overflow-y-auto`) zu uebernehmen. | Ja |
| Map-Recenter mit Detail-Offset | `components/views/MapView.tsx` (`MapController`) | Beim Oeffnen eines Markers fliegt die Karte so, dass der Punkt nicht unter dem Detail-Panel verschwindet (Offset je nach Panel-Breite/Hoehe). | Teilweise. RLS-Map existiert; dieser Recenter-Offset ist ein nettes Detail. | Niedrig. Kleiner, aber spuerbarer UX-Feinschliff. | Ja |
| Leaflet-StrictMode-Patch | `components/views/MapView.tsx` (Z. 12 ff.) | Patcht `L.Map.prototype._initContainer`, um den React-19-StrictMode-Doppelmount-Fehler „Map container is already initialized" zu vermeiden. | Pruefen. Falls RLS-Map denselben Fehler hat, ist das ein konkreter Fix. | Niedrig. Eher Bugfix-Hinweis als Feature. | Nein |
| Feed-Sortierung (Neueste/Entfernung) | `components/layout/MainContent.tsx`, `components/views/FeedView.tsx` | Dropdown sortiert Feed chronologisch oder nach Entfernung (im Prototyp grob ueber Latitude). | Teilweise. RLS hat FilterBar; eine echte Distanz-Sortierung waere eigenstaendig. | Niedrig. Distanzlogik im Prototyp ist nur Platzhalter. | Nein |
| Toast-System | `components/ui/use-toast.ts`, `toaster.tsx`, `toast.tsx` | Radix-basiertes Toast-System. | Nicht vorhanden. Kein Toast-/Sonner-Primitive in `packages/toolkit`, `apps/reference` oder `data-interface` (grep leer). | Niedrig. Offener Uebernahmepunkt: kleines Primitive, bei Bedarf ins Toolkit aufnehmen. | Nein |

## Nicht uebernehmen (Platzhalter/Demo)

Aus dem Code eindeutig als Stub erkennbar, kein Uebernahmewert:

- „Feature nicht implementiert"-Toasts in `components/layout/Navbar.tsx` (User-Menue), `components/layout/Sidebar.tsx` (komplettes Seitenmenue ist Demo), `PostCard.tsx` (Teilen/Kommentare-Buttons), `MainContent.tsx` (Feed-Filter), sowie in den Profil-Aktionen (Beitreten/Spenden/Quest).
- `data/mockData.ts`, `mockMessages.ts`, `mockNotifications.ts`: reine Seed-Daten fuer den Prototyp.
- Hartkodierter Logo-/Markentext und Avatar in `Navbar.tsx`.

## Bekannte Drift / Stolperfallen im Prototyp (vor Uebernahme beachten)

- **Inkonsistente Eintragstypen:** Drei Sets nebeneinander. `App.tsx` importiert `POST_TYPES` aus `SmartPostWidget.tsx` (Post/Veranstaltung/Projekt/Anzeige) und nutzt es im FAB-Dropdown. `useComposer.ts` definiert ein eigenes lokales `POST_TYPES` = Post/Event/Quest/Crowdfunding. `types/index.ts` `Post.type` = person/event/project/offer/quest. Bei Uebernahme zwingend an die RLS-Item-Typen ([item-types.md](./item-types.md)) angleichen.
- **localStorage-Key-Mismatch:** Composer schreibt nach `socialPosts`, gelesen wird `posts`; neue Eintraege erscheinen im Prototyp nicht im Feed (`SmartPostWidget.tsx` vs. `MainContent.tsx`).
- **DOM-gekoppelte Navigation:** Scroll-Restore und FAB-Sichtbarkeit haengen an `document.querySelector('.overflow-y-auto')` (`useAppNavigation.ts`, `useComposer.ts`, `useScrollFab.ts`). In RLS ueber Refs/State loesen, nicht ueber globale DOM-Queries.
- **Mock-Fallbacks in Anzeige-Komponenten:** `MediaGallery.tsx` und `Quests.tsx` zeigen Mock-Inhalte, wenn keine echten Daten anliegen. Beim Portieren entfernen.

## Empfohlene Reihenfolge (Vorschlag, nicht normativ)

1. Emoji-Reaction-Picker (Kategorien/Suche) in den bestehenden `reactions`-Baustein mergen. Klar abgegrenzt, hoher sichtbarer Mehrwert.
2. LocationWidget-Geocoding ins Toolkit-`location-widget` integrieren (externer Endpoint klaeren).
3. Notifications-Baustein als Toolkit-Modul, gespeist aus dem Data-Interface.
4. Messaging als eigenes Toolkit-Modul plus Adapter-Anbindung (groesster Brocken, eigener Plan).
5. Profil-Sektionen (Crowdfunding/Quests/EventFunctions/ContactInfo) datengetrieben an das bestehende Detail-Panel anschliessen.
