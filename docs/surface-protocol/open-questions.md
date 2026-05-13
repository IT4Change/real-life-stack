# Offene Fragen

Status: Fragen für Anton, Sebastian und Timo.

## Scope

- Ist das erste Protokollziel die RLS Reference App, das Real Life Network,
  Timos Community-Aktivierungsflächen oder ein engerer Event-/Space-Prototyp?
- Soll das Oberflächenprotokoll nur App-Struktur beschreiben oder auch
  Design-Tokens, Sprache, Onboarding und Facilitator-Flows?
- Welche Teile sollen normativ werden und welche nur Empfehlungen bleiben?

## App-Shell

- Reicht eine Standard-AppShell oder brauchen wir benannte Shell-Varianten?
- Sind Spaces immer der primäre Kontextwechsel?
- Müssen Module immer sichtbare Navigationseinträge sein oder dürfen manche
  Oberflächen Modulgrenzen verstecken und aufgabenorientierte Flows zeigen?
- Wie sollen sich Mobile und Desktop unterscheiden, jenseits von
  Bottom-Navigation und Panel-Verhalten?

## Module

- Was ist das kleinste nützliche Modul-Manifest?
- Sollen Module benötigte Item-Felder, unterstützte Aktionen, Empty States und
  Composer-Voreinstellungen deklarieren?
- Wie deklariert ein Modul, dass es dasselbe Item als Preview, Detail, Inline,
  Panel oder Vollbild darstellen kann?

## Items

- Welche Item-Typen sind Kernbestand von v0.1?
- Sollen Item-View-Specs nach `type`, nach `schema` oder nach beidem
  adressiert werden?
- Wie werden mehrdeutige Items gerendert, wenn sie zu mehreren Modulen passen?
- Wie hängen Profil, User-Identity, öffentliches Profil und space-spezifisches
  Profil zusammen?

## Vertrauen und Zustimmung

- Welche Aktionen brauchen ein explizites Human Gate?
- Wie erklärt die UI, warum ein Mensch, eine Quest oder eine Veranstaltung
  vorgeschlagen wird?
- Wie werden Sichtbarkeit, Privatsphäre und lokale Zustimmung in Surface-Specs
  repräsentiert?
- Wie werden KI-generierte Vorschläge visuell von menschlichen Inhalten
  unterschieden?

## KI-Generierung

- Was darf ein KI-Generator erfinden?
- Was muss er aus dem Toolkit importieren?
- Was soll ein Validator zurückweisen?
- Soll der Generator Code, Blueprints, Storybook-Stories oder alles davon
  erzeugen?

## Arbeitsablauf

- Soll dieser Explorations-PR ungemergt bleiben, bis eine gemeinsame Synthese
  existiert?
- Sollen Vorschläge von Anton, Sebastian und Timo in diesem Branch, in
  Issues/Discussions oder an beiden Orten leben?
- Welcher Folge-PR sollte nach dem Termin der erste normative PR werden?
