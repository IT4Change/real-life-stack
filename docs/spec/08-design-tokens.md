# Design-Tokens

**Status:** Normativer Entwurf v0.1

Diese Spec definiert die **Design-Tokens** des Real Life Stack: die benannten, plattform-neutralen Werte für Farbe, Typografie, Radius, Schatten und Motion, aus denen jede UI-Fläche ihre konkrete Darstellung ableitet.

**Token-Namen sind die Quelle der Wahrheit.** UI-Code (Tailwind-Klassen, Inline-Styles, Leaflet-Marker, Canvas) leitet seine Werte aus den Tokens ab, nicht umgekehrt. Ein Token wird an genau einer Stelle definiert; Flächen referenzieren es über seinen Namen. Hartkodierte Werte, die ein bestehendes Token duplizieren, gelten als Spec-Verletzung.

Heutige Verankerung im Code: die semantischen Farb-, Radius-, Schatten- und Typografie-Tokens leben als CSS Custom Properties in `packages/toolkit/src/styles/globals.css` (OKLCH, `:root` + `.dark`, exponiert für Tailwind v4 über `@theme inline`). Die deterministische Tag-Palette lebt in `packages/toolkit/src/lib/utils.ts` (`getTagColor` / `getTagAccentColor`). Motion-Werte liegen heute inline an den Komponenten und werden hier als zu konsolidierende Token-Schicht benannt.

## Token-Schichten

Tokens sind in drei Ebenen organisiert. Die Spec schreibt die Ebenen-Trennung vor, nicht jeden Einzelwert.

1. **Primitive Tokens** (Roh-Werte): konkrete Farben, Längen, Zeiten ohne Bedeutungszuweisung, z.B. ein OKLCH-Tripel oder `300ms`. Sie SOLLEN nicht direkt in UI-Komponenten referenziert werden.
2. **Semantische Tokens** (Rollen): benannte Rollen, die auf Primitive verweisen, z.B. `--primary`, `--background`, `--border`, `--shadow-card`. UI referenziert MUSS bevorzugt diese Ebene.
3. **Komponenten-Tokens** (optional): komponenten-lokale Ableitungen, z.B. `--sidebar-primary`, `--adaptive-panel-margin-right`. Sie SOLLEN auf semantische Tokens zurückführen, wo eine Rolle existiert.

Regeln:

1. Eine Fläche referenziert MUSS die höchste passende Ebene (semantisch vor primitiv).
2. Ein neuer Wert, der eine bestehende Rolle hat, MUSS das vorhandene semantische Token nutzen statt eines neuen Primitivs.
3. Dark Mode ist eine Neuzuordnung der semantischen Tokens (`.dark`-Override), keine zweite Komponenten-Logik.

## Farb-Tokens

### Semantische Palette

Die semantische Farb-Palette ist in `globals.css` als OKLCH-Custom-Properties definiert und über `@theme inline` für Tailwind verfügbar. Sie deckt mindestens ab: `background`/`foreground`, `card`, `popover`, `primary`, `secondary`, `muted`, `accent`, `destructive`, `warning`, `pink`, `border`, `input`, `ring`, `chart-1..5`, `sidebar*`. Jedes Token hat eine `:root`- und eine `.dark`-Belegung.

Regeln:

1. UI MUSS Farben über diese semantischen Tokens beziehen (Tailwind-Utility wie `bg-primary`, `text-muted-foreground`, oder `var(--…)` für Nicht-Tailwind-Flächen).
2. Ein Foreground-Token (`--primary-foreground`, `--card-foreground`, …) MUSS für Text auf der jeweiligen Hintergrundrolle genutzt werden, damit Kontrast erhalten bleibt.
3. Neue Produkt-Farben SOLLEN als neue semantische Rolle ergänzt werden, nicht als Inline-Hex.

### Deterministische Tag-Palette

Die Tag-Palette ist die kategoriale Farbskala für Tags ohne explizites Tag-Item (siehe [07-tags.md](07-tags.md)). Sie wird deterministisch aus dem Tag-String per Hash gewählt und ist über alle Flächen identisch (Posts, Filter, Kanban, Map-Marker).

Verankerung: `TAG_PALETTE` in `packages/toolkit/src/lib/utils.ts`. Jeder Paletten-Eintrag paart die Tailwind-Chip-Klassen (`getTagColor`) mit einem CSS-Color-Accent (`getTagAccentColor`) für Nicht-Tailwind-Flächen.

Regeln:

1. Das Default-Tag-Display MUSS aus dieser Palette stammen; die Zuordnung String → Eintrag ist deterministisch und stabil.
2. Tailwind-Flächen nutzen MUSS `getTagColor`, Nicht-Tailwind-Flächen (Leaflet, Canvas, Inline-SVG) `getTagAccentColor` aus demselben Paletten-Eintrag, damit ein Tag farblich überall gleich erscheint.
3. Chip-Variante (`getTagColor`) und Accent-Variante (`getTagAccentColor`) MÜSSEN denselben Index treffen; ein zusätzlicher Paletten-Eintrag wird in beiden Varianten gepflegt.
4. Die Reihenfolge bestehender Einträge SOLL stabil bleiben (Reihenfolge bestimmt die Hash-Zuordnung; Umsortieren ändert die Farbe bestehender Tags).

### Space-Brand-Farbe

