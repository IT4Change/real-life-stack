# UI/UX Design-Entscheidungen

Atomare Design-Entscheidungen für das @real-life-stack/toolkit.
Jede Checkbox repräsentiert eine einzelne, aktivierbare Entscheidung.

---

## Schatten

- [x] **shadow-card-xl**: Cards verwenden `--shadow-xl` (`--shadow-card: var(--shadow-xl)`)
- [ ] **shadow-card-lg**: Cards verwenden `--shadow-lg`
- [ ] **shadow-card-md**: Cards verwenden `--shadow-md`
- [ ] **shadow-card-sm**: Cards verwenden `--shadow-sm`
- [ ] **shadow-card-none**: Cards ohne Schatten

- [x] **shadow-navbar-xl**: Navbar verwendet `--shadow-xl` (`--shadow-navbar: var(--shadow-xl)`)
- [ ] **shadow-navbar-lg**: Navbar verwendet `--shadow-lg`
- [ ] **shadow-navbar-md**: Navbar verwendet `--shadow-md`
- [ ] **shadow-navbar-sm**: Navbar verwendet `--shadow-sm`
- [ ] **shadow-navbar-none**: Navbar ohne Schatten

- [x] **shadow-button-md**: Buttons verwenden `--shadow-md` (`--shadow-button: var(--shadow-md)`)
- [ ] **shadow-button-sm**: Buttons verwenden `--shadow-sm`
- [ ] **shadow-button-none**: Buttons ohne Schatten

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

- [x] **font-sans-montserrat**: Montserrat als Sans-Serif Hauptschrift
- [x] **font-serif-merriweather**: Merriweather als Serif-Schrift
- [x] **font-mono-source-code-pro**: Source Code Pro als Monospace-Schrift

---

## Farbschema

- [x] **color-scheme-green**: Grün-basiertes Theme (Primary: Grün)
- [ ] **color-scheme-blue**: Blau-basiertes Theme
- [ ] **color-scheme-purple**: Lila-basiertes Theme

- [x] **accent-monochrom**: Akzentfarbe aus gleicher Farbfamilie wie Primary
- [ ] **accent-contrast**: Kontrastierende Akzentfarbe

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
| 2026-01-10 | Grün-basiertes Farbschema |
| 2026-01-10 | Semantische Schatten-Variablen (--shadow-card, --shadow-navbar, --shadow-button) |
| 2026-01-10 | Dokumentation auf atomare Checkboxen umgestellt |
