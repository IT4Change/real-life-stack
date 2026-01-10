# UI/UX Design-Entscheidungen

Atomare Design-Entscheidungen für das @real-life-stack/toolkit.
Jede Checkbox repräsentiert eine einzelne, aktivierbare Entscheidung.

---

## Schatten

- [ ] **shadow-card-xl**: Cards verwenden `--shadow-xl`
- [x] **shadow-card-lg**: Cards verwenden `--shadow-lg` (`--shadow-card: var(--shadow-lg)`)
- [ ] **shadow-card-md**: Cards verwenden `--shadow-md`
- [ ] **shadow-card-sm**: Cards verwenden `--shadow-sm`
- [ ] **shadow-card-none**: Cards ohne Schatten

- [ ] **shadow-navbar-xl**: Navbar verwendet `--shadow-xl`
- [ ] **shadow-navbar-lg**: Navbar verwendet `--shadow-lg`
- [x] **shadow-navbar-md**: Navbar verwendet `--shadow-md` (`--shadow-navbar: var(--shadow-md)`)
- [ ] **shadow-navbar-sm**: Navbar verwendet `--shadow-sm`
- [ ] **shadow-navbar-none**: Navbar ohne Schatten

- [ ] **shadow-button-xl**: Buttons verwenden `--shadow-xl`
- [ ] **shadow-button-lg**: Buttons verwenden `--shadow-lg`
- [ ] **shadow-button-md**: Buttons verwenden `--shadow-md`
- [ ] **shadow-button-sm**: Buttons verwenden `--shadow-sm`
- [x] **shadow-button-none**: Buttons ohne Schatten (`--shadow-button: none`)

---

## Cursor

- [x] **cursor-pointer-interactive**: Alle interaktiven Elemente zeigen `cursor: pointer`
- [x] **cursor-not-allowed-disabled**: Deaktivierte Elemente zeigen `cursor: not-allowed`

---

## Fokus-Verhalten

- [x] **focus-visible-only**: Focus-Ring nur bei Keyboard-Navigation, nicht bei Mausklick
- [x] **focus-ring-consistent**: Einheitlicher Focus-Ring mit `ring-ring/50`

---

## Navbar

- [x] **navbar-fixed-sections**: NavbarStart/NavbarEnd haben feste Breite (`w-56`) für stabile Mitte
- [x] **navbar-glass**: Navbar mit Glasmorphism (`backdrop-blur-12`, `bg-background/80`)
- [x] **navbar-sticky**: Navbar bleibt beim Scrollen oben (`sticky top-0`)

---

## Cards

- [x] **card-no-hover-lift**: Cards bewegen sich nicht beim Hover
- [x] **card-backdrop-blur**: Cards mit `backdrop-blur-sm` für Glaseffekt
- [x] **card-rounded-xl**: Cards mit `rounded-xl`
- [x] **card-border**: Cards mit Border
- [x] **card-bg-white**: Cards haben weißen Hintergrund (`oklch(1.00 0 0)`)

---

## Workspace-Switcher

- [x] **workspace-logo-square**: Workspace-Avatare sind eckig (`rounded-md` im Trigger, `rounded-none` im Dropdown)
- [x] **workspace-name-prominent**: Workspace-Name groß und prominent (`text-lg font-semibold`)
- [ ] **workspace-name-with-label**: Zweizeilig mit "Workspace" Label
- [x] **workspace-chevron-hidden-mobile**: Chevron-Icon nur auf Desktop sichtbar

---

## User-Menu

- [x] **user-avatar-round**: User-Avatar ist rund (Standard)
- [ ] **user-avatar-square**: User-Avatar ist eckig

---

## Dropdown-Menüs

- [x] **dropdown-cursor-pointer**: Alle Items zeigen `cursor: pointer`
- [x] **dropdown-trigger-no-outline**: Kein Fokusrahmen auf Trigger nach Auswahl

---

## Typografie

- [x] **font-sans-inter**: Inter als Sans-Serif Hauptschrift
- [ ] **font-sans-montserrat**: Montserrat als Sans-Serif Hauptschrift
- [x] **font-serif-merriweather**: Merriweather als Serif-Schrift
- [x] **font-mono-source-code-pro**: Source Code Pro als Monospace-Schrift

---

## Farbschema

- [ ] **color-scheme-green**: Grün-basiertes Theme (Primary: Grün)
- [x] **color-scheme-blue**: Blau-basiertes Theme (Primary: #2563eb / oklch(0.55 0.21 264))
- [ ] **color-scheme-purple**: Lila-basiertes Theme

- [x] **secondary-green**: Sekundärfarbe Grün (#22c55e / oklch(0.72 0.19 142))
- [ ] **secondary-monochrom**: Sekundärfarbe aus Primary-Familie

- [ ] **accent-amber**: Akzentfarbe Amber (#f59e0b / oklch(0.78 0.16 75))
- [x] **accent-monochrom**: Akzentfarbe aus Primary-Familie (Light: oklch(0.95 0.03 264), Dark: oklch(0.30 0.08 264))

- [x] **background-slate**: Slate-basierte Hintergrundfarben (slate-50 / oklch(0.98 0.01 247))
- [ ] **background-neutral**: Neutrale Grautöne

---

## Dark Mode

- [x] **dark-mode-supported**: Vollständige Dark Mode Unterstützung
- [x] **dark-mode-class-based**: Theme-Wechsel über `.dark` Klasse auf `<html>`

---

## Assets

- [x] **assets-base-path**: Logo-Pfade nutzen `import.meta.env.BASE_URL` für GitHub Pages Kompatibilität

---

## Changelog

| Datum | Änderung |
|-------|----------|
| 2026-01-10 | Initiale Dokumentation erstellt |
| 2026-01-10 | Cursor-Pointer für interaktive Elemente |
| 2026-01-10 | Focus-visible statt focus für Fokusrahmen |
| 2026-01-10 | Workspace-Logos eckig (nicht rund) |
| 2026-01-10 | Feste Breiten für NavbarStart/NavbarEnd |
| 2026-01-10 | Kein Hover-Lift auf Cards |
| 2026-01-10 | Semantische Schatten-Variablen (--shadow-card, --shadow-navbar, --shadow-button) |
| 2026-01-10 | Dokumentation auf atomare Checkboxen umgestellt |
| 2026-01-10 | **Theme-Wechsel auf Blau** (Landing Page Design) |
| 2026-01-10 | Font-Wechsel auf Inter |
| 2026-01-10 | Farbschema: Primary Blau, Secondary Grün, Accent Amber |
| 2026-01-10 | Schatten auf Tailwind-Standard (shadow-lg für Cards/Buttons, shadow-md für Navbar) |
| 2026-01-10 | Hintergrund auf Weiß (oklch(1.00 0 0)) |
| 2026-01-10 | Accent auf Blau-Familie umgestellt (keine Orange-Hover mehr) |
| 2026-01-10 | Button-Schatten deaktiviert (shadow-button: none) |