Ein Space KANN eine eigene Brand-Farbe (`primaryColor`) führen, die das semantische `--primary`-Token im Kontext dieses Space überschreibt. Damit erscheinen FAB, aktive Navigation und Akzentflächen in der Farbe des Space.

Regeln:

1. Setzt ein Space eine Brand-Farbe, MUSS sie als Override des semantischen `--primary`-Tokens (und seines Foregrounds) wirken, nicht als parallele Sonderlogik pro Komponente.
2. Ist keine Brand-Farbe gesetzt, gilt der Default aus `globals.css`.
3. Die Brand-Farbe verschiebt nur Akzent-Rollen; Hintergrund-, Border- und Text-Rollen bleiben aus der Default-Palette, damit Lesbarkeit und Dark Mode erhalten bleiben.

## Motion-Tokens

Motion-Tokens benennen die Animations-Dauern und Easings. Sie liegen heute inline an den Komponenten und SOLLEN in eine benannte Token-Schicht konsolidiert werden, damit Übergänge über App Shell, Panels, FAB und Modul-Flächen konsistent sind.

### Dauern

Die etablierten Dauern und ihre Verwendung:

| Rolle | Wert | Verwendung (Beispiel) |
|---|---|---|
| `motion-fast` | 150ms | Mikro-Feedback (Drag-Handle, kleine Opacity-Wechsel) |
| `motion-default` | 200ms | Standard-Übergänge (Hover, Sidebar-Breite, Dialog) |
| `motion-medium` | 250ms | Wischen/Slide auf Modul-Flächen (Calendar-Swipe) |
| `motion-panel` | 300ms | Panel-/FAB-Bewegung, App-Shell-Inset (siehe unten) |
| `motion-sheet-open` | 500ms | Sheet-Öffnen (langsamer als Schließen für ruhiges Auftauchen) |

### Easings

| Rolle | Wert | Verwendung |
|---|---|---|
| `ease-out` | `ease-out` | Standard für eintretende/verschiebende Bewegung (FAB, App-Shell-Inset, Panel-Breite) |
| `ease-panel` | `cubic-bezier(0.32, 0.72, 0, 1)` | Panel-Höhe/Opacity beim Resize (weiches Auslaufen) |
| `ease-in-out` | `ease-in-out` | symmetrische Sheet-Transition |
| `ease-linear` | `ease-linear` | gleichförmige Sidebar-Breite |

### Panel-/FAB-Konvention

Die zentrale Bewegungs-Konvention ist `300ms ease-out` (`motion-panel` + `ease-out`). Sie verbindet drei Flächen, die gemeinsam reagieren, wenn eine rechte Sidebar öffnet:

- der `CreateFab` schiebt nach links neben das Panel (`transition-all duration-300 ease-out`),
- die App-Shell rückt ihren Content ein (`transition-[padding] duration-300 ease-out`),
- das `AdaptivePanel` passt seine Breite an (`width 300ms ease-out`).

Alle drei lesen dieselbe `--adaptive-panel-margin-right`-CSS-Variable als Ziel-Inset. Diese gemeinsame Dauer/Easing MUSS erhalten bleiben, damit FAB, Content und Panel synchron laufen (kein Auseinanderdriften der Bewegung).

Regeln:

1. Neue Panel-/Inset-bezogene Übergänge SOLLEN `motion-panel` + `ease-out` nutzen.
2. Während eines Live-Resizes wird die Transition ausgesetzt (`in-[.adaptive-panel-resizing]:transition-none` bzw. `isResizing`), damit das Ziehen nicht hinterherläuft. Diese Aussetzung MUSS bei Resize-Interaktionen erhalten bleiben.
3. `prefers-reduced-motion` SOLL respektiert werden: Bewegungs-Tokens auf 0 reduzieren, semantische Farb-/Layout-Tokens bleiben unverändert.

## Referenz-Methodik

Token-Benennung und -Pflege orientieren sich an etablierten Industrie-Konventionen:

- **W3C Design Tokens Community Group (DTCG)** Format als Referenz für Token-Struktur (typisierte Tokens, Aliasing/Referenzen zwischen Ebenen, Gruppen).
- **Style Dictionary** als Referenz-Ansatz, um ein Token-Set in mehrere Plattform-Ausgaben zu transformieren (CSS-Variablen, TS-Konstanten, …).

Diese Spec schreibt **kein** konkretes Tool und **kein** Build-Format verbindlich vor. Solange die Token-Namen die Quelle der Wahrheit bleiben und UI daraus ableitet, ist die Wahl des Generators (oder das Pflegen von Hand) offen. Ein späterer PR KANN ein DTCG-konformes Token-File und eine Style-Dictionary-artige Generierung einführen, ohne diese Spec zu brechen.

## Nicht-Ziele

Diese Spec definiert nicht:

- die konkreten OKLCH-Werte jeder Rolle (sie leben in `globals.css` und dürfen sich gestalterisch weiterentwickeln, solange die Rollen-Namen stabil bleiben),
- ein verbindliches Token-Build-Tool oder Dateiformat,
- Theming jenseits von Light/Dark und Space-Brand-Farbe (z.B. beliebige Multi-Theme-Engines),
- Spacing-/Sizing-Skalen (folgen Tailwind-Defaults; ein eigenes Spacing-Token-Set ist späterer Scope),
- Icon-Set und Asset-Pipeline.
