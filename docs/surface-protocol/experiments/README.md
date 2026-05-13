# KI-Oberflächenexperimente

Status: Inspirationsstrang, kein Conformance-Nachweis.

Dieser Ordner sammelt Experimente, bei denen verschiedene KI-Tools denselben
neutralen Brief bekommen und Oberflächenkonzepte ohne konkrete
Real-Life-Stack-Layoutvorgaben entwickeln.

Ziel ist, nützliche Interface-Ideen zu entdecken. Die generierten Ergebnisse
sind kein angenommenes Design und keine zukünftige RLS-Spezifikation.

## Regeln

- Rohergebnisse getrennt von der Synthese halten.
- Rohergebnisse nicht umschreiben, damit sie RLS-konform wirken.
- Tool, Prompt, Datum und Vorgaben je Ergebnis festhalten.
- Generierte Konzepte als Inputmaterial behandeln, nicht als Entscheidung.
- Offene Ergebnisse erst nach der freien Exploration mit
  `../rls-baseline.md` vergleichen.

## Vorgeschlagenes Output-Format

```md
# Tool: <Toolname>

Datum: 2026-05-__
Prompt: `../prompts/open-layout.md`
Vorgaben: keine konkreten RLS-Layoutvorgaben
Zweck: Inspiration, kein angenommenes Design

## Rohergebnis

...

## Notizen

...
```

## Zweiter Experimentlauf

Nach der freien Exploration können dieselben Tools
[`prompts/rls-constrained.md`](./prompts/rls-constrained.md) bekommen. Diese
zweiten Ergebnisse sollten getrennt gespeichert werden, zum Beispiel:

```text
outputs/open-layout/
outputs/rls-constrained/
```
