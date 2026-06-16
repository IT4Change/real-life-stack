# 0002: UI Panel- und Overlay-Ebenen

**Status:** Accepted — Ebene 1 + Content-Inset umgesetzt (#77/#78); Ebene-2-Back-Stack und Ebene-3-Notifications offen.

## Context

Die Reference-App hatte mehrere unabhängige Overlay-Flächen angesammelt: ein Content-Panel **pro Modul** (`ModulePanelProvider` je View), ein separates Profil-Panel, ein separates Debug-Panel — alle `fixed`, mehrere rechts auf derselben z-Ebene. Folgen:

- „Panel über Panel": zwei gleichseitige Sidebars überlagerten sich (Debug + Modul-Detail).
- Panel-State ging beim Modul-Wechsel verloren (Provider-Unmount).
- Eingehende Events (Verifizierung, Space-Einladung) poppten als Modal über das, was der Nutzer gerade tat.

Gebraucht wurde ein kohärentes Modell: wo Overlays leben, wie viele gleichzeitig offen sein dürfen, wie verschachtelte Flows (Kontakte → Verifizieren) laufen, und wie zeitkritische Interrupts erscheinen, ohne laufende Arbeit zu zerstören.

## Decision

Overlays folgen einem **Drei-Ebenen-Modell**. Pro Ebene existiert höchstens **eine** Fläche; Ebenen dürfen einander überlagern, weil sie sichtbar von anderer Art sind.

- **Ebene 1 — Content-Panel:** eine **app-weite** Instanz (Sidebar auf Desktop, Drawer auf Mobile). Aller Modul-Content (Item-Detail, Composer, Filter) öffnet darin; Content wird **getauscht, nie gestapelt**. Bleibt beim Modul-Wechsel offen (persistente Fläche, nicht modulgebunden). Realisiert als ein app-level `ModulePanelProvider`.
- **Ebene 2 — Dialoge:** fokussierte Tasks (Kontakte, Verifizieren, Gruppe, Profil) als zentriertes Modal + Backdrop (Desktop) / Sheet (Mobile). Sie überlagern Ebene 1 — zulässig, weil ein abgedunkeltes Modal sich als höhere Ebene liest und den Ebene-1-Content darunter erhält. Ein Dialog ist **nie** eine zweite Sidebar; Dialoge bleiben einfache Modals (keine `AdaptivePanel`s).
- **Ebene 3 — Notifications:** zeitkritische Interrupts (eingehende Verifizierung, Space-Einladung) erscheinen als **nicht-destruktiver Hinweis**. Sie ersetzen nie Ebene-1/2-Content und nehmen keinen Fokus; der Nutzer öffnet sie bewusst → der Flow landet dann in Ebene 2.

**Content-Bereich:** unterhalb der Top-Nav, links einer rechten Sidebar, rechts einer linken Sidebar. Er rückt automatisch ein, wenn eine Sidebar öffnet — die Panel-Fläche publiziert ihre Breite als CSS-Variable (`--adaptive-panel-margin-right` / `-left`), die der Content als Padding konsumiert; sonst ist er eine `flex-1`-Spalte.

**Dev-Tooling (Debug)** ist die eine Ausnahme anderer Art auf Ebene 1: es teilt sich das eine rechte Panel als Content-`kind`. Ein künftiges linkes Nav-Menü nutzt `side="left"` und rückt den Content gleich ein.

Zwei abgeleitete Regeln:

1. „Eine Fläche pro Ebene" verhindert gleichartiges Stapeln **strukturell**, nicht per z-index-Tuning.
2. Overlays sind **Präsentation, nie Aktivierung** — welche Items ein Modul zeigt, entscheidet Feld-Präsenz (siehe [06-schema-composition.md](../06-schema-composition.md)).

## Consequences

- Eine z-Ebene, ein Resize-State, ein Mobile-Drawer pro Ebene.
- Verschachtelte Flows pro Ebene brauchen einen **Back-Stack** (Ebene 1: Detail → Edit; Ebene 2: Kontakte → Verifizieren → zurück) — offen.
- Das persistente Content-Panel motiviert **geteilten Filter-State** über Module (heute pro View) — offen.
- Interrupts müssen von auto-poppenden Dialogen auf die Notification-Ebene umziehen — offen.

## Alternatives

- **Panel-Provider pro View (Status quo):** jedes Modul mountete sein eigenes Panel, Debug/Profil separat. Verworfen: verursachte die gleichseitige Überlagerung und verlor die modulübergreifende Persistenz.
- **Debug nach links:** Quick-Fix gegen die Überlagerung. Verworfen: links ist für ein späteres Nav-Menü reserviert, und eine nicht-modale Dev-Sidebar neben dem Content ist dasselbe Anti-Pattern; das eine rechte Panel zu teilen ist sauberer.
- **Reines Flex-Row mit Sidebars als Flex-Children:** deklarativ, keine CSS-Var. Vorerst verworfen: der Mobile-Drawer/Modal kann kein Flex-Row-Child sein, also bräuchte es trotzdem die Overlay-Ausnahme; das CSS-Var-Inset liefert denselben Content-Bereich (inkl. links), und das linke Menü slottet gratis rein.
- **Dialoge als `AdaptivePanel`s / ein Stack für alles:** verworfen — Dialoge sind immer zentrierte Modals (nie Sidebar/Drawer), `AdaptivePanel` bringt dort nichts; und Interrupts in das eine Panel zu falten ließe ein System-Event den Nutzer-Kontext verdrängen.

## Realisierung (Pointer, nicht normativ)

- app-level `ModulePanelProvider` in `apps/reference/src/App.tsx` (#77)
- `CreateFab` + `AppShellMain` lesen `--adaptive-panel-margin-*` (#78)
- Panel-Modi (modal/sidebar/drawer) + CSS-Var-Publikation: `packages/toolkit/src/components/layout/adaptive-panel.tsx`
- normative Kurzfassung: [01-app-composition.md](../01-app-composition.md) → „Overlay-Flächen"
