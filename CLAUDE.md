# Claude Code Anweisungen

## Projekt

Dieses Monorepo enthält das `@real-life-stack/toolkit` Design System und zugehörige Apps.

## Design System Dokumentation

**Alle UI/UX-Entscheidungen müssen dokumentiert werden.**

Bei jeder Design-Änderung:

1. Anforderung in `packages/toolkit/docs/UI-REQUIREMENTS.md` eintragen
2. Changelog am Ende der Datei aktualisieren

Die Dokumentation dient als Referenz falls das Design System gewechselt wird.

## Wichtige Dateien

- `packages/toolkit/docs/UI-REQUIREMENTS.md` - UI/UX Anforderungen
- `packages/toolkit/src/styles/globals.css` - Theme & CSS-Variablen
- `apps/reference/` - Showcase-App zum Testen der Komponenten

## Konventionen

- shadcn/ui Pattern: Komponenten liegen im Repo, nicht als npm-Dependency
- Tailwind CSS v4 mit OKLCH-Farben
- Reference App verwendet deutsche Demo-Texte
