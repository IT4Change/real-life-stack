# UI/UX Anforderungen

Diese Liste dokumentiert alle Design-Entscheidungen und Anforderungen für das @real-life-stack/toolkit Design System.

---

## Interaktive Elemente

### Cursor

- [ ] **Pointer auf klickbaren Elementen**: Alle interaktiven Elemente (Buttons, Links, Dropdown-Trigger, Menü-Items) zeigen `cursor: pointer`
- [ ] **Not-allowed bei disabled**: Deaktivierte Elemente zeigen `cursor: not-allowed`

### Fokus-Verhalten

- [ ] **Kein Fokusrahmen bei Mausklick**: Focus-Ring nur bei Keyboard-Navigation (`focus-visible`), nicht bei Mausklick (`focus`)
- [ ] **Konsistenter Focus-Ring**: Wenn sichtbar, dann mit `ring-2 ring-ring`

---

## Layout

### Navbar

- [ ] **Stabile Mitte**: Tabs in der Navbar-Mitte verschieben sich nicht wenn sich der Inhalt links/rechts ändert (feste Breiten für NavbarStart/NavbarEnd)
- [ ] **Glasmorphism**: Navbar hat `backdrop-blur` Effekt mit semi-transparentem Hintergrund

---

## Komponenten

### Cards

- [ ] **Kein Hover-Lift**: Cards bewegen sich nicht beim Hover (kein `hover:-translate-y`)
- [ ] **Subtile Schatten**: Cards haben dezente Schatten (`shadow-sm`)

### Workspace-Switcher

- [ ] **Eckige Logos**: Workspace-Avatare sind nicht rund (`rounded-none`)
- [ ] **Pointer Cursor**: Trigger und alle Items im Dropdown zeigen Pointer

### User-Menu

- [ ] **Runder Avatar**: User-Avatar bleibt rund (Standard-Avatar-Styling)
- [ ] **Pointer Cursor**: Trigger und alle Items zeigen Pointer

### Dropdown-Menüs (generell)

- [ ] **Pointer auf Items**: Alle `DropdownMenuItem` zeigen `cursor: pointer`
- [ ] **Kein Fokusrahmen auf Trigger**: Nach Auswahl kein sichtbarer Ring

---

## Farben & Theming

### Farbharmonie

- [ ] **Keine Farbkonflikte**: Primär- und Akzentfarben dürfen sich nicht "beißen" (z.B. kein Orange-Hover auf blauen Flächen)
- [ ] **Monochrom bevorzugt**: Akzentfarbe aus der gleichen Farbfamilie wie Primärfarbe (aktuell: Grün-basiertes Theme)

### Dark Mode

- [ ] **Vollständige Unterstützung**: Alle Komponenten funktionieren in Light und Dark Mode
- [ ] **CSS-Variablen**: Theme-Wechsel über `.dark` Klasse auf `<html>`

---

## Typografie

### Schriften

- [ ] **Sans-Serif**: Montserrat als Hauptschrift
- [ ] **Serif**: Merriweather für besondere Texte
- [ ] **Monospace**: Source Code Pro für Code

---

## Zukünftige Anforderungen

_Hier werden neue Anforderungen dokumentiert..._

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
| 2026-01-10 | Grün-basiertes Farbschema (kein Orange/Blau-Konflikt) |
