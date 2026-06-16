# Architecture Decision Records (ADRs)

Hier liegen die **Design- und Architekturentscheidungen** des Real Life Stack.

ADRs dokumentieren das **Warum** (Kontext, Entscheidung, Alternativen, Konsequenzen) — Specs (`../`) das **Was** (normative Regeln). Ein Prinzip lebt knapp in der Spec; die Begründung und die verworfenen Alternativen leben hier. So bleibt die Spec sauber, und das Prinzip hängt nicht an der konkreten Implementierung: ein Rewrite erbt das Prinzip, die Realisierung ist austauschbar.

**ADR vs. RFC:** ADRs halten getroffene **Design-/Architekturentscheidungen** fest. Für größere **operative** Vorhaben (Prozesse, Migrationen, Rollouts) nutzen wir stattdessen einen RFC.

**Besonders bei UX:** Das Prinzip steht oft nicht vorne — es entsteht durchs Iterieren an der Implementierung. Der saubere Modus ist dann: iterieren, und sobald sich das Prinzip gesetzt hat, es *ernten* — knapp in die Spec, Begründung ins ADR.

## Format

- `# NNNN: Titel`
- **Status:** Entwurf / Accepted / Abgelöst durch ADR-NNNN / Verworfen
- `## Context` — welches Problem zu lösen war
- `## Decision` — was entschieden wurde, mit Regeln
- `## Consequences` — Folgen
- `## Alternatives` — was verworfen wurde und warum

Eine ADR wird **nicht** rückwirkend geändert. Ändert sich die Entscheidung, löst eine neue ADR die alte ab (Status der alten: „Abgelöst durch ADR-NNNN"). Nummerierung ist fortlaufend.

## Liste

- [0001 — Confirmation als neutrale RLS-Trust-Projektion](./0001-confirmation-view.md)
- [0002 — UI Panel- und Overlay-Ebenen](./0002-ui-panel-overlay-layers.md)
